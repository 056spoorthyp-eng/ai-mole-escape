import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'infoblox.com').toLowerCase();
const TOTAL_SETS = 12;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedEmail(email) {
  return email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_rotation (
      id INTEGER PRIMARY KEY,
      next_set INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_players (
      email TEXT PRIMARY KEY,
      session_token TEXT UNIQUE NOT NULL,
      assigned_set INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      score INTEGER,
      total_questions INTEGER,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO quiz_rotation (id, next_set)
    VALUES (1, 1)
    ON CONFLICT (id) DO NOTHING;
  `);
}

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT next_set FROM quiz_rotation WHERE id = 1');
    res.json({ ok: true, next_set: rows[0]?.next_set || 1 });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'database_error' });
  }
});

app.post('/api/start', async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email || !isAllowedEmail(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email', message: `Use your @${ALLOWED_EMAIL_DOMAIN} office email.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT email, session_token, assigned_set, completed_at FROM quiz_players WHERE email = $1 FOR UPDATE',
      [email]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.completed_at) {
        await client.query('COMMIT');
        return res.status(409).json({
          ok: false,
          error: 'already_played',
          message: 'This office email has already used the quiz.'
        });
      }

      await client.query(
        'UPDATE quiz_players SET last_seen_at = NOW() WHERE email = $1',
        [email]
      );
      await client.query('COMMIT');
      return res.json({
        ok: true,
        mode: 'resume',
        email: row.email,
        token: row.session_token,
        assignedSet: row.assigned_set
      });
    }

    const rotation = await client.query(
      'SELECT next_set FROM quiz_rotation WHERE id = 1 FOR UPDATE'
    );
    const assignedSet = rotation.rows[0]?.next_set || 1;
    const nextSet = assignedSet >= TOTAL_SETS ? 1 : assignedSet + 1;
    const token = crypto.randomUUID();

    await client.query(
      'INSERT INTO quiz_players (email, session_token, assigned_set) VALUES ($1, $2, $3)',
      [email, token, assignedSet]
    );

    await client.query(
      'UPDATE quiz_rotation SET next_set = $1, updated_at = NOW() WHERE id = 1',
      [nextSet]
    );

    await client.query('COMMIT');
    return res.json({
      ok: true,
      mode: 'new',
      email,
      token,
      assignedSet
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ ok: false, error: 'start_failed' });
  } finally {
    client.release();
  }
});

app.get('/api/session/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT email, assigned_set, completed_at, score, total_questions FROM quiz_players WHERE session_token = $1',
      [req.params.token]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const row = rows[0];
    return res.json({
      ok: true,
      email: row.email,
      assignedSet: row.assigned_set,
      completed: Boolean(row.completed_at),
      score: row.score,
      totalQuestions: row.total_questions
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'session_failed' });
  }
});

app.post('/api/complete', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const score = Number(req.body?.score);
  const totalQuestions = Number(req.body?.totalQuestions);

  if (!token) {
    return res.status(400).json({ ok: false, error: 'missing_token' });
  }

  try {
    const result = await pool.query(
      `UPDATE quiz_players
       SET completed_at = COALESCE(completed_at, NOW()),
           score = $2,
           total_questions = $3,
           last_seen_at = NOW()
       WHERE session_token = $1
       RETURNING email, assigned_set, completed_at, score, total_questions`,
      [token, Number.isFinite(score) ? score : null, Number.isFinite(totalQuestions) ? totalQuestions : null]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'complete_failed' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Payroll quiz app running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('DB init failed', error);
    process.exit(1);
  });
