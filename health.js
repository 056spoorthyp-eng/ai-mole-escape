import { getSupabaseAdmin, getCurrentRotation, getMissingServerEnv, json } from './_lib.js';

export default async function handler(_req, res) {
  try {
    const missing = getMissingServerEnv();
    if (missing.length) {
      return json(res, 500, { ok: false, error: 'missing_env', missing });
    }

    const supabase = getSupabaseAdmin();
    const rotation = await getCurrentRotation(supabase);
    return json(res, 200, { ok: true, next_set: rotation.next_set, allowed_domain: 'infoblox.com' });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'server_error', detail: error.message });
  }
}
