# Payroll Quiz – Vercel + Supabase

## 1) Supabase SQL already run
Make sure these tables exist:
- quiz_rotation
- quiz_players

## 2) Vercel environment variables
Add these in Vercel Project Settings → Environment Variables:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ALLOWED_EMAIL_DOMAIN=infoblox.com

## 3) Deploy
Import this repository into Vercel and deploy.

## 4) Test
- /api/health
- main page email entry
- one-play-per-email behavior
