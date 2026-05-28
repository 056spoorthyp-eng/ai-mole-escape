const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function callAssignNextSet() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assign_next_set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({})
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : data?.message || 'Supabase RPC failed.');
  }

  if (typeof data !== 'number') {
    throw new Error('Supabase RPC did not return a set number.');
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, message: 'Method not allowed.' });
    return;
  }

  try {
    const set = await callAssignNextSet();
    res.status(200).json({ ok: true, set });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message || 'Unable to assign next set.' });
  }
}
