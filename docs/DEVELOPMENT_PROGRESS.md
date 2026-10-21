# Development Progress

_Last updated: 2026-10-21, run 14 — approved homepage copy and site-wide copy cleanup (session `session_01DABSiCB2yNMA9QbADoheEi`)_

## Current status
| Field | Value |
|---|---|
| Phase | 1 complete; Phase 2/3 items in progress |
| Branch / PR | **PR #3 merged to `main`** 2026-10-21 19:56 UTC (merge `dd86938`). Follow-up work restarts `claude/stoic-planck-ojnqng` from `main` |
| GitHub Actions CI | ✅ lint · typecheck · 125 tests (incl. copy-style guard) · build |
| Cloudflare Workers Builds | ✅ **production build on `main` succeeded** (build `dc74be9e`, Worker Version `7b52857d`). ❌ non-production (PR branch) builds still fail; production is unaffected |
| PR previews | GitHub Actions `preview` uploads a Worker version per PR (alias `https://pr-<N>-auroraveritatis.agentkarlano.workers.dev`) and runs `scripts/smoke.sh` against it: real Workers runtime + live World Bank / USGS / GDACS. PR #4 at `fc94df6`: **14/14** |
| Production check | `smoke.yml` runs `scripts/smoke.sh` on aurorav.app after each merge to `main` (and on demand). After PR #4 (2026-10-21 20:29:57 UTC, Worker Version `c35ef040`): **14/14** |
| Scheduled tasks | Two exist, both disabled: "AV development (every 2h)" and the owner-created daily "Aurora Veritatis — Automated Development". Keep one. The 2-hourly one is **paused**: its runs had no repositories attached (read-only clone, push 403), so every run since 00:34 stopped without work. Owner must add both repos to the task in the Claude app, then re-enable |
| Next recommended action | Master directive order: B social sharing (OG/Story assets, /share), C full mobile audit with Playwright screenshot suite (320–1920 px), D bug/broken-button/security/status audit, E legal/contact/analytics soft-launch readiness. Blocked on owner: Supabase activation, data/imagery licences, billing |

## Decision (2026-10-20, delegated by owner)
The Vite + `@cloudflare/vite-plugin` foundation is the project foundation (PR #3). PRs #1 (esbuild) and #2 (same code,
older branch) are closed as superseded. PR #3 was opened from an older commit; run 3 restored the four later commits
(deploy fix, limits/intro/auth/timeline, Impact Radar + rebrand, references) on top as a fast-forward.

## Completed
### Run 14 (2026-10-21) — Approved homepage copy and site-wide copy cleanup
- Owner-approved homepage copy in `shared/copy.ts` (`HOME`), rendered verbatim and pinned by `shared/copy.test.ts`.
- Audited ~1,300 user-facing strings (TypeScript AST extraction). Removed em dashes from prose, fixed retired names
  ("Global Conflict Radar", "Markets Terminal"), unified "simulated" (no more "synthetic"/"demo data"), sentence-case titles,
  plainer Status page without internal jargon (phases, env var names), truthful plan features (planned items labelled),
  privacy text now mentions Brain storage (IndexedDB), theme-color no longer navy.
- `scripts/copyStyle.test.ts`: AST-based guard (no em dashes in prose, en dashes only in numeric ranges, no double hyphens,
  no hype phrases, no retired names).
- Mobile fixes found while checking: Home status labels overflowed at 320–390 px; Brain graph picker overflowed at 320 px.
  All 21 routes checked at 320 and 390 px: no horizontal overflow.

### Run 13 (2026-10-21, 22:13 UTC) — Personal Intelligence Brain
- `/brain`: local-first research graph (IndexedDB, no server copy). 12 node types, 9 typed relationships with direction,
  certainty, dates, notes and sources; SVG canvas (pan, wheel/pinch zoom, drag, drag-to-connect, keyboard), search,
  type filters, collapsible groups, saved views, force/by-type/timeline layouts (seeded d3-force), box-aware fit;
  node/edge inspectors; links to dossiers/ECB/CFTC/instruments; Add to Brain on dossier, Radar event, positioning, Macro.
- Strict JSON import, JSON + Obsidian Markdown export, delete with export-first; templates (relationships speculative).
- Quotas in `tiers.ts` (Free 1×10, Premium 3×100, Prime 15×500, Intelligence 50×2000; Premium during early access).
- Nav: Brain added; Impact Radar moved under Market Terminal header + footer (no wrapping at 1024–1440 px).
- Fixed during testing: unfitted new graphs (deferred fit), centre-only fit (box-aware), wheel scrolling the page.
- Verified: 118 unit tests; Playwright 39/39 (desktop + mobile touch, real IndexedDB); Macro 28/28, COT 22/22;
  preview smoke 21/21.
- Known limitation: on phones the whole graph is fitted, so labels start small (pinch to zoom).

