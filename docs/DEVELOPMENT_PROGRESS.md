# Development Progress

_Last updated: 2026-10-23, runs 26–29: menus, intro default, Map Explorer, integrations, audit (session `session_01DABSiCB2yNMA9QbADoheEi`)_

## Current status
| Field | Value |
|---|---|
| Phase | 1 complete; Phase 2/3/5 items in progress |
| Branch / PR | Work branches start from `main` per task; PRs #11–#23 merged (2026-10-21/22); `claude/world-briefing` open |
| GitHub Actions | `ci.yml`: lint · typecheck · 146 tests · build · `migrations` (Postgres 16, two-account RLS). `preview.yml`: Worker version per PR + smoke + `live-auth` when accounts code changes. `smoke.yml`: aurorav.app after merges. `live-auth.yml`: on demand against production |
| Production check | Smoke **29/29** on every preview through PR #22. Auth status: configured, schema applied, guest access denied, email confirmation required; plans/admin functions missing until the owner applies `20261023000000` |
| Live account test | Previews 23 passed / 0 failed / 3 skipped (email links on previews go to the Site URL). Production run 2: 24/26; the remaining sync timing bug is fixed in PR #15 |
| Owner-dependent | Apply `20261022000000` (deletion hardening) and `20261023000000` (profiles, admin, plans), then the admin bootstrap SQL; legal-notice decision; UCDP token (see Knowledge `OWNER-ACTIONS.md`) |
| Next recommended action | Owner: apply the four pending migrations (sessions, subscriptions, organisations, AI gateway), switch AI on in /admin, press "Check OpenAI key and models". Dev: Integration Health dashboard, GNews in /api/news, ElevenLabs narration, Simulation Studio (see Knowledge `CONSOLIDATED-ROADMAP.md`) |
| Previous next action | Production re-run of `live-auth.yml` after PR #15; then currency slice 2 (single-currency pages, IMF, monthly CPI), C mobile suite, D audit |

## Decision (2026-10-20, delegated by owner)
The Vite + `@cloudflare/vite-plugin` foundation is the project foundation (PR #3). PRs #1 (esbuild) and #2 (same code,
older branch) are closed as superseded. PR #3 was opened from an older commit; run 3 restored the four later commits
(deploy fix, limits/intro/auth/timeline, Impact Radar + rebrand, references) on top as a fast-forward.

## Completed
- **2026-10-25 (cont.):** #60 Integration Health (verified: OpenAI, ElevenLabs, GNews, AISStream, FMP authenticate;
  OpenSky secret missing on the Worker), #61 Volatility drag simulator, #62 GNews (licence-gated), #63 ElevenLabs
  narration + CSP `media-src` fix. Next: Efficient Frontier (Ledoit-Wolf), Triple Barrier, FMP adapter, briefing narration.
- **2026-10-25:** #57 Radar borders (antimeridian artefacts removed, casing, star field); #58 AI cost controls ($5/month,
  50/80/100 % thresholds, 6-hour answer cache, in-flight sharing, admin model check `GET /api/ai/models`); de-AI
  dashboard pass (no decorative glows, factual Headquarters title, ▲/▼ on changes) and AI status in the smoke test.
### Run 50 (2026-10-24) — News ingestion and coverage verification
- **Sources:** GDELT DOC 2.0 (free, attribution, no key; throttles bursts, so 25 s timeout and 30-minute cache) plus the UN News RSS feed (official; also the fallback when GDELT does not respond, with a visible note). Shared logic in `shared/news.ts`:
  - source registry (publisher identity, type: official, wire, broadcaster, newspaper, magazine; unknown domains "unrated");
  - story grouping by headline similarity;
  - statuses: **confirmed** (an official source published it), **corroborated** (2+ independent publishers with their own headlines), **unverified** (one publisher, or only syndicated copies of the same headline). **Disputed** needs a reading of the content and is never automatic.
