# Requirement matrix: consolidated implementation prompt of 26 October 2026

Source: owner's "Consolidated Implementation Prompt" (verbatim copy in the Knowledge repository,
`OWNER-MESSAGES/2026-10-26-consolidated-implementation-prompt.md`). It supersedes earlier requirements it covers; the
owner's later explicit instructions override it. Status values: **working** (in production and verified), **partial**,
**missing**, **blocked** (needs credentials, licence, data or an owner decision). Phases follow §27: A shell, B Radar and
map, C evidence and freshness, D briefings and comfort, E market and quant, F learn and help, G HQ, Brain, Explorer.

Superseded by this prompt: the 45–60 s briefing limit (now about 2 minutes), the 90 s idle tour entry (Comfort Mode
default 5 minutes, per-module), the central spinning radar sweep (removed), voiced briefing window choice (voiced is the
latest 24 h edition; written keeps 24h/3d/7d).

Acceptance format for each item (§26): location → trigger → expected behaviour → exit → data source → empty/error
behaviour → verification. Items below state the essential criterion; full checks are in the PR that delivers them.

## Phase A: shell, structure, tokens

| ID | Requirement (§) | Status | Notes / acceptance |
|---|---|---|---|
| A-1 | Navigation: Radar, Map Explorer, Countries, Market (Quant within), Brain, HQ, Learn; Help as utility; Plans upper right (§2) | partial | Learn and Help missing; Quant Research is a separate top item |
| A-2 | Semantic colour tokens: selection/info cyan-blue, attention amber, severity scale, actor colours, each with a legend (§4) | missing | today gold accent only; owner brand rule (gold, no blue cast) must be reconciled: decision recorded below |
| A-3 | Interactive states on all buttons; no continuous blinking; new-briefing pulse stops after opening (§4) | partial | states exist in utilities; pulse not built |
| A-4 | Motion preference (dynamic default, reduced motion respected, profile control) (§4) | partial | reduced motion respected; no profile control |
| A-5 | Desktop layout: thin header, dominant map, resizable context panel about one-third, map recentred in visible canvas; mobile sheet (§4, §5) | partial | resizable panel exists; globe displaced right (fixed in B-1) |
| A-6 | Owner admin access via verified account and server roles; role/plan management audited; premium ≠ bot access (§21) | partial | owner-protection migration pending owner |

## Phase B: Global Radar, country flow, layers, map semantics

| ID | Requirement (§) | Status | Notes / acceptance |
|---|---|---|---|
| B-1 | Globe centred in the visible map area after panel open/close and resize (§5) | missing → this phase | camera padding equals the panel width |
| B-2 | Overview: grayscale base, subtle country situation shading, compact typed event symbols, persistent vs recent distinguishable (§5, §6) | partial | grayscale + clustered dots; no type icons, no shading |
| B-3 | Country click → frame country → dossier + concise country event list → event icons in country → select event focuses → close returns to country → leave restores overview (§5) | partial | frame + dossier + camera restore done; country event list and return-to-country missing → this phase |
| B-4 | No unsolicited tour during manual exploration; no camera reset on refresh (§5) | working | tour only via button or idle |
| B-5 | Cursor coordinate readout (geographic, not camera centre) (§5) | missing → this phase | |
| B-6 | Ocean events stay genuine points; approximate locations get uncertainty area and label (§5) | partial | 0,0 rejected; no uncertainty areas |
| B-7 | Canonical event merge, crisis grouping, clustering by zoom (§5) | partial | GDACS episodes merged, cross-source dedupe, clustering; crisis grouping missing |
| B-8 | Severity scale documented: recent intensity vs persistent crisis vs coverage; evidence, last assessment, uncertainty (§6) | missing | needs crisis registry with sources |
| B-9 | Event-type icon vocabulary; area/route/status treatments for persistent crises (§6) | missing | |
| B-10 | Visible Layers button, one-click panel, search with aliases, categories, active count, chips, info, source/freshness, reset, presets, favourites, opacity (§7) | partial | Map Explorer has a layer list (long, no categories/search); Radar has none → Radar Layers panel this phase, Explorer redesign next |
| B-11 | Progressive labels, regional/local detail, collision handling (§8) | blocked | needs self-hosted glyphs and vector tiles (free sources exist: OpenMapTiles/Natural Earth; build pipeline needed) |
| B-12 | Map Explorer specialist layers: aviation, maritime, infrastructure, connectivity, territory, agreements (§8) | partial/blocked | OpenSky reachable only from GitHub runners; AISStream terms; agreements dataset to be curated |
| B-13 | WebGL failure fallback: event list, country search, report view (§8) | partial | SVG fallback in Explorer; Radar shows message only |
| B-14 | Situation vs Control; De jure / De facto / Combined; separate roles; hatching vs fill; claims dashed; dispute panel (§9) | missing | needs sourced territorial datasets per case; no hardcoding |

