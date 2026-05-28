import crypto from 'crypto';
import { getSupabaseAdmin, getCurrentRotation, normalizeEmail, isAllowedEmail, json, TOTAL_SETS, ALLOWED_EMAIL_DOMAIN } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isAllowedEmail(email)) {
      return json(res, 400, { ok: false, error: 'invalid_email', message: `Use your @${ALLOWED_EMAIL_DOMAIN} office email.` });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from('quiz_players')
      .select('email, session_token, assigned_set, completed_at')
      .eq('email', email)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      if (existing.completed_at) {
        return json(res, 409, { ok: false, error: 'already_played', message: 'This office email has already used the quiz.' });
      }

      await supabase.from('quiz_players').update({ last_seen_at: new Date().toISOString() }).eq('email', email);
      return json(res, 200, {
        ok: true,
        mode: 'resume',
        email: existing.email,
        token: existing.session_token,
        assignedSet: existing.assigned_set
      });
    }

    const rotation = await getCurrentRotation(supabase);
    const assignedSet = rotation.next_set || 1;
    const nextSet = assignedSet >= TOTAL_SETS ? 1 : assignedSet + 1;
    const token = crypto.randomUUID();

    const { error: insertError } = await supabase.from('quiz_players').insert({
      email,
      session_token: token,
      assigned_set: assignedSet
    });
    if (insertError) throw insertError;

    const { error: updateError } = await supabase.from('quiz_rotation').update({
      next_set: nextSet,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
    if (updateError) throw updateError;

    return json(res, 200, { ok: true, mode: 'new', email, token, assignedSet });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'start_failed', detail: error.message });
  }
}
