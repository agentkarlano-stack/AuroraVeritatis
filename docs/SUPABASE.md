# Supabase setup

## 1. Create the project

- Plan: **Free**. Region: an EU region (for example Frankfurt `eu-central-1`) for European users.
- Note the **Project URL** and **anon public key** (Settings → API). Both are safe to expose to browsers.
- Do **not** use the `service_role` key anywhere in this repo or the browser.

## 2. Apply the schema

Either paste `supabase/migrations/0001_initial_schema.sql` into the SQL editor, or with the Supabase CLI:

```bash
supabase link --project-ref YOUR-REF
supabase db push
```

This creates:

| Table | Purpose | Access |
|---|---|---|
| `profiles` | Display name, plan, preferred agent. Auto-created on sign-up by trigger. | Owner read/update. Plan changes are blocked for end users by a trigger. |
| `user_preferences` | Headquarters layout JSON (`hq`) | Owner only |
| `watchlists`, `watchlist_items` | Country and instrument lists | Owner only (items via list ownership) |
| `plan_limits` | Proposed tier limits | Public read |

## 3. Auth settings

- Authentication → URL configuration: set **Site URL** to `https://aurorav.app` and add `http://localhost:8787` plus your `workers.dev` URL to **Redirect URLs**.
- Email confirmation can stay on. The UI handles the "confirm your email" state.
- **Email delivery via Resend (free tier):** Authentication → Emails → SMTP settings, host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key. Verify `aurorav.app` in Resend first. This replaces Supabase's rate-limited default sender.

## 4. Connect the app

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker variables (see `DEPLOYMENT.md`), or in `.dev.vars` locally. `/api/config` then reports `features.auth: true` and the Account page enables itself.

## Client implementation note

`src/client/lib/supabase.ts` calls the Auth (`/auth/v1/*`) and PostgREST (`/rest/v1/*`) endpoints directly. If we later need realtime, storage or OAuth providers, swap in `@supabase/supabase-js`. The `AuthProvider` interface stays the same.
