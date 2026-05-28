import { getSupabaseAdmin, json } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    const token = String(req.body?.token || '').trim();
    const score = Number(req.body?.score);
    const totalQuestions = Number(req.body?.totalQuestions);
    if (!token) return json(res, 400, { ok: false, error: 'missing_token' });

    const supabase = getSupabaseAdmin();
    const payload = {
      completed_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      score: Number.isFinite(score) ? score : null,
      total_questions: Number.isFinite(totalQuestions) ? totalQuestions : null
    };

    const { data, error } = await supabase
      .from('quiz_players')
      .update(payload)
      .eq('session_token', token)
      .select('email, assigned_set')
      .maybeSingle();

    if (error) throw error;
    if (!data) return json(res, 404, { ok: false, error: 'not_found' });

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'complete_failed', detail: error.message });
  }
}
