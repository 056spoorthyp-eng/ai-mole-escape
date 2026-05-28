import { createClient } from '@supabase/supabase-js';

export const TOTAL_SETS = 12;
export const ALLOWED_EMAIL_DOMAIN = 'infoblox.com';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isAllowedEmail(email) {
  return email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function getMissingServerEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

export function getSupabaseAdmin() {
  const missing = getMissingServerEnv();
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(', ')}`);
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export async function getCurrentRotation(supabase) {
  const { data, error } = await supabase.from('quiz_rotation').select('id,next_set').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: inserted, error: insertError } = await supabase
    .from('quiz_rotation')
    .insert({ id: 1, next_set: 1 })
    .select('id,next_set')
    .single();
  if (insertError) throw insertError;
  return inserted;
}