- **Worker:** `GET /api/news?q=&t=24h|3d|7d` (`worker/gdelt.ts`), plain-word queries only, cached 15 min with the stale fallback; headlines and links only.
- **Client:** `/news` (search, time window, story cards with status, independent/syndicated counts, official sources, publisher type, links to the source); "Recent coverage" button on country dossiers. Smoke prints an informational News line.
- **Tests:** unit tests for registry, grouping, syndication and GDELT mapping; browser 12/12 at 1280 and 360 px.
- **Known limitation (seen on the PR preview):** GDELT is intermittent from Cloudflare's network: one preview run timed out after 25 s, the next returned 100 articles in 40 stories; bursts get HTTP 429. The 30-minute cache, the 7-day saved copy and the UN News fallback (with a visible note) cover the gaps. Options: a scheduled fetch into Workers KV (free tier; needs a KV namespace, owner action), or a news API with a commercial licence (GNews or Mediastack, paid; owner decision).
- **Prepared, not active:** Mediastack and GNews (paid).
### Run 49 (2026-10-24) — Aurora AI gateway (EVE, KNOX)
- **Worker** `worker/ai/`: provider router (OpenAI with `OPENAI_API_KEY`, Cloudflare Workers AI binding `AI`; order `AI_PROVIDERS`, timeout and failover), source grounding (World Bank country data, USGS/GDACS events, opt-in Brain notes marked unverified), citation check, `POST /api/ai/ask` and `GET /api/ai/status`.
- **Migration `20261025000000_ai_gateway.sql`** (owner applies): AI off by default; global monthly budget (€30) and daily requests per plan (5/30/100/300); reservations through `ai_begin`/`ai_finish` with the user's own token (no service key in the Worker); organisation AI budgets respected; admin overview and settings, audited.
- **Client:** `/assistant` (EVE and KNOX tabs, sources, citations, usage, Add to Brain, read-aloud with the browser voice, related Aurora links without AI); `/admin` AI usage and spending panel.
- **Tests:** SQL suite `ai.sql` (6 suites pass); Worker tests (router failover without key leaks, pricing, citations, validation, full flow with reservation/completion/release); browser 20/20 at 1280 and 390 px.

### Run 48 (2026-10-24) — GitHub Actions optimisation
- **Measured (20–24 Oct, 343 runs):** about 950 billable job-minutes in 4 days. Breakdown: CI 286, UI audit 255 (11 runs cancelled after their 200 s sleep), production smoke 203 (180 s sleep), preview 146, intro fetch 35, live auth 25.
- **Changes:**
  - CI: pull requests only; one job instead of two (migrations included); superseded runs cancelled; docs-only changes skipped.
  - Preview: docs-only changes and unrelated label events skipped.
  - `post-deploy.yml` replaces the post-merge smoke and UI-audit runs and their two fixed sleeps. It waits for the exact deployed commit (`/api/health` now reports `commit`; fallback 180 s), runs the smoke test, then a quick UI audit (12 routes × 3 widths + all interaction checks) only when site files changed.
  - Full UI audit: nightly, only if main changed in the last 26 h, and on demand.
- **Note:** this repository is public, so standard GitHub-hosted runners are free for it. The included-minutes shortfall must come from private repositories on the account.
### Run 47 (2026-10-24) — Second cinematic edit (Budapest, Moscow) and rotation
- **Edit v2:** 12.2 s with Budapest (Danube at blue hour and at night, tram), Moscow (Spasskaya Tower at night, tram square), London, New York and Tokyo. Shorter shots, 0.3 s transitions, shorter globe; no captions.
- **Footage:** Wikimedia Commons CC BY 3.0/4.0 clips, credited in `docs/INTRO.md` and on the Status page. CC BY-SA was excluded so the Mixkit licence of the other shots is not affected.
- **Rotation:** the cinematic intro alternates v1/v2 on each eligible visit (`nextFilmEdit`, key `av-intro-film`); the first-ever visit gets v1. `build-intro.py` takes a variant and `encode.sh` a version suffix.
- **Not yet included:** Saint Petersburg and Vienna (no suitable freely licensed clip; a free Pexels key would allow a third edit).
- **Tests:** unit test for the rotation; browser check: v1 → v2 → v1 at 1280 and 390 px, one film file per visit.

