# Payroll Quiz Render App

This starter app assigns quiz sets in the backend, allows one play per office email, and serves a single-screen phone UI.

## Local run

1. Create a Postgres database.
2. Set `DATABASE_URL` and `ALLOWED_EMAIL_DOMAIN`.
3. Run:

```bash
npm install
npm start
```

## Deploy on Render

- Push this folder to GitHub.
- Create a new Blueprint in Render.
- Point it to the repository.
- Render will create the web service and Postgres database from `render.yaml`.
