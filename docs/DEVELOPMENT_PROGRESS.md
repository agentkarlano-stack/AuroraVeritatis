# Development Progress

_Last updated: 2026-10-21, run 7 (session `session_01DABSiCB2yNMA9QbADoheEi`)_

## Current status
| Field | Value |
|---|---|
| Phase | 1 complete; Phase 2/3 items in progress |
| Branch / PR | `claude/stoic-planck-ojnqng` → **PR #3** (the chosen foundation) |
| GitHub Actions CI | ✅ lint · typecheck · 76 tests · build |
| Cloudflare Workers Builds | ❌ fails in 0 s on every commit of every branch (before clone) → dashboard/Git-connection issue |
| Preview URL | none yet (Workers Builds failing; Actions preview workflow needs `CLOUDFLARE_API_TOKEN`) |
| Scheduled tasks | Two exist, both disabled: "AV development (every 2h)" and the owner-created daily "Aurora Veritatis — Automated Development". Keep one. The 2-hourly one is **paused**: its runs had no repositories attached (read-only clone, push 403), so every run since 00:34 stopped without work. Owner must add both repos to the task in the Claude app, then re-enable |
| Next recommended action | Owner: fix Workers Builds (or add token). Dev: Supabase preference sync; CFR-style conflict profiles; chart workspace |

## Decision (2026-10-20, delegated by owner)
The Vite + `@cloudflare/vite-plugin` foundation is the project foundation (PR #3). PRs #1 (esbuild) and #2 (same code,
older branch) are closed as superseded. PR #3 was opened from an older commit; run 3 restored the four later commits
(deploy fix, limits/intro/auth/timeline, Impact Radar + rebrand, references) on top as a fast-forward.

## Completed
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