### Run 46 (2026-10-24) — Country profile backgrounds
- **Picker (Account → Profile background):** country, landmark grid with previews, live preview banner, reset to neutral; the suggestion comes only from the country last opened in a dossier on this device, and a manual choice is never replaced.
- **Storage:** choice in synced `prefs.profileBackground`.
- **Banner (`ProfileBanner`):** shown on the Account page and in Headquarters, with a readability gradient and the photo credit and licence link always visible.
- **Photos:** 30 Wikimedia Commons featured pictures of 19 countries (CC0, public domain, CC BY, CC BY-SA), resized WebP 1280/640/320 (5.2 MB). Fetched on the `claude/intro-work` runner. Manifest and attribution rules in `docs/LANDMARKS.md`; licence test in `lib/profileBackground.test.ts`.
- **Tests:** browser 18/18 at 1280 and 360 px.

### Run 45 (2026-10-24) — Homepage direct links, recognisable module buttons
- **Homepage:** under the two main actions, a compact "Go directly to" row (Map Explorer, Country Dossiers, Market Terminal, Commodities, Market Impact, Portfolio risk, World Briefing, Brain). Module cards updated to what each module does today.
- **`ModuleLink`** (`components/ui.tsx`): links to another module are now small bordered buttons with an arrow. Used in the Radar event drawer and the impact chain; plain inline links stay only inside sentences.
- **Tests:** browser at 320, 390 and 1280 px: 8 direct links, none under 24 px, no overflow, no errors.

### Run 44 (2026-10-24) — Market Terminal: one range control, distinct interval, favourites, Fibonacci
- **Toolbar:**
  - The candle interval is one clearly labelled control (candle icon and full name, e.g. "1 day"), so it is no longer confused with the "1D … All" history-range chips.
  - The history range is one group: favourite range chips plus a range menu with every preset, stars and custom dates.
  - On tablet and desktop the toolbar wraps instead of scrolling sideways.
- **Favourites:**
  - Star intervals, ranges, chart types, indicators, drawing tools and templates in their menus.
  - Favourites appear in a compact favourites bar, which the star button in the toolbar shows or hides.
  - Stored in `prefs.chartFavs` (synced key; logic in `lib/chart/favourites.ts`, hook `store/chartFavourites.ts`). Indicator stars from this browser carry over.
- **Drawing:** a Draw menu with level, trend line and a new **Fibonacci retracement** (0–100% levels, `fibLevels` in `lib/chart.ts`).
- **Tests:** unit tests for favourites and Fibonacci; browser 16/16 at 1280 and 390 px.

### Run 43 (2026-10-24) — Operator decision, About page, migration status in smoke
- **Legal (owner option B):** operator is Tanner Karl, a private individual; no registered company or association is claimed. The legal notice no longer cites Austrian law or the Going address: which disclosure rules apply depends on the operator's current residence (to be confirmed); the postal address is marked "to be added". Privacy complaint wording follows GDPR Art. 77 (authority where the user lives or works).
- **About page `/about`:** based on the owner's draft copy; principles, audience, vision, operator, contact and transparency links. No invented team, partners or credentials. Linked in the footer, sitemap and UI audit.
- **Status page:** brought up to date (impact chain, portfolio risk, Prediction Research, commodities, Map Explorer, pending account features).
- **Smoke test:** reports which 2026-10-24 migrations are applied (sessions, subscriptions, organisations), using guest calls to their functions.

### Run 42 (2026-10-24) — Quant portfolio risk (VaR / expected shortfall)
- **Lab → Portfolio risk (`/lab?tool=risk`):**
  - Up to 8 holdings, on real World Bank monthly commodity prices or the labelled simulated `.D` instruments (daily).
  - VaR and expected shortfall at 95% or 99%, over 1, 3 or 12 months (or 1, 10 or 21 days), by three methods: historical simulation (non-overlapping sums for longer horizons; "too few periods" when under 20), normal (variance-covariance) and seeded multivariate-normal Monte Carlo (Cholesky).
  - Euler risk contributions, annualised volatility, maximum drawdown and a histogram with the VaR line.
  - Rolling one-period backtest with the Kupiec proportion-of-failures test.
  - CSV export with source and period labels.
