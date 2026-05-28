const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      ok: false,
      message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    });
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/quiz_rotation?id=eq.1&select=next_set`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || 'Unable to read quiz_rotation.');
    }

    res.status(200).json({
      ok: true,
      next_set: Array.isArray(data) && data[0] ? data[0].next_set : null,
      mode: 'minimal-rotation'
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Health check failed.' });
  }
}
