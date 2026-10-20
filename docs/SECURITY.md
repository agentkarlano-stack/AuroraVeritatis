# Security

## Secrets
- Nothing secret is committed. `.dev.vars`, `.env*` and `dist/` are git-ignored.
- The browser only receives the public Supabase URL and anon key, through `/api/config`.
- The `service_role` key must never be used in this codebase's client or `vars`. Server-side secrets use `wrangler secret put`.

## Data access
- Every user table has Row Level Security; users can access only their own rows.
- `profiles.plan` cannot be changed by end users (trigger `guard_profile_plan`). Only trusted server code (future billing webhook with the service role) may change it.
- The `hq` preferences JSON is size-limited (16 KB).

## Web
- `public/_headers`: CSP (`default-src 'self'`, `connect-src` limited to self and `*.supabase.co`), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies.
- The API accepts `GET` only for now; other methods get 405. JSON responses are `no-store` unless explicitly cacheable.
- Upstream failures are cached for at most 60 seconds.
- Quant Lab CSV data is processed in the browser and never uploaded.

## Process
- Production deploys need a reviewed, merged PR and the owner's approval. Workers Builds is connected to this repo, so **merging to `main` may trigger a production deploy**; treat merge as release approval.
- Report vulnerabilities privately to the project owner, not in public issues.

## Before public launch (tracked)
- Supabase redirect handling (AV-004); rate limiting on future write/AI endpoints; dependency audit; privacy policy and terms.