- **Logic:** `lib/risk.ts`, with `normInv`, `erfc`, covariance, Cholesky and Kupiec tested against reference values.
- **Tests:** browser 16/16 at 1280 and 360 px.

### Run 41 (2026-10-24) — Market Impact chain on real data
- **Impact page, new top panel "Event → country → commodity exposure":**
  - A live USGS/GDACS event is placed in a country: the GDACS country name, else the Natural Earth borders, else the nearest country within 400 km for offshore events. The user can override the country.
  - The country's commodity exposure comes from 8 World Bank indicators with fixed, documented thresholds (`lib/impactChain.ts` `EXPOSURE_RULES`).
  - Linked World Bank Pink Sheet prices are shown for the month before the event, the event month and the two following months, with z-scores. Months not yet published are labelled.
  - Actions: Add to Brain, country dossier, forecast, Strategy Lab. Radar events link here.
  - Wording keeps exposure, timing and causation apart.
- **Tests:**
  - Unit: `lib/impactChain.test.ts`, `lib/geo/locate.test.ts`.
  - Browser: 19/19 at 1280 and 360 px with mocked feeds.

### Run 40 (2026-10-24) — Fair use, subscription terms, account recovery
- **Legal drafts:** new `/legal/fairuse` (one person per personal account, no scraping, AI allowance never unlimited, organisation AI budgets, graduated response without IP-only limits or fingerprinting); `/legal/subscriptions` updated for 1/3/6/12-month periods, trials, renewal, cancellation at period end and named organisation seats. Linked from Plans and the footer.
- **Support procedure:** `docs/ACCOUNT-RECOVERY.md` (forgotten password, compromised account, lost mailbox, missing emails, displaced device, audit trail).

### Run 39 (2026-10-24) — Organisations, named seats and AI budgets
- **Migration `20261024000200_organisations.sql`** (owner applies, after the sessions and subscriptions migrations):
  - `organizations` (plan, seats, contract dates, status, monthly AI budget in euro cents, hard cap on by default, 80% alert), `org_members` (one organisation per account; `member` | `org_admin`), `ai_usage`.
  - Effective plan = highest of grant, subscription and an active organisation seat (`tier_of`).
  - `ai_allowance(uid)` and `record_ai_usage` are server-only (service role), for the future AI gateway. No AI feature is switched on.
  - Aurora administrators create organisations, edit contracts, add and remove named seats (confirmed accounts only, never past the seat count); all audited. No public prices.
  - The optional one-device rule now applies to paid individual accounts only, not to organisation seats.
- **UI:** Admin → Organisations (create, contract editor, seats, AI spend vs budget); Account → organisation card (members see plan and contract end; organisation administrators also see seats, members and AI spend). Both explain the pending database update until the migration is applied.
- **Tests:** `supabase/tests/organisations.sql` (CI job `migrations`), `lib/orgs.test.ts`, browser 23/23 with mocked Supabase (360 and 1280 px).

### Run 38 (2026-10-24) — Prediction Research
- **Feature:** `/lab/forecasts` lets users write forecasts with resolution criteria, revise them (history with notes), resolve yes/no/void, and see Brier and log scores against the 50% baseline, a calibration diagram and scores by category. CSV and JSON export, JSON import, Add to Brain, and links from Quant Research and Radar events.
- **Sources checked:**
  - Manifold: "personal, non-commercial use", so excluded.
  - Polymarket: the terms are client-rendered and unverified; the public API works but display rights are unconfirmed.
  - Kalshi and Metaculus: they blocked automated access.
  - Market-implied probabilities are therefore marked unavailable until there is written permission or a licence.
- **Tests:** unit tests and browser 20/20.

### Run 37 (2026-10-24) — Subscription periods (1, 3, 6, 12 months)
- **Plans page:** period selector with the upfront total, monthly equivalent and savings; provisional discounts disclosed.
- **Migration `20261024000100_subscriptions.sql`** (owner applies):
  - subscriptions table; the effective plan is the highest of grant and subscription;
  - my_subscription, renewal preference, cancel at period end, resume;
  - admin start (trial or complimentary only), change, end, and the expiring list.
