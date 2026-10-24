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
- **Administrator role**: membership in `aurora_private.admins` (not exposed by the Data API), inserted only by the
  owner's SQL bootstrap for their own confirmed account (never guessed, never the first or newest account). Every admin
  function is `SECURITY DEFINER` in `aurora_private`, starts with `require_admin()` (raises 42501 otherwise) and writes
  `admin_audit`; the browser only sees `my_entitlements().is_admin` for display. Tested with three users in
  `supabase/tests/admin.sql`. The `/admin` page is noindex and disallowed in robots.txt; hiding it is not the protection.
- **AI Operations HQ** (future): same server-side admin check; no public routes.
- **Integrations**: `TWELVE_DATA_API_KEY` and `BREVO_API_KEY` are Worker secrets used only server side; errors are redacted;
  `/api/integrations` reports configuration flags, never values. Market prices stay private (HTTP 451) until
  `MARKET_DATA_DISPLAY=licensed`. Newsletter POSTs accept same-origin JSON only, with honeypot and rate limits;
  unsubscribe and deletion require a signed, expiring link.
- **Privacy**: guests' data stays in localStorage; Account page offers export and deletion. Analytics only with consent.
- **Separation**: no shared resources with MARVETO.

Report vulnerabilities to auroraveritatissup@gmail.com.

## Sessions and account sharing (2026-10-24, migration 20261024000000)
- **Session registry:** Supabase Auth's own `auth.sessions` (one row per signed-in device; the access token carries its `session_id`). Users see their devices through `my_sessions()`: browser and operating system from the user agent, sign-in time and last activity. **No IP addresses, locations or fingerprinting.**
- **Revoking:**
  - "Sign out" on one device: `revoke_my_session` deletes that session, and its refresh tokens go with it.
  - "Sign out of other devices": Supabase `signOut({ scope: 'others' })`.
  - A lost device is handled with "Sign out of other devices" plus a password change.
- **Token window, documented:** an access token issued before a revocation stays cryptographically valid until it expires (Supabase default 1 hour). Mitigations:
  - `my_entitlements()` and every admin function check `session_active()`, so a revoked device drops to Free and loses admin rights at once.
  - The app checks `session_status()` every 2 minutes and on focus, then signs out locally with an explanation.
  - Row-level security on the user's own notes and preferences is unchanged, so a revoked device can read its own data until the token expires. That data belongs to the same person, so this is acceptable.
  - Any future paid API must call `session_active()` server side.
- **One-device rule (optional, off by default, admin switch, audited):**
  - For paid individual plans, the newest interactive sign-in (`claim_session`) signs out the other sessions, and the displaced device is told why.
  - Tabs of one browser share a session, so they are unaffected.
  - Free accounts are never limited; organisation seats will be named users.
  - IP changes and mobile data never sign anyone out.
- **Tests:** `supabase/tests/sessions.sql` in the `migrations` CI job.

## Supabase schema review (2026-10-21)
- Column-level `REVOKE` does not override a table-level grant. Supabase grants ALL on new public tables to `anon` and
  `authenticated`, so restricted columns need a table-level revoke plus explicit column grants.
- Guests have no privileges on user tables; every policy is scoped `to authenticated` and checks `(select auth.uid())`.
- Security-definer functions use `set search_path = ''` and are not executable by guests.
- `scripts/test-migrations.sh` (CI job `migrations`) proves the rules with two accounts on every PR.