## Phase C: evidence, freshness, calendar

| ID | Requirement (§) | Status | Notes |
|---|---|---|---|
| C-1 | Dossier header: flag, coat of arms, names, category with definition, capital, situation report, developments, actions (§10) | partial | flag, capital, World Bank sections; coat of arms, category, situation report missing |
| C-2 | Leadership with titles, tenure, portrait, source date; deputies and heirs separate (§10) | missing | candidate source: Wikidata (CC0) with verification date; portraits only with licence |
| C-3 | Security-organisation directory (§10) | missing | Wikidata + official sources; emblems only with licence |
| C-4 | Connectivity state (normal/degraded/outage/unknown) with onset and source (§11) | blocked | candidate sources: IODA (Georgia Tech, free research API), Cloudflare Radar (API token, free) |
| C-5 | Time fields: observation, publication, fetch, verification, reference period, next check, freshness state; Live/Delayed/Periodic/Historical/Stale/Demo (§11) | partial | provenance + stale copies exist; full field set missing |
| C-6 | Evidence panel: facts vs claims vs unknowns, sources, corroboration, update history, corrections (§12) | partial | news statuses and independent counts exist |
| C-7 | Change tracking New/Updated/Escalated/De-escalated/Corrected; since last visit (§12) | partial | HQ "since your last visit" for followed items |
| C-8 | Three-hour ticker with real timestamps, pause, static alternative, empty state (§12) | missing | |
| C-9 | Major-development banner, deduplicated, optional sound (§12) | missing | |
| C-10 | Economic/geopolitical calendar with sourced actuals (§12) | missing | ECB/Fed calendars public; licence check needed |

## Phase D: briefings, tour, comfort, audio

| ID | Requirement (§) | Status | Notes |
|---|---|---|---|
| D-1 | Written Briefing: direct 24h/3d/7d buttons; frozen snapshot; offer new updates after (§13) | partial → this phase | window chips + one button today |
| D-2 | AI Briefing: direct play of latest voiced 24 h edition with edition time and coverage (§13) | partial → this phase | plays on demand from live data; edition label added this phase |
| D-3 | Scheduled editions 07:00 and 19:00 Europe/Budapest (DST-aware), idempotent, shared, 30-day archive, no regeneration on replay (§13, §14, §25) | missing | needs storage for editions (Supabase table or Workers KV/R2) and a cron trigger; edition logic built so it can move server-side |
| D-4 | About two minutes, modest overrun; every story an EVE–KNOX exchange; no filler; grounded (§13) | partial → this phase | budget 120 s, exchange per story |
| D-5 | Natural voice: evaluated candidates, pronunciation handling, loudness, licensed voices (§13) | partial | ElevenLabs Flash v2.5 for signed-in users; guests get browser voices (disclosed); evaluation script pending |
| D-6 | Captions with speakers and full transcript (§13) | partial → this phase | captions exist; transcript added |
| D-7 | Choreography: region → highlight → travel → precise marker + connected callout; imagery/chart only when useful (§14) | partial | travel + card; connected callout missing |
| D-8 | Remove central spinning radar; reticle only during movement, fading (§14) | missing → this phase | |
| D-9 | Controls: pause/resume, prev/next, seek, exit; synchronised; controls never exit (§14) | working | browser-tested 28/28 |
| D-10 | Auto Tour separate from Comfort Mode; Comfort Mode manual + per-module inactivity (5 min default), exit consumes click, never during tutorials/editing/dialogs/briefing (§15) | partial → this phase | idle tour exists at 90 s; becomes Comfort Mode at 5 min |
| D-11 | Sound preferences: voices, music, interface, alerts; ducking (§15) | missing | music unavailable until rights cleared (no tracks used) |

## Phase E: market, screener, quant, risk, private workspace

