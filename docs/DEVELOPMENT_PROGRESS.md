# Development Progress

_Last updated: 2026-10-20 (session `session_01DABSiCB2yNMA9QbADoheEi`)_

## ⚠️ Parallel foundation — owner decision required
Two independent Phase 1 foundations were built at the same time:
- **PR #1** `dev/v0.1-foundation`: esbuild build, driven by the scheduled task "AV development (every 2h)".
- **This branch** `claude/phase1-foundation` (draft PR): Vite + `@cloudflare/vite-plugin`, Lightweight Charts, Monte Carlo lab, live USGS layer.

Only one should continue. Until the owner chooses, the scheduled task keeps working on `dev/*` (PR #1), and this branch receives no further work.

## Current phase
Phase 1 — Foundation: complete on this branch, pending review.

## Completed
- Vite 8 + React 19 + TS 6 + Tailwind 4 SPA, served by Worker `auroraveritatis` (`wrangler.jsonc`, `keep_vars`, SPA fallback, `/api/*` run-worker-first)
- Branding: flat AV monogram (shared A/V stroke), wordmark, favicon, navy/gold/platinum tokens
- Home, Headquarters (7 widgets, reorder/hide/reset, watchlist, favourites, alerts, notes), Conflict Radar, Countries + Dossier, Markets, Research Lab, Plans, Sign-in, Account, Status, 7 draft legal pages, 404
- Worker API: `/api/health`, `/api/config`, `/api/countries/:iso3`, `/api/countries/:iso3/series/:indicator`, `/api/events/earthquakes`; edge cache, rate limit, validation, security headers
- Supabase auth provider (magic link, password, sign-up) enabled by Worker vars; RLS migration (not applied)
- 25 Vitest tests; ESLint (React Compiler rules) clean; CI workflow

## Verification (this session)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` ✅ 25/25 · `npm run build` ✅
- `vite preview` (workerd): API routes, SPA fallback and CSP headers verified with curl
- Playwright (Chromium), 13 routes × desktop 1440px + mobile 390px: no horizontal overflow, no console errors besides the
  expected 502s from blocked upstreams; HQ hide/add, Lab rerun + validation, Markets RSI pane, Radar drawer + filter,
  mobile menu verified. Data-filled dossier/radar UI verified with mocked API responses.

## Known defects / unverified
- Live World Bank and USGS calls not verified (sandbox egress blocked) — unit-tested with mocked payloads only.
- Cloudflare Workers Builds result for this branch unknown (dashboard-only logs).
- Rate limiter is per-isolate (best effort).
- `index` chunk ≈ 278 kB (89 kB gzip); could split further.

## Required environment variables (names only)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTHOG_KEY`, `POSTHOG_HOST`, `ENVIRONMENT` (optional). Secret: `RESEND_API_KEY` (unused).

## Latest successful build
2026-10-20, local: lint + typecheck + 25 tests + `vite build` on commit `879e89c` + this docs commit.

## Branch / PR
`claude/phase1-foundation` → draft PR against `main` (see PR list).

## Decision (2026-10-20, delegated by owner)
The Vite + `@cloudflare/vite-plugin` foundation (PR #2) is the project foundation. PR #1 (esbuild) is closed as superseded.
Local `npm run build`, `wrangler deploy --dry-run` and `wrangler versions upload --dry-run` pass. The Workers Builds check failed
within a second of starting, which points to dashboard build settings rather than code; the log is dashboard-only.

## Next recommended action
1. **Owner (dashboard only)**: Workers & Pages > auroraveritatis > Settings > Builds: build `npm run build`, deploy `npx wrangler deploy`,
   non-production deploy `npx wrangler versions upload`, Node 22 (`.nvmrc`). Paste the failing log if it still fails.
2. Verify `/api/countries/DEU` and `/api/events/earthquakes` on a Cloudflare preview.
3. Then Phase 2 per docs/ROADMAP.md.