### Run 12 (2026-10-21) — Macro & FX (ECB)
- **`/macro`** on the ECB Data Portal: policy rates (DFR, MRO, MLF) with last change; euro-area HICP headline + core vs
  2% target; 10-yr AAA yield; monetary-conditions chart; 15 euro reference rates (1d/1m/1y, sparklines) with a USD base
  (cross rates computed and labelled); series detail 2/10/25 yr; CSV with "Source: ECB statistics"; URL state.
- Worker `/api/macro`, `/api/macro/:id?years=N`: one combined SDMX request for FX, quote-aware CSV parser, blank values
  skipped, ECB 404 → no data, 3 h edge cache. Verified: 102 unit tests; Playwright 28/28 (+ positioning 22/22);
  live preview smoke 20/20 (all 21 ECB series keys returned).

### Run 11 (2026-10-21) — competitive benchmark + first increment
- `docs/COMPETITIVE_BENCHMARK.md`: feature matrix for World Monitor, Koyfin, TradingView, CFR, Conflictly, Trading 212 and
  the institutional/trade references (status, gaps, data licences, effort, value, cost, priority, evidence); ranked gaps.
- **Futures positioning (`/positioning`)** on CFTC Commitments of Traders (Legacy, futures only; Socrata `6dca-aqww`):
  14 markets; net speculators/commercials/small traders; weekly change; % of OI; 156-week positioning index, percentile,
  extremes; 3/10/20-year charts; CSV; shareable URL; method + limitations. Worker `/api/cot`, `/api/cot/:code?years=N`
  (6 h edge cache, defensive parsing). Verified: 92 unit tests, Playwright 22/22 (desktop + mobile, mocked API),
  live preview smoke 17/17 (all 14 CFTC codes returned).

### Run 10 (2026-10-21) — production verification
- `scripts/smoke.sh` + CI wiring: first real evidence that aurorav.app serves the full app (12/14 checks).
- **Fixed (production bug):** `/api/compare/:year` rejected every year in the Workers runtime — `COMPARE_YEARS` used
  `new Date()` at module scope, where the Workers clock reads as the epoch (max = 1969). Now computed per request.
- **Fixed (production bug):** GDACS returned HTTP 400 to our `geteventlist/MAP` query → documented `geteventlist/SEARCH`
  with a 30-day window; 25 s upstream timeout (edge-cached 30 min); empty (204) responses are "no events".
- Preview of PR #4 passes 14/14 live checks.

### Run 9 (2026-10-21) — production merge
- Production-readiness audit of PR #3: CI ✅, Actions preview upload ✅ (verified real upload, not a skip), `main` unprotected with no required checks, `wrangler.jsonc` builds before deploy.
- Fixed the preview workflow so a failed `wrangler versions upload` can no longer report success (`pipefail`), and surfaced the uploaded Worker Version ID.
- PR #3 merged by the owner (`dd86938`); the production Workers Build on `main` succeeded and created Worker Version `7b52857d`.

### Run 8 (2026-10-21)
- **Route metadata for search and link previews**: `shared/meta.ts` defines title/description/canonical/noindex per
  route (country dossiers named, legal drafts + account/sign-in + 404 noindex). Client hook keeps tags in sync on
  navigation; the Worker injects them server-side with HTMLRewriter so crawlers/preview bots that don't run JS see them.
- Found and fixed two Worker-runtime bugs during local workerd testing (neither visible to CI): the `ASSETS` binding was
  never declared (any non-/api request through the Worker would 500), and `i18n-iso-countries`' entry point crashes the
  Worker at startup → `shared/countryNames.ts` imports the data files directly.
- Merge decision: PR #3 **not merged** — it is the initial production release (not a routine change), its required
  Cloudflare check fails, and the production pipeline cannot deploy or be verified (see Blockers).
### Run 7 (2026-10-21)
- **GDACS disaster-alert layer**: Worker `/api/events/disasters` (cyclones, floods, volcanoes, droughts, wildfires;
  30-min edge cache; defensive parsing; unsafe report links never passed through) → Radar layer with "Estimate"
  provenance, HQ priority events and the Tension Index humanitarian input. Tested with representative payloads;
  live shape unverified from the sandbox.
- `plural()` helper; wording fixes.
- **Daily Briefing** HQ widget (rule-based, no AI): top events of the last 24 h, Tension Index level and 7-day change,
  largest watchlist movers; every line carries the weakest provenance of its inputs and links to its module; copy as
  text. New widgets slot into their default position for existing layouts; HQ grid uses dense packing.
### Run 6 (2026-10-21)
- **Cloud preference sync** (ready; activates when Supabase vars are set and the migration is applied): layout, hidden
  widgets, watchlist, favourites, alerts, chart settings and drawings sync to `user_preferences` for signed-in users.
  Newer side wins on sign-in (local change timestamp vs. row `updated_at`), debounced upserts (1.5 s), 60 KB guard,
  status on the Account page. **Research notes** sync via `research_notes` (merge by id on sign-in, then per-note
  upsert/delete). Known limitation: a note deleted on one device can return if another device that still has it signs in.
  Verified: 7 unit tests + Playwright against an intercepted Supabase API (pull of newer remote, single upsert with
  user_id + bearer token after a change; notes merged, local-only note uploaded, new note upserted, deleted note removed
  with a user-scoped DELETE). Not verified against a live Supabase project.