- **UI:** Account → Subscription (expiry warning 14 days before the end). Admin → period form and "Ending within 14 days".
- **Tests:** the SQL suite with all migrations, unit tests, browser 10/10.

### Run 36 (2026-10-24) — Device management and account-sharing protection
- **Migration `20261024000000_sessions.sql`** (owner applies):
  - device list (`my_sessions`, no IPs); revoke one device; claim on sign-in; session status;
  - an audited admin switch for one active device on paid individual plans (off by default);
  - `session_active()` gates entitlements and admin, so a revoked device loses paid features at once.
- **App:**
  - Account → Devices: sign out one device or all others.
  - SessionGuard: claims the session after sign-in, checks every 2 minutes and on focus, signs a displaced device out with an explanation.
  - Admin → Account sharing.
- **Tests:** SQL session suite (applied twice), unit tests, and a browser test with a mocked Supabase (5/5).
### Run 35 (2026-10-24) — Global Radar 2D Map | 3D Globe
- **Switch:** Radar now has a 2D Map | 3D Globe switch. The 3D view reuses `GeoMap` with Radar's filtered events.
- **Preserved when switching:** selected country, selected event, filters, time window and day.
- **3D extras:** satellite, grayscale and dark styles; one information layer from the catalogue (economic, energy, trade, finance, satellite); country search in both views; day/night shading from the sun's position; full screen; a country card with the dossier, briefing and currency links.
- **URL and fallback:** the view is shareable via the URL and the choice is remembered. Without WebGL2: 2D with a reason.
- **Tests:** 19/19 browser checks (1440 and 390 px), plus terminator tests against the sun elevation.

### Runs 33–34 (2026-10-23) — Economic maps and the Commodity & Energy Monitor
- **PR #37 (merged):** 29 Map Explorer layers (finance and markets, economic geography, trade and logistics, energy and commodities), showing the most recent value per country with its own year via `/api/map/:indicator`. Preview smoke passed the new check.
- **Commodity & Energy Monitor:**
  - 28 World Bank Pink Sheet benchmarks: energy, precious and base metals, iron ore, grains, softs, fertilisers.
  - Columns: 1/3/12-month change, 12-month volatility, 10-year position. Plus a watchlist (synced), comparison rebased to 100, return correlations, exposure-map links, CFTC positioning links, CSV and the chart editor.
  - Monthly refresh workflow that opens a PR.
  - Sources rejected: FRED (blocks runners) and IMF (all rights reserved). Daily, spot and futures prices are marked unavailable until a licence exists.

### Runs 31–32 (2026-10-23) — Admin verification, quotation calculator, cinematic introduction
- **PRs #33–#35 (admin verification):**
  - Production live test **31/31**: ordinary users are refused every admin function, entitlements come from the server and profile editing works.
  - A `/admin` self-check for the owner.
  - The admin-only quotation calculator.
  - The breached-password message.
- **Introduction experience:**
  - Three synced choices: none, brand or cinematic. Automatic default: the film on the first-ever visit, the brand intro afterwards.
  - The brand animation is slowed to 4.2 s, with a 1.5 s readable name and a clean letter-to-monogram handover.
  - A 12.5 s night-city film, original edit (`docs/INTRO.md`): London, New York and Tokyo, Mixkit Free licence; closing globe rendered from NASA Black Marble.
  - Delivery: WebM 1.4–2.4 MB, MP4 fallback. The film is requested only when it plays; it falls back to the brand intro on failure or after 3.5 s; it respects reduced motion and data saver.
  - Local browser tests 18/18, and the production UI audit intro checks are updated.

### Run 30 (2026-10-23) — Business & Institutional quote requests (PR #32)
- **Pricing:** new "Business & Institutional Solutions" section with a **Request a Business Quote** button. Business prices are not published.
- **`/business` form:** has every owner-specified field. Validation is shared with the Worker (`shared/businessQuote.ts`).
- **`POST /api/business/quote`:**
  - Same-origin JSON, honeypot, 3 requests per IP per hour.
  - Emails the team through Brevo (`BUSINESS_QUOTE_TO`, default the support inbox) with reply-to set to the requester and no auto-reply.
  - Returns 503 with an email fallback when Brevo is not configured.
