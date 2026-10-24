# CLAUDE.md — Aurora Veritatis

Instructions for AI development sessions (Claude Code, scheduled routines). Read this first, then
`docs/DEVELOPMENT_PROGRESS.md`. The owner's standing directive ("Continue" protocol, priorities A–H, approved
homepage copy, writing rules, beta checklist) is `MASTER-DIRECTIVE.md` in the Knowledge repository; owner to-dos are
`OWNER-ACTIONS.md` there.

## Session protocol
1. `git fetch` and check open PRs on `agentkarlano-stack/AuroraVeritatis`; continue the open development PR's branch
   rather than starting a parallel one.
2. Read `docs/DEVELOPMENT_PROGRESS.md` ("Next recommended action") and avoid redoing completed work.
3. Implement one achievable task end-to-end. Run `npm run check` before every commit; never commit failing checks.
4. Update `docs/DEVELOPMENT_PROGRESS.md` here **and** `DEVELOPMENT_STATUS.md` in
   `agentkarlano-stack/AuroraVeritatis-Knowledge` (completed, current tasks, commits, build result, blockers, next steps).
5. Push and open/update the PR. Never push directly to `main`.

## Hard rules
- No secrets in git (use Cloudflare Worker secrets / `.dev.vars`). Never print secret values.
- Never touch MARVETO repositories, databases, or its Stripe account.
- No paid services, purchases, live Stripe products or production DB migrations without owner approval.
- Never fabricate data. Every datum carries a provenance: `confirmed | estimate | unverified | simulated`
  (`shared/types.ts`). Demo data must be visibly labelled "Simulated" and demo instruments end in `.D`.
- No investment advice or promised returns in UI copy.
- Every visible control must work or be explicitly marked unavailable (`<Unavailable>` component, disabled buttons).

## Product references
Owner benchmarks, platform map, what to learn from each and data-licence notes: `docs/REFERENCES.md`. Patterns only — never copy their branding, text or data.

## Codebase map
- `worker/` — Cloudflare Worker: `/api/*` routes (`index.ts`), upstream clients (`worldbank.ts`, `usgs.ts`, `gdacs.ts`),
  edge caching, per-IP rate limiting, route metadata injection (`meta.ts`). Assets via the `ASSETS` binding (SPA fallback).
- `shared/meta.ts` — per-route title/description/canonical/noindex used by both the Worker and `src/lib/useMeta.ts`.
- `shared/` — types and indicator catalogue used by both worker and client.
- `src/pages/` — one lazy-loaded page per route; `src/components/` — UI (`ui.tsx` primitives, `WorldMap`, `chart/` (chart editor), `SvgCharts`).
- `src/lib/` — pure logic with unit tests (Monte Carlo, technical indicators, tension index, synthetic market data).
- `src/store/prefs.ts` — Zustand store persisted to localStorage (layout, watchlist, alerts, notes, chart settings, drawings;
  to be synced to Supabase `user_preferences`).
- Quant Research Lab (`pages/Lab.tsx`, tabs Monte Carlo | Backtest | Portfolio risk): portfolio VaR/expected shortfall
  (historical, normal, Monte Carlo), Euler contributions and Kupiec backtest in `lib/risk.ts` + `components/RiskTool.tsx`
  (real World Bank monthly commodities or simulated `.D` daily).
- Strategy Lab (`pages/Strategy.tsx`) uses `simulateGbm` with a `jump` and `lib/scenario.ts`; quick search is
  `components/CommandPalette.tsx` + `lib/search.ts`.
- Cloud sync: `lib/sync.ts` (backend-agnostic, tested) + `auth/PrefsSync.tsx` (subscribes to the prefs store, newer side
  wins on sign-in, debounced upserts). Synced keys are `SYNCED_KEYS`; notes sync per row via `research_notes`.