- **Side-by-side country comparison** (`/countries/vs?c=DEU,FRA`): up to 4 countries × 23 World Bank indicators with
  reference years and neutral magnitude bars; shareable URL; per-country error handling; entry points from the
  Countries page, every dossier ("Compare with…") and quick search.
### Run 5 (2026-10-21)
- **World Tension Index page** (`/tension`): published component definitions (categories, weights, saturation
  constants), adjustable weights (re-normalised), 7/14/30-day window, 90-day rolling history, weight-sensitivity
  robustness table (each weight halved/doubled, equal weights → range), measured-vs-modelled provenance table,
  methodology + calibration plan. `lib/tension.ts` refactored (`TENSION_COMPONENTS`, `normaliseWeights`,
  `tensionHistory`, `weightSensitivity`), fully unit-tested; HQ widget links to it.
- **Markets relative performance**: compare up to 3 instruments, rebased to 100 over the selected range, with return
  and correlation (ρ of daily log returns) per series; `rebase()` helper tested.
- Remaining "Conflict Radar" labels renamed to "Global Radar".
- **Backtesting** (Quant Research → Backtest tab, `/lab?tool=backtest`): MA crossover, RSI mean reversion, buy & hold;
  costs charged on capital per position change; equity vs. buy & hold; return, CAGR, vol, Sharpe, drawdown, trades,
  exposure. `lib/backtest.ts` tested incl. a look-ahead test (tampering with future prices never changes past signals).
### Run 4 (2026-10-21)
- Diagnosed the idle scheduled task (no repo sources → push denied) and paused it to stop wasted runs.
- **Quick search** (Ctrl/⌘+K, "/", header button, mobile): pages, all countries, instruments; ranked matches; keyboard nav.
- **Mobile bottom navigation** (HQ, Radar, Countries, Markets, Search).
- **Chart workspace**: horizontal levels and two-point trend lines saved per instrument; chart style, indicators and
  range remembered; zoom kept when drawings change. Fixed: quick second clicks were swallowed by the chart library →
  native click handling.
- **Strategy Lab** (`/strategy`): event scenarios (probability, timing, size, uncertainty) vs. no-event baseline using
  common random numbers; fan overlay, distribution overlay (out-of-range share disclosed), two-branch scenario tree,
  comparison table (up to 4); 5 templates linked to Impact Radar channels. Engine: `simulateGbm` `jump` option (tested).
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

## Verification (run 8)
- 81/81 tests. workerd preview + curl: per-route `<title>`/description/canonical/og:url, `noindex` on /account,
  /legal/*, unknown paths; CSP + X-Frame-Options still applied; `/assets/*` 200 with immutable caching; favicon, brand
  PNG, /api/health OK. `wrangler deploy --dry-run` (no build cmd / build first) and `versions upload --dry-run` OK.
  Browser regression suites (palette, drawings, Strategy Lab, Tension, comparison, mobile) pass; client-side title/
  canonical/robots update on navigation.

## Verification (run 5)
- `npm run check`: 54/54 tests ✅. Playwright: tension reading 46.1 → weights change it → reset restores; 30-day window;
  history chart + 6-row sensitivity table; HQ link → /tension; Markets compare GOLD.D + SHIP.D with ρ, removal;
  mobile /tension and /markets no overflow; 0 console errors. Backtest tab: SMA 20/50 vs RSI results, validation,
  tab switching, mobile no overflow.

## Verification (run 4)
- `npm run check`: 48/48 tests ✅. Playwright: palette Ctrl+K→/countries/DEU, "/"→/markets?symbol=GOLD.D; level + trend
  drawn, persisted after reload, removable; RSI setting persisted; Strategy templates, comparison (2 rows), validation;
  mobile no overflow on /, /strategy, /markets; bottom nav + mobile search; 0 console errors.

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
0. Scheduled task: add `agentkarlano-stack/AuroraVeritatis` and `agentkarlano-stack/AuroraVeritatis-Knowledge` as
   repositories of "AV development (every 2h)" in the Claude app (Routines), then re-enable it.
1. Cloudflare → Workers & Pages → `auroraveritatis` → Settings → Builds: open the failed log; reconnect the Git
   integration / build token. Working settings: build `npm run build` (or empty), deploy `npx wrangler deploy`,
   non-production `npx wrangler versions upload`.
2. Optional tokens for new data layers: Cloudflare Radar (outages), UCDP (conflict events).

## Next recommended actions (dev)
1. Verify sync on a live Supabase project once configured (apply migration, set Worker vars).
2. CFR-style conflict profile pages (trend / impact / sourced timeline) — needs a licensed source (UCDP token or curated).
3. Chart workspace follow-up: named saved layouts.
4. Cloudflare Radar outages → "Communications" dossier section (needs token).