- **Sender:** `BREVO_SENDER_EMAIL`, or `business@aurorav.app` (the domain is authenticated in Brevo). Real delivery still needs to be verified on production with one test request.
- **Production UI audit after #31:** 26 routes × 9 widths, 0 issues, 13/13 interaction checks.

### Runs 26–29 (2026-10-22/23) — Repairs, Map Explorer, integrations, comprehensive audit
- PR #25: chart toolbar menus (instrument, interval, chart type, indicators, templates, settings,
  saved, export) were clipped behind the chart by the toolbar's scroll container; they now render
  in a positioned portal (verified 9/9 hidden before, all visible after, at 1440/1024/390 px and in
  full screen). Candle intervals are searchable ("4h", "hourly", "weekly", "1M").
- PR #26: the Worker serves the last good copy when a source is slow (>3 s) and refreshes in the
  background (GDACS timeouts).
- PR #27: brand intro default "every new visit and after sign-in" (fresh-visit detection, 30-minute
  inactivity, no double play on email-link sign-in; old default migrated; explicit choices kept).
- PR #28: Map Explorer `/geo` (MapLibre 2D/3D, five styles, NASA GIBS layers verified from CI,
  13 World Bank choropleths, live events, shareable links, saved views, PNG export).
- PR #29: Twelve Data (server side, prices gated by `MARKET_DATA_DISPLAY=licensed`, live
  connection test: Basic plan, real 1m–1D bars) and Brevo newsletter (double opt-in, signed
  unsubscribe/deletion links, Aurora list only; domain authenticated).
- PR #30/#31: production UI audit workflow (26 routes × 9 widths, interaction checks, security
  headers), touch targets, lazy quick search (initial JS 132.9 → 128.1 KB gzip), unused
  dependencies removed, HSTS added, SECURITY.md corrected.
- Audit: 239 owner requirements extracted; 107 (45%) fully implemented and verified (vault
  `AUDIT-2026-10-23.md`).

### Run 25 (2026-10-22) — Phase 6: guided World Briefing, Headquarters widgets
- `/briefing` (`pages/Briefing.tsx`, pure logic `lib/worldBriefing.ts`), a guided tour with no AI:
  - Period: guests see 24 hours, 3 days or 7 days. Signed-in users who opt in ("Remember when I finish a briefing")
    continue from their last finished briefing, capped at 7 days. The timestamp syncs with the account and is deleted
    when the option is turned off.
  - Order: chronological or most severe first. Simulated scenarios are off by default and always labelled.
  - De-duplication: repeated ids, and the same real event from two sources (same category, within 100 km and 6 h,
    e.g. a USGS earthquake and its GDACS alert) shown once with both sources.
  - Status: Confirmed / Reported / Modelled / Unverified / Simulated. GDACS hazards are "reported" and their alert
    level is a model estimate; simulated is never confirmed.
  - Each event shows location with coordinates, UTC time, summary, fixed background and typical consequences for the
    event type (labelled as general, not about this event), source reliability, severity on the Brain risk scale,
    sources and the country dossier (or the reason it is unavailable).
  - Controls: start, next, previous, pause, resume (12 s per event, progress bar), skip, restart, exit, sources,
    dossier. Keys: arrows, Space, Esc.
  - Views: a briefing globe that turns to each event (`components/BriefingGlobe.tsx`; instant with reduced motion)
    or the flat map, which zooms to the event through the new `WorldMap` `focus()` handle.
- Headquarters: new Brain widget (local graphs) and Data Freshness widget (live, last saved copy or unavailable per
  feed), plus a link from the Daily Briefing to the guided tour. `normalizeLayout` keeps synced layouts saved before
  new widgets existed valid.
- Smoke test: new check for `/briefing` metadata (30 checks).
- Tests: 8 new unit tests; browser test 33/33 (guest and mocked signed-in account), 390 px check with a failed feed.

