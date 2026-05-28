# Payroll Quiz – Vercel + Supabase

## Vercel environment variables
Add only these in Vercel Project Settings → Environment Variables:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Do not add ALLOWED_EMAIL_DOMAIN. The app is hardcoded to infoblox.com.

## Test
1. Open /api/health
2. Confirm it returns ok:true
3. Open the main page and enter an @infoblox.com email
