# Development Progress

_Last updated: 2026-10-20, run 3 (session `session_01DABSiCB2yNMA9QbADoheEi`)_

## Current status
| Field | Value |
|---|---|
| Phase | 1 complete; Phase 2/3 items in progress |
| Branch / PR | `claude/stoic-planck-ojnqng` → **PR #3** (the chosen foundation) |
| GitHub Actions CI | ✅ lint · typecheck · 37 tests · build |
| Cloudflare Workers Builds | ❌ fails in 0 s on every commit of every branch (before clone) → dashboard/Git-connection issue |
| Preview URL | none yet (Workers Builds failing; Actions preview workflow needs `CLOUDFLARE_API_TOKEN`) |
| Scheduled task | "AV development (every 2h)" — see DEVELOPMENT_STATUS.md in the Knowledge repo for its current state |
| Next recommended action | Owner: fix Workers Builds (or add token). Dev: Supabase preference sync; CFR-style conflict profiles; chart workspace |

## Decision (2026-10-20, delegated by owner)
The Vite + `@cloudflare/vite-plugin` foundation is the project foundation (PR #3). PRs #1 (esbuild) and #2 (same code,
older branch) are closed as superseded. PR #3 was opened from an older commit; run 3 restored the four later commits
(deploy fix, limits/intro/auth/timeline, Impact Radar + rebrand, references) on top as a fast-forward.

## Completed
### Run 3
- Restored run-2 work onto PR #3 (verified: tree identical to the previous tip plus `docs/REFERENCES.md`).
- **Compare countries** (`/countries/compare`): Gapminder-style animated bubble chart on World Bank data —
  any two indicators + bubble size, log/linear, year slider + play (prefetches next year), region filters, hover
  details, click-through to dossiers. Worker endpoint `/api/compare/:year` (economies only, aggregates excluded,
  validated, edge-cached 24 h).
- Homepage + nav restructured to the owner's six-module map (Global Radar, Market Terminal, Country Dossiers, Quant
  Research, AI Intelligence [planned], Headquarters). Competitor names are not shown publicly.
- `docs/REFERENCES.md`: single merged reference doc (module map, patterns per benchmark, data-licence status).
### Run 2
Deploy config fix, Actions preview workflow, entitlements/plan limits, intro animation, password recovery, Radar
timeline, Market Impact Radar, rebrand to the owner's logo (charcoal + gold), brand master files.
### Run 1
Phase 1 foundation: Home, Headquarters, Conflict Radar, Country dossiers, Markets, Research Lab, Plans, Sign-in/Account,
Status, legal drafts, Worker API, RLS migration, CI, docs.

## Verification (run 3)
- `npm run check`: lint ✅ · typecheck ✅ · 37/37 tests ✅ · build ✅
- Playwright (mocked `/api/compare`): 20 bubbles render; hover tooltip; region filter 20→18; slider → 2000; play
  advances 2000→2002; axis change; click → `/countries/DEU`; mobile no overflow; 0 console errors.

## Known defects / unverified
- Live World Bank / USGS responses unverified (sandbox egress blocked; mocked tests only).
- Workers Builds failing (external). Per-isolate rate limiting only. Plan limits client-side until Supabase sync.

## Required environment variables (names only)
Worker vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTHOG_KEY`, `POSTHOG_HOST`, `ENVIRONMENT` (optional).
Worker secret: `RESEND_API_KEY` (unused). GitHub (preview workflow): secret `CLOUDFLARE_API_TOKEN`, variable `CLOUDFLARE_ACCOUNT_ID`.
Future: `CLOUDFLARE_RADAR_TOKEN` (internet outages), `UCDP_TOKEN`.

## Blockers (owner)
1. Cloudflare → Workers & Pages → `auroraveritatis` → Settings → Builds: open the failed log; reconnect the Git
   integration / build token. Working settings: build `npm run build` (or empty), deploy `npx wrangler deploy`,
   non-production `npx wrangler versions upload`.
2. Optional tokens for new data layers: Cloudflare Radar (outages), UCDP (conflict events).

## Next recommended actions (dev)
1. Supabase preference sync (when Supabase vars are set).
2. CFR-style conflict profile pages (trend / impact / sourced timeline) — needs a licensed source (UCDP token or curated).
3. TradingView-style chart workspace: symbol search, drawing tools, saved layouts.
4. Cloudflare Radar outages → "Communications" dossier section (needs token).