| ID | Requirement (§) | Status | Notes |
|---|---|---|---|
| E-1 | Multi-chart workspace: add, resize, reorder, maximise, fullscreen, layout edit, save/load in HQ, linking (§18) | partial | one chart editor with templates and saved charts |
| E-2 | Chart types incl. Heikin-Ashi, Renko; customisation; log scale; presets (§18) | partial | candles, bars, line, area, Heikin-Ashi exist in `chartTypes.ts`; Renko missing |
| E-3 | Screener with filters, saved screens, metric definitions, nulls not zero (§18A) | blocked | needs licensed fundamentals (FMP authenticates; display rights per FMP Data Display Agreement) |
| E-4 | Company dossiers (§18A) | blocked | same data dependency |
| E-5 | Market overview, movers/heatmap with defined universe (§18B) | partial | simulated `.D` instruments, ECB FX, World Bank commodities |
| E-6 | Compare 2–4 instruments, price vs total return (§18B) | partial | relative performance chart exists |
| E-7 | Watchlists separate from portfolios; manual portfolio, import, honest returns (§18B) | partial | watchlist exists; portfolio missing |
| E-8 | Alerts with delivery preferences, not execution (§18B) | partial | in-app price alerts |
| E-9 | Quant tools 1–8: Black–Scholes, Monte Carlo, binomial, finite difference, OLS, PCA/SVD, Cholesky, Kalman, each with Explain/Chart/Data/Code, tests vs reference cases (§19) | partial | Monte Carlo, VaR/ES, frontier, triple barrier, volatility drag exist; the other seven missing |
| E-10 | Regression Lab, Foundations Sandbox, Backtesting Lab per §20 | partial | backtest exists (simple); no train/validation/test, costs partly |
| E-11 | Risk Lab per §21 | partial | VaR/ES (historical, normal, MC), Kupiec |
| E-12 | Private bot workspace, server-enforced, Backtest/Paper/Live, kill switch, reconciliation (§21) | missing | live trading never enabled without owner approval |

## Phase F: Learn, onboarding, help

| ID | Requirement (§) | Status | Notes |
|---|---|---|---|
| F-1 | Learn destination: paths, prerequisites, progress, bookmarks, search, tool links (§22) | missing | |
| F-2 | Lesson template (objective, explanation, visual, formula, code, worked example, mistakes, check, sources, review date) (§22) | missing | |
| F-3 | Varsity-inspired curriculum expansion, original content (§22A) | missing | |
| F-4 | First-visit quick tour, module tutorials, restartable from Help (§23) | missing | |
| F-5 | Contextual help for every layer, icon, indicator, tool; searchable Help & Guides (§23) | partial | some info tooltips |
| F-6 | Intro 6–8 s, skippable, legible tagline, loads app concurrently (§24) | partial | current film longer; needs re-edit |

## Phase G: HQ, search, Brain, Explorer feeds, operations

| ID | Requirement (§) | Status | Notes |
|---|---|---|---|
| G-1 | HQ: saved workspaces (map, layers, panels, charts), watchlists incl. events and routes, saved briefing editions, collections, recent work, learning progress (§16) | partial | resume, following, saved collections and notes done (PR #73); workspace snapshots, routes, editions, learning missing |
| G-2 | Global search incl. events, people, organisations, infrastructure, lessons; Ctrl/Cmd+K plus visible entry (§16) | partial | countries, instruments, pages |
| G-3 | Country comparison 2–4 with units and missing values visible (§16) | working | `/countries/vs` |
| G-4 | Exports with sources, dates, filters (§16) | partial | chart/map image export with source footer |
| G-5 | Event-to-market exposure, explainable channels (§16) | partial | Market Impact chain |
| G-6 | Brain: typed entities, evidence-linked edges, time validity, smooth dragging, settle after interaction (§17) | partial | evidence and pinning exist; layout settling to verify |
| G-7 | Cost controls: shared editions, caching, idempotent jobs, bounded compute, last-known-good data (§25) | partial | AI budget, caches, stale copies |
| G-8 | Visitor analytics with honest definitions (§25) | blocked | Cloudflare Web Analytics token not configured |

## Decisions recorded with this matrix
- **Colour tokens vs brand rule:** the owner's brand rule (gold accent, no blue cast) applies to brand surfaces. This prompt
  asks for cyan/blue selection and information colours on map/data surfaces. Both hold: data semantics get their own
  tokens (`--color-select`, `--color-attention`, severity, actor) used only inside maps, charts and legends; brand chrome
  stays gold. Raised for owner confirmation in the delivery report.
- **References:** product references only; no code, assets or text copied. Videos and private dashboards that cannot be
  opened from the cloud session are reported as not inspected.