- Personal Intelligence Brain (`pages/Brain.tsx`, `components/BrainCanvas.tsx`): pure model + import/export in `lib/brain.ts`,
  IndexedDB persistence in `lib/brainStore.ts` (local-first, no server copy), layouts in `lib/brainLayout.ts` (d3-force,
  seeded), Aurora entity links + "Add to Brain" in `lib/brainEntities.ts` / `components/AddToBrain.tsx`. Quotas:
  `brainLimits()` in `lib/entitlements.ts`. Risk scale and documented auto-risk methods: `lib/brainRisk.ts` (automatic
  risk only from a method listed in `RISK_METHODS`; the user's `risk` never overwrites `autoRisk`). Undo/redo:
  `lib/history.ts`. Node intelligence panel: `components/brain/NodeIntel.tsx`. Unsaved edits are stashed to
  localStorage on unload (`stashPending`/`recoverPending`) because IndexedDB writes started during unload are aborted.
- `supabase/migrations/` — SQL, reviewed and applied manually by the owner (initial schema applied 2026-10-22; deletion
  hardening `20261022…` pending). `supabase/tests/rls.sql` + `scripts/test-migrations.sh` (CI job `migrations`) apply them
  twice on a Supabase stub and run the two-account RLS test.
- Accounts are live (Supabase project `oscdwaeofqdiwcnxsich`). `e2e/live/auth.ts` (`live-auth.yml`) is the real-browser,
  real-email end-to-end test; it runs on PR previews labelled `live-auth` (3 real emails per run; Supabase hourly and Resend 100/day limits) and on demand against production. Local data
  belongs to one account at a time (`auth/localAccount.ts`); changes during the first sync are uploaded afterwards.
- Sessions (`supabase/migrations/20261024000000_sessions.sql`, `lib/sessions.ts`, `auth/SessionGuard.tsx`,
  `components/account/DevicesPanel.tsx`): device list from `auth.sessions` (no IPs), revoke one or all others,
  `session_active()` gates entitlements/admin (JWT window documented in docs/SECURITY.md), optional one-device rule for
  paid plans (admin switch, off by default). Test locally: Postgres 16 at /usr/lib/postgresql/16/bin (initdb as user
  `postgres` in /var/tmp), then `PGHOST=/var/tmp PGPORT=5433 PGUSER=postgres bash scripts/test-migrations.sh`.
- Subscriptions (`supabase/migrations/20261024000100_subscriptions.sql`, `lib/billing.ts`, `components/account/SubscriptionPanel.tsx`):
  1/3/6/12-month periods (provisional 0/5/10/15% discounts, upfront + monthly equivalent + savings on /pricing);
  `aurora_private.subscriptions` (trial | complimentary | paid; only admins create trial/complimentary while payments
  are off); effective plan = highest of grant and subscription (`tier_of`); cancel at period end, resume, renewal
  preference; `admin_expiring`. No payments, no automatic renewal until the owner approves.
- Prediction Research (`pages/Forecasts.tsx`, `/lab/forecasts`): the user's own forecasts (criteria, revisions, resolution)
  scored with proper scoring rules in `lib/forecasting.ts` (Brier, log, calibration bins, by category); stored in this browser
  (`store/forecasts.ts`, JSON export/import). Market-implied probabilities are not shown: Polymarket/Kalshi/Manifold terms
  restrict commercial display (written permission or a data licence needed).
- Organisations (`supabase/migrations/20261024000200_organisations.sql`, `lib/orgs.ts`, `components/admin/OrganisationsAdmin.tsx`,
  `components/account/OrganisationCard.tsx`): named seats (one organisation per account), plan from an active contract
  (`tier_of` = highest of grant, subscription, organisation), monthly AI budget with hard cap (`ai_allowance`,
  `record_ai_usage`: service role only, for the future AI gateway). Created by Aurora admins after a private quote.
- Currency & purchasing power: `shared/currency.ts` (formulas), `worker/worldbank.ts#currencyProfile`, `pages/Currency.tsx`.
- Map Explorer (`pages/GeoExplorer.tsx`, route `/geo`): MapLibre GL (BSD-3, lazy chunk; worker emitted via
  `maplibre-gl-worker.mjs?url` + `setWorkerUrl`) in `components/geo/GeoMap.tsx`; one map switches 2D (mercator) and
  3D (globe) projection, so layers and view are preserved. Layer catalogue with provider/licence/freshness metadata in
  `lib/geo/layers.ts` (NASA GIBS rasters, World Bank choropleths via `/api/compare` (one year) or `/api/map/:indicator`
  (`latest` layers: most recent value per country with its year; allow-list `MAP_INDICATOR_IDS`), USGS/GDACS events, planned layers
  with their needs); shareable URL state in `lib/geo/state.ts`. `scripts/check-gibs.mjs` (preview workflow) verifies
  every GIBS layer from a GitHub runner, since cloud sessions cannot reach NASA. No WebGL2 → `WorldMap` SVG fallback.
  Global Radar (`pages/Radar.tsx`) has a 2D Map | 3D Globe switch: 2D is `WorldMap` (with `focusCountry`), 3D reuses `GeoMap`
  (lazy) with Radar's filtered events, one overlay from the layer catalogue, optional day/night shading (`lib/geo/terminator.ts`)
  and shared selection/filters; URL `?view=&style=&overlay=&night=&k=`. Choropleth loading is shared (`components/geo/useChoropleths.ts`).
- Commodity & Energy Monitor (`pages/Commodities.tsx`, `/markets/commodities`): World Bank Pink Sheet monthly averages
  (CC BY 4.0) in the static `public/data/commodities.json` (bypasses the Worker; too large to parse within Workers CPU
  limits), built by `scripts/commodities/convert.py` and refreshed monthly by `commodities.yml` as a PR. Analytics in
  `lib/commodities.ts`; `CMD:` symbols open close-only monthly datasets in the chart editor (`lib/chart/sources.ts`).
  FRED refuses cloud runners; IMF PCPS is all-rights-reserved; daily/spot/futures prices need a licensed feed.
- Introduction (`components/IntroSplash.tsx`, decisions in `lib/intro.ts`): synced `prefs.intro` = none | brand | cinematic
  | null (automatic: film on the first-ever visit, brand animation afterwards). The film (`public/media/intro/*-v1.*`,
  three variants) is requested only when it plays; edit, sources and licences in `docs/INTRO.md`; rebuild with
  `scripts/intro/` (render-globe.py, build-intro.py, encode.sh). Stock sites are unreachable from cloud sessions: fetch on a
  GitHub runner (work branch `claude/intro-work`, workflow `intro-fetch.yml`). Only Mixkit **Free** licence clips.
- World Briefing (`pages/Briefing.tsx`): pure logic in `lib/worldBriefing.ts` (status labels, reliability, fixed
  background per event type, period window, cross-source de-duplication, consent-based `briefing` prefs synced via
  `SYNCED_KEYS`); `components/BriefingGlobe.tsx`; `WorldMap` exposes a `focus()` handle via `ref` for guided views.
- Chart editor (`components/chart/`): `ChartEditor` (toolbar, menus, templates, saved charts, export, full screen),
  `ChartCanvas` (Lightweight Charts rendering, panes, drawings), `IndicatorPanel`, `useDataset`. Pure logic in `lib/chart/`:
  `intervals.ts` (interval ≠ range; exact aggregation, never finer than the source), `chartTypes.ts`, `indicators.ts`
  (catalogue; only tested, functional entries; `unavailable` explains data needs), `workspace.ts` (settings v2,
  migration, templates, layout JSON), `sources.ts` (simulated `.D` and close-only ECB datasets), `exportImage.ts`.
  Settings live in `prefs.chart` (always read through `normalizeSettings`); favourites, templates and saved charts in
  `store/chartLibrary.ts` (this browser).

## Conventions
- TypeScript strict, `noUncheckedIndexedAccess`. React 19 + React Compiler lint rules (no setState in effects, no impure render).
- Styling: Tailwind v4 tokens in `src/index.css` (`ink-*` charcoal scale, `charcoal`, `gold`, `platinum`, `mist`, `line`). Reusable classes are
  `@utility` blocks (`panel`, `btn-primary`, `btn-ghost`, `chip`, `input`, `eyebrow`).
- Brand (owner-approved reference logo, Oct 2026): warm charcoal/near-black, gold `#C9A35A`, platinum `#F1F0EC`, no blue cast.
  AV monogram = two separate bold geometric letters drawn as SVG paths (`components/Logo.tsx`: `Monogram`, `Wordmark`,
  `BrandLockup`); Montserrat 700 wordmark, Montserrat 500 tagline. Master files in `public/brand/` (SVG + PNG).
  No neon, gradients-as-decoration, 3D or heavy animation.
- Cloudflare: Worker name `auroraveritatis`; `wrangler.jsonc` has `keep_vars: true` so dashboard vars survive deploys.
  Do not add routes/custom domains to config. `build.command` + `assets.directory` are set so `wrangler deploy` and
  `wrangler versions upload` work with or without a dashboard build command (verified with `--dry-run` from a clean clone).
- Plans/limits: `src/lib/entitlements.ts` (`limitOf`, `checkLimit`, `hasFeature`). `EARLY_ACCESS_ALL_FEATURES` stays true until
  billing launches; numeric Free limits are enforced in the UI. Server-side enforcement belongs in Supabase (RLS/triggers).

## Gotchas
- Never `pkill -f`/`pgrep -f` with a pattern that also appears in your own shell command (it kills the shell). Use `fuser -k <port>/tcp`.
- Lightweight Charts swallows a second click that follows quickly (double-click detection). Chart drawing tools use a
  native `click` listener + `coordinateToTime/Price` (`components/chart/ChartCanvas.tsx`), not `subscribeClick`.
- Worker/shared code must not import the `i18n-iso-countries` entry point (it `require()`s every locale and the Worker
  fails to start). Use `shared/countryNames.ts`. Always smoke-test Worker changes with `vite preview` + curl: CI and
  unit tests run in Node and cannot catch Workers-runtime failures.
- Never compute time-dependent values at Worker module scope (`new Date()`, `Date.now()`): during global
  initialisation the Workers clock reads as the Unix epoch. (This made `/api/compare/:year` reject every year.)
- `e2e/ui-audit.ts` (workflow `ui-audit.yml`, after each merge and on demand) is the read-only production browser audit:
  26 routes × 9 widths (overflow, errors, unnamed controls, WCAG touch targets), interaction checks and security
  headers. Read its annotations ("UI audit", "UI audit checks"). Run locally with `BASE_URL=http://localhost:4173
  CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e/ui-audit.ts`.
- Integrations: `worker/twelvedata.ts` (market data; prices return 451 until `MARKET_DATA_DISPLAY=licensed`) and
  `worker/brevo.ts` (newsletter, Aurora list only). `/api/integrations` shows flags; `/api/integrations/check` is the
  limited live test (cached per deployment via the `CF_VERSION_METADATA` binding). Never log or return key values.
- `scripts/smoke.sh <base-url>` is the read-only HTTP smoke test; CI runs it on each PR preview and on aurorav.app. It
  also prints an informational "Auth status" line (Supabase configured? schema applied? sign-up settings) from public values.
- Public copy: approved homepage strings live in `shared/copy.ts` (pinned by a test); `scripts/copyStyle.test.ts` enforces
  the house style (no em dashes in prose, no hype, consistent names).
- The Worker serves page navigations (route `<head>` metadata via HTMLRewriter, `worker/meta.ts`) through the
  `ASSETS` binding; `run_worker_first` excludes `/assets/*`, `/brand/*` and static files so they bypass the Worker.
- Cloud sessions cannot download GitHub job logs or artifacts (blob storage is blocked). Read results from check-run
  annotations: smoke prints notices, `live-auth` posts every result in one notice titled "Live auth results".
- Scheduled tasks need the repositories attached as sources (set in the Claude app). Without them a run can only clone
  read-only and cannot push; it should stop and report rather than retry.

## Sandbox notes
Cloud sessions may block outbound calls to data APIs (World Bank, USGS). Worker integrations are unit-tested with mocked
responses; verify against live endpoints on a Cloudflare preview deployment.
