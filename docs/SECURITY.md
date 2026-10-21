# Security

- **Secrets**: never in git. `.dev.vars`/`.env*` are gitignored. Production secrets are Cloudflare Worker secrets.
  `/api/config` exposes only public values (Supabase URL + anon key, PostHog project key).
- **Headers**: `public/_headers` sets CSP (`script-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`. API responses set the same baseline headers.
  Extend `connect-src` when adding new client-side origins.
- **API hardening**: GET-only, strict input validation (ISO3 regex, indicator allow-list), upstream timeouts,
  per-isolate token-bucket rate limit (60 burst, 1 req/s). Upgrade path: Workers Rate Limiting binding.
- **Auth**: Supabase PKCE flow. Authorisation must be enforced in Postgres RLS (see migration) and in Worker routes for
  any privileged action — never only in the UI.
- **Admin / AI Operations HQ** (future): owner-only, verified server-side via Supabase JWT + role claim; no public routes.
- **Privacy**: guests' data stays in localStorage; Account page offers export and deletion. Analytics only with consent.
- **Separation**: no shared resources with MARVETO.

Report vulnerabilities to auroraveritatissup@gmail.com.

## Supabase schema review (2026-10-21)
- Column-level `REVOKE` does not override a table-level grant. Supabase grants ALL on new public tables to `anon` and
  `authenticated`, so restricted columns need a table-level revoke plus explicit column grants.
- Guests have no privileges on user tables; every policy is scoped `to authenticated` and checks `(select auth.uid())`.
- Security-definer functions use `set search_path = ''` and are not executable by guests.
- `scripts/test-migrations.sh` (CI job `migrations`) proves the rules with two accounts on every PR.