### Runs 21–24 (2026-10-22) — Intelligence platform directive, phases 1–5
- Phase 1 (PR #20): Country Dossier map. Wheel and pinch zoom around the cursor, the page scrolls normally at the zoom
  limits (no scroll trap), one-finger pan only when zoomed, double-click zoom, keyboard controls (`lib/mapView.ts`, tested).
- Phases 2–3 (PR #21): profile editor, secure email/password changes, Administrator role (owner bootstrap SQL only),
  manual complimentary plan grants with expiry, reason, history, revocation and audit log; server-enforced plan limits
  (`limit_for`, quota triggers) and `my_entitlements()`; `/admin` dashboard. Payments stay disabled. Migration
  `20261023000000` is reviewed and tested (`supabase/tests/admin.sql`) but **not applied**: it needs the owner.
- Phase 4 (PR #22): AV intro (letters glide into the monogram, about 2.6 s, skippable, never with reduced motion) with a
  user setting (once per session, every visit, after sign-in, never) and a restrained route loading state.
- Phase 5 (this PR): Brain.
  - Risk scale `lib/brainRisk.ts`: low, elevated, significant, severe, critical, grey for insufficient or outdated
    data. Automatic risk only from documented methods (USGS magnitude band, GDACS alert level), each naming its method,
    source and date. GDACS assessments turn grey after 14 days without a refresh. The user's own assessment is stored
    separately and never alters the automatic one. Relevance (1–5) is separate from risk.
  - Canvas: colour by type or by risk, with a legend; relevance as outline weight; background options (dots, grid,
    plain, night).
  - Undo/redo (`lib/history.ts`): toolbar buttons and Ctrl/Cmd+Z, Ctrl+Shift+Z; bursts of typing and a whole drag are
    one step each.
  - Intelligence panel (`components/brain/NodeIntel.tsx`): World Bank figures for country nodes and the latest ECB
    value for macro nodes, both with source. Module buttons (Dossier, Radar, Market Terminal, Macro & FX, Currency,
    Quant); unavailable ones are disabled with the reason. Also: Add linked research, View sources, and Refresh from
    source for Radar events.
  - Fix: Brain autosave could lose a burst of quick edits when the page was reloaded or closed within about half a
    second. Saves now happen at least once a second, and unsaved edits are stashed synchronously on unload and restored
    on the next load (`stashPending` / `recoverPending`).
  - Tests: 13 new unit tests; browser test 22/22 at 1440 px plus a 390 px overflow check (local workerd, mocked APIs).

### Run 20 (2026-10-22) — Interactive chart editor (owner chart directive, phases 1–2 and parts of 3–4)
- Reusable `ChartEditor` on the Market Terminal, also reachable from Macro & FX and Currency:
  - Instruments: search across simulated `.D` instruments and official ECB reference rates.
  - Time controls: candle interval and history range are separate (1D–All presets plus a custom date range). Intraday intervals are listed but disabled, with the reason.
  - Chart types: 12, with Renko, Line Break, Kagi and Point & Figure planned.
  - Indicators: a searchable catalogue of 57 functional indicators with categories, favourites, parameters, colours, hide/show, own pane and remove. VWAP is listed as unavailable because it needs intraday data.
  - Drawings: level and trend line, with undo and redo.
  - Organising: 6 built-in templates plus user templates; saved charts with JSON export and import.
  - Export: PNG of the visible chart with indicators and drawings, plus optional details, branding and source.
  - Full screen through the Fullscreen API, with an in-app fallback.
  - A data disclosure bar, and Add to Brain.
- Close-only sources (ECB) disable the chart types and indicators that need OHLC or volume, and say why.
- Tests: 49 new unit tests (hand-computed references and exact identities) and a 38-check browser test at 1280 and 390 px (local workerd, mocked ECB data).
- CI: the real-email live account test now runs only on PRs labelled `live-auth` (PR #18).

### Runs 17–19 (2026-10-22) — Accounts live; Currency and purchasing power
- Owner applied the migration and configured Supabase Auth, SMTP (Resend) and the Worker vars.
- `e2e/live/auth.ts` + `live-auth.yml`: real browser (Chrome), real email (disposable inboxes: mail.tm, mail.gw, Guerrilla Mail fallbacks) and the real Supabase project. Covers sign-up (desktop + 390 px), confirmation email and redirect, sign-in/out, invalid credentials, used links, password reset, profile creation, cloud preferences, note save/edit/delete, cross-device sync, export, two-account RLS through PostgREST, tier escalation, guest access, a bundle scan for secret keys, and deletion. Both accounts are deleted at the end. No secrets.
- Bugs found by it and fixed:
  - PR #12: shared-browser data leak between accounts, edited notes not syncing, export without cloud data, unclear link errors.
  - PR #13: sync race on page load, missing "Password updated." message, CSP blocking Cloudflare Web Analytics.
  - PR #15: changes made between the preferences and notes stages of the first sync were never uploaded.
- `20261022000000_account_deletion_hardening.sql`: deletion moves to the unexposed `aurora_private` schema, requires a sign-in within 10 minutes, and the public wrapper becomes SECURITY INVOKER (Security Advisor lint 0029). CI fails if any exposed SECURITY DEFINER function is executable by `authenticated`. **Owner must run it.**
- PR #14 Currency and purchasing power: `/api/currency/:iso3` (World Bank CPI, inflation, official rate, PPP) and `shared/currency.ts` (tested formulas). The `/currency` page has four charts, an inflation calculator, an ECB converter, a historical ECB converter, method notes and CSV.

### Run 16 (2026-10-21) — Supabase migration review (master directive F, before owner execution)
- Security review of `supabase/migrations/20261020000000_initial_profiles.sql` (not yet applied). **Fixed a privilege
  escalation:** `revoke update (tier)` does not override Supabase's default table-level UPDATE grant, so any signed-in
  user could set their own `tier` to `intelligence` (reproduced on Postgres 16). Now the table grant is revoked and only
  `display_name`, `updated_at` are granted back.
- Also: guests (anon) get no table or function access; policies are `to authenticated` with `(select auth.uid())`;
  the file is idempotent (drop-if-exists policies and triggers) and refuses to run if a non-Aurora `profiles` table exists
  (wrong project in a shared organisation); Aurora-prefixed trigger/function names so no other `auth.users` trigger is
  replaced; 1000-notes-per-account cap; `delete_my_account()` RPC (GDPR erasure, cascades to all user rows).
- `supabase/tests/rls.sql` + `scripts/test-migrations.sh`: applies migrations twice on a Supabase stub and runs a
  two-account RLS test (cross-account read/write/delete, tier escalation, guest access, internal function calls, account
  deletion). New CI job `migrations` (postgres:16 service). The old migration fails it.
- Account page: "Delete my account" (signed-in only). Privacy text mentions it. Smoke "Auth status" treats 401/403 as
  "schema applied, guest access denied".

### Run 15 (2026-10-21) — Social sharing (master directive B)
- Share assets rendered from the real interface (`/share/card`, noindex, outside the site layout) by
  `scripts/render-share-assets.ts` (Playwright + system ffmpeg): OG 1200×630 (+ Radar, Countries, Markets, Brain variants),
  Story 1080×1920, post 1080×1350, square 1080×1080, and a 10 s seamless Story loop (300 deterministic frames of a full
  globe turn; H.264 MP4 + VP8 WebM, ~1.3 MB each). Files in `public/media/` (bypass the Worker, 1-day cache, CORS open).
- New `components/Globe.tsx` (orthographic Natural Earth globe; reusable for the planned 3D globe).
- Crawler-visible OG/Twitter tags (`og:image` + size + alt, `twitter:card summary_large_image`, title/description/image)
  injected per route by the Worker and kept in sync by `useRouteMeta`; module-specific preview images.
- `/share` page: copy-link per module, native share, suggested text, image previews with download and copy-image-link,
  Story video (muted, poster, preload none). Sitemap updated (was missing Tension, Macro, Positioning, Brain).
- Smoke test: +6 checks (share metadata, og:image, twitter card, route image, image and video files) and an informational
  Supabase "Auth status" line (PR #9).
- Verified: 130 unit tests; Playwright /share 18/18 (desktop + mobile, clipboard, all images decode, 10 download links
  resolve, video attributes, no overflow, no console errors); local workerd shows route-specific OG tags.

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
