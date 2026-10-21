# Competitive Benchmark & Feature Matrix

_First edition: 2026-10-21 (session run 11). Owner brief: "Competitive superiority & full-spectrum intelligence expansion"._
Companion roadmap for the owner and ChatGPT: `COMPETITIVE_ROADMAP.md` in `agentkarlano-stack/AuroraVeritatis-Knowledge`.
Product references and licence notes: [REFERENCES.md](REFERENCES.md). Patterns only — never copy code, branding, text or data.

## How to read this document
- **Competitor facts** come only from public sources (vendor pages, docs, help centres, GitHub; third-party sources are
  marked). They were researched on 2026-10-21 via web search because the dev sandbox cannot load the sites directly; claims
  marked _unverified_ could not be confirmed. Sources are listed at the end.
- **Aurora capability** is stated against evidence: unit tests (Vitest), browser tests (Playwright against local workerd),
  the live smoke test (`scripts/smoke.sh`) on PR previews and on https://aurorav.app.
- A feature counts as implemented only with working data, meaningful interaction and validation — not because a card or
  button exists.

**Scales.** Effort: S ≤ 1 session · M 2–3 sessions · L 4–8 · XL > 8. Value: H / M / L. Cost: added recurring €/month
at expected early traffic (Cloudflare free tier, Supabase free tier assumed). Priority: P1 (next) … P4 (later/never).
**Status:** Implemented and verified · Implemented but unverified · Partially implemented · Planned · Blocked by licensing ·
Blocked by cost · Not feasible within constraints · Not pursued (policy).

## 1. Current technical and functional level (evidence-based, 2026-10-21)
| Area | Level | Evidence |
|---|---|---|
| Platform & deployment | **Production, verified.** One Worker (`auroraveritatis`) serves SPA + `/api`; Workers Builds deploys `main`; every PR gets a preview + live smoke test | aurorav.app smoke **14/14** at 2026-10-21 20:29:57 UTC (Worker Version `c35ef040`) |
| Real data | World Bank WDI (23 indicators, all economies, 1990–), USGS earthquakes, GDACS disaster alerts, CFTC Commitments of Traders (14 futures markets) | Live smoke checks on production; CFTC on PR #5 preview (17/17) |
| Simulated data | All market prices (`.D` instruments), geopolitical event scenarios | Labelled "Simulated" everywhere |
| Analytics | Monte Carlo (GBM + jumps, VaR/ES), backtesting (MA/RSI, costs, no look-ahead), Strategy Lab scenarios, World Tension Index with sensitivity, Market Impact Radar, COT positioning index | 92 unit tests |
| Accounts | Supabase auth + preference/notes sync implemented; **not active in production** until Worker vars are set and the migration is applied | Tested against an intercepted Supabase API only |
| AI | None in production (Daily Briefing is rule-based) | — |

**Summary.** Aurora is a credible, transparent research prototype with real public data in the country, hazard and
positioning domains. Its largest gaps against the benchmarks are **real market prices, conflict/news event data, company
fundamentals and AI synthesis** — each blocked or shaped by data licensing rather than engineering effort.

## 2. Feature matrix

### 2.1 World Monitor (worldmonitor.app — AGPL-3.0 open source; ideas only, no code reuse)
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WM-1 | Unified layered map (globe + flat, ~56 layers) | One situational picture | SVG world map: USGS, GDACS, simulated scenarios; filters, timeline, event drawer | No | Most layers; zoomable detailed basemap | MapLibre GL + OpenFreeMap tiles; layer registry with source/delay/confidence per layer | OpenFreeMap (free, OSM ODbL attribution) | L | H | €0 | P1 | Partially implemented | Smoke: USGS + GDACS 200 on production |
| WM-2 | News/OSINT aggregation (500+ feeds) | Fast awareness of developments | None | No | All | Worker cron ingests GDELT DOC/GEO API + curated official RSS (headline + link only), dedupe, label `unverified`/`reported` | GDELT (free, cite + link); publisher RSS (link-out only) | L | H | €0–5 | P1 | Planned | — |
| WM-3 | AI-synthesised briefs | Saves reading time | Rule-based Daily Briefing with provenance per line | Partial | Narrative synthesis with citations | Daily cached summary via a small Claude model, citations required, hard monthly cap | Anthropic API | M | H | €5–20 | P2 | Partially implemented | HQ Daily Briefing (Playwright) |
| WM-4 | Country Instability Index (31 countries, 0–100) | Comparable country risk | World Tension Index (global; formula, adjustable weights, sensitivity table) on simulated conflict inputs | Partial (more transparent, less real data) | Per-country index; real conflict inputs | Per-country composite from UCDP + GDELT + GDACS + WB fragility indicators, same transparency | UCDP (token required) · GDELT | L | H | €0 | P1 | Partially implemented | `lib/tension.ts` tests |
| WM-5 | Country briefs (indicators, risks, developments) | Fast country orientation | Dossiers: 23 WB indicators with history, side-by-side (4), Gapminder compare | Exceeds on indicators; lacks risks/developments | Risk factors, recent developments, politics | Add sourced developments feed per country + risk section | GDELT, UCDP, IMF, ReliefWeb | M | H | €0 | P1 | Partially implemented | Smoke: `/api/countries/DEU` live |
| WM-6 | Aviation (ADS-B, incl. military flights) | Air-traffic disruption awareness | None | No | All | Only aggregate, licensed, non-operational views (e.g. airspace closures from official NOTAM summaries) | OpenSky: non-commercial only; Wingbits: commercial | L | M | licence | P4 | Blocked by licensing | — |
| WM-7 | Maritime AIS vessel tracking, ports, chokepoints | Trade disruption awareness | None | No | All | Chokepoint transit counts + port activity (daily, aggregated) rather than vessel tracks | IMF PortWatch (no key; terms unverified) | M | H | €0 | P2 | Planned | — |
| WM-8 | Internet outages (Cloudflare Radar) | Connectivity disruptions by country | None | No | All | Radar layer + dossier "Communications" section | Cloudflare Radar API: **CC BY-NC 4.0** → commercial use needs permission | M | M | €0 | P3 | Blocked by licensing | — |
| WM-9 | Protest/conflict events (ACLED, GDELT, UCDP) | Ground-truth event layer | Simulated scenarios only | No | Real events | UCDP GED + candidate events (monthly), GDELT (unverified media signal) | UCDP (token) · ACLED (restrictive licence) · GDELT | M | H | €0 | P1 | Planned | — |
| WM-10 | Strategic infrastructure (cables, chokepoints, ports) | Exposure analysis | Chokepoints referenced in Impact Radar text | No | Map layers | Curated static GeoJSON with sources; PortWatch ports | PortWatch; curated public sources | M | M | €0 | P2 | Planned | — |
| WM-11 | Finance/commodity dashboards | Market context | Market Terminal (simulated prices) + CFTC positioning (real) | Partial | Real prices | See TV-11 | — | — | H | — | P1 | Partially implemented | PR #5 preview smoke |
| WM-12 | Alerts & watchlists | Proactive monitoring | Watchlist + price-alert rules (on simulated prices, in-app only) | Partial | Delivery, event/country alerts | Cron Triggers + Resend email (key exists), per-user rules in Supabase | Resend (existing account) | M | H | €0 | P2 | Partially implemented | Playwright (HQ alerts) |
| WM-13 | Desktop app / CLI | Power users | Responsive web + mobile nav | n/a | — | Not planned | — | — | L | — | P4 | Not pursued | — |
| WM-14 | Refresh cadence 5–15 min | Freshness | USGS 10 min, GDACS 30 min, COT 6 h, WB 24 h edge cache | Parity for shared layers | — | — | — | — | — | — | — | Implemented and verified | Smoke |

### 2.2 Koyfin
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KO-1 | Equity screener (100k+ securities, thousands of criteria) | Idea generation | None | No | All | US-listed screener on **reported** fundamentals from SEC XBRL frames (no prices) | SEC EDGAR (public; 10 req/s, User-Agent) | XL | H | €0 | P2 | Planned | — |
| KO-2 | Financial statements (10 y) | Fundamental analysis | None | No | All | Statements from SEC companyfacts, labelled "as filed" | SEC EDGAR | L | H | €0 | P2 | Planned | — |
| KO-3 | Earnings/conference transcripts | Qualitative research | None | No | All | — | Proprietary | — | M | licence | P4 | Blocked by licensing | — |
| KO-4 | Custom dashboards | Personal workflow | HQ: 8 widgets, reorder/hide, saved layout, density pending | Partial | Multiple named dashboards, widget config | Named workspaces in prefs store (synced) | — | M | H | €0 | P2 | Partially implemented | Playwright |
| KO-5 | Macro dashboards | Economic context | Annual WB indicators per country | Partial | High-frequency macro (CPI, rates, FX, PMI-free alternatives) | IMF/ECB/Eurostat/public-domain FRED series via Worker, cached | IMF (publish with citation), ECB (quote source), Eurostat (CC BY 4.0), FRED public-domain series only | M | H | €0 | P1 | Partially implemented | Smoke `/api/compare` live |
| KO-6 | Watchlists with data columns | Monitoring | Watchlist (simulated instruments) with change/sparkline | Partial | Real data, configurable columns | After TV-11 | — | S | M | €0 | P3 | Partially implemented | — |
| KO-7 | Portfolio analytics | Risk & attribution | None | No | All | Read-only CSV import; exposures by country/sector/currency; VaR via existing Monte Carlo; stress scenarios from Strategy Lab | User-supplied holdings | L | H | €0 | P2 | Planned | — |
| KO-8 | Custom formulas | Analyst flexibility | None | No | All | Safe expression engine over series (no eval) | — | M | M | €0 | P3 | Planned | — |
| KO-9 | Rebased comparison charts | Relative performance | Up to 3 instruments rebased to 100 with correlation | Parity (on simulated data) | Real prices | — | — | — | M | — | — | Implemented and verified (simulated data) | Playwright |

### 2.3 TradingView
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TV-1 | Chart types (20+) | Visual analysis | Candles, line, volume (Lightweight Charts, Apache-2.0, attribution kept) | Partial | Heikin Ashi, bars, area, log scale | Add series types/transforms | — | S | M | €0 | P3 | Partially implemented | Playwright |
| TV-2 | Indicators (100+ built-in) | Technical analysis | SMA 20/50, EMA 20, Bollinger, RSI + return/vol/drawdown stats | Partial | Breadth (MACD, ATR, VWAP, stochastics…) | Extend `lib/technical.ts` (tested) | — | M | M | €0 | P3 | Partially implemented | Unit tests |
| TV-3 | Drawing tools (110+) | Annotation | Horizontal levels, trend lines, persisted per instrument | Partial | Fibonacci, channels, text | Extend native click handler | — | M | M | €0 | P3 | Partially implemented | Playwright |
| TV-4 | Multi-chart layouts (up to 16) | Cross-asset view | Single chart + rebased comparison | No | Grid layouts with sync | 2/4-chart grid with synced crosshair | — | M | M | €0 | P3 | Planned | — |
| TV-5 | Alerts (price/indicator, webhook) | Monitoring | In-app price rules (simulated prices) | Partial | Indicator conditions, delivery | See WM-12 | Resend | M | H | €0 | P2 | Partially implemented | — |
| TV-6 | Screeners & heatmaps | Market overview | COT overview table (sortable by positioning index) | Partial | Price/fundamental screener, heatmap | After TV-11/KO-1 | — | L | M | €0 | P3 | Partially implemented | PR #5 |
| TV-7 | Scripting (Pine Script v6) | Custom studies | Rule presets (MA crossover, RSI) | Partial | User-defined rules | **Original** rule editor (conditions × indicators), no Pine compatibility | — | L | H | €0 | P2 | Partially implemented | `lib/backtest.ts` tests |
| TV-8 | Strategy tester / deep backtesting | Validate ideas | Backtest with costs, CAGR, Sharpe, drawdown, exposure; no look-ahead tested | Partial (simulated prices) | Real data, walk-forward, optimisation with overfitting guard | Walk-forward + parameter grid with out-of-sample split | Real prices (TV-11) | M | H | €0 | P2 | Partially implemented | Unit tests |
| TV-9 | Bar replay | Training | None | No | — | Low priority | — | S | L | €0 | P4 | Planned | — |
| TV-10 | Saved chart layouts | Workflow | Style, indicators, range, drawings remembered per instrument | Partial | Named layouts | Named layouts in prefs (synced) | — | S | M | €0 | P3 | Partially implemented | Playwright |
| TV-11 | Real market data | Everything above depends on it | None — all prices simulated (`.D`) | No | Real prices | (1) **ECB reference FX rates** daily — free, display allowed with "Source: ECB"; (2) end-of-day equities/indices only via a licensed vendor within budget after owner approval | ECB/Frankfurter (free); Twelve Data / Alpha Vantage display terms **unverified**; FMP free tier forbids display | S (FX) · M (vendor) | H | €0 (FX) · €10–80 (vendor) | P1 | Blocked by cost (equities); Planned (FX) | — |
| TV-12 | Event studies on charts | Aurora differentiator | Demo events annotated on charts; Impact Radar mechanisms | Exceeds conceptually | Real events + real prices | Event-study engine (abnormal returns vs. window) once TV-11 + WM-9 exist | — | M | H | €0 | P2 | Partially implemented | — |

### 2.4 CFR Global Conflict Tracker
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CFR-1 | Conflict dossiers (~30): background, developments, resources | Structured understanding | None (Radar shows simulated scenarios) | No | All | `/conflicts/:id` profiles: UCDP fatalities history chart, sourced timeline (official/primary sources), affected countries → dossiers, market channels → Impact Radar | UCDP (token), curated sources with citations | L | H | €0 | P1 | Planned | — |
| CFR-2 | Status (worsening/unchanging/improving) + impact (critical/significant/limited) | Quick triage | None | No | Taxonomy + method | Rule-based status from 90-day vs. prior-period event trends, method published; analyst override recorded with date | UCDP / GDELT | M | H | €0 | P1 | Planned | — |
| CFR-3 | Filters by region/type/status/impact | Navigation | Radar filters: type, severity, region, time window | Partial | Status/impact filters | With CFR-1/2 | — | S | M | €0 | P2 | Partially implemented | Playwright |
| CFR-4 | Documented methodology & review dates | Trust | Tension Index method + sensitivity; Status page lists sources/licences | Partial | Per-dossier review date | Review date + changelog per dossier | — | S | H | €0 | P1 | Partially implemented | — |
| CFR-5 | Interactive conflict map | Orientation | Map with simulated markers | Partial (simulated) | Real conflicts | With WM-9 | — | — | H | — | P1 | Partially implemented | — |

### 2.5 Conflictly (mainly an iOS app; little public documentation)
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CY-1 | 3D globe dashboard | Visual appeal | 2D map | No | Globe | MapLibre globe projection (same stack as WM-1) only where it aids analysis | — | S (after WM-1) | L | €0 | P4 | Planned | — |
| CY-2 | Conflict-zone severity scores | Triage | Global Tension Index | Partial | Per-zone scores | With CFR-2 | — | — | H | — | P1 | Planned | — |
| CY-3 | Military aircraft / naval vessel trackers | Situational awareness | None | No | — | Not built: operational military tracking conflicts with the owner's policy; licensed data required | — | — | — | — | — | Not pursued (policy) | — |
| CY-4 | 24 h OSINT feed | Freshness | None | No | — | = WM-2 | GDELT | — | H | — | P1 | Planned | — |
| CY-5 | AI daily briefing / AI chat (paid) | Synthesis | Rule-based briefing | Partial | AI | = WM-3, AI-1 | Anthropic API | — | H | — | P2 | Partially implemented | — |
| CY-6 | PDF/CSV/Markdown export (paid) | Reporting | CSV (Lab, COT), briefing copy-as-text | Partial | PDF/Markdown briefs | Client-side Markdown + print-to-PDF stylesheet | — | S | M | €0 | P2 | Partially implemented | Playwright (CSV) |

### 2.6 Trading 212 (consumer broker — Aurora stays read-only, no execution)
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T212-1 | Pies (target allocations) | Simple portfolio construction | None | No | All | Read-only model portfolios with target weights, drift and rebalancing *suggestions* (no orders) | User input | M | M | €0 | P2 | Planned | — |
| T212-2 | AutoInvest / savings plans | Long-term planning | Monte Carlo engine | Partial | Contribution schedule | Savings-plan Monte Carlo with contributions, fees, inflation; percentile outcomes | — | S | M | €0 | P2 | Planned | `lib/montecarlo.ts` |
| T212-3 | Portfolio performance (MWRR) | Self-assessment | None | No | All | MWRR/TWRR from imported transactions | User CSV | M | M | €0 | P3 | Planned | — |
| T212-4 | Multi-currency / FX exposure | Currency risk | None | No | All | Currency exposure + FX scenarios from ECB rates | ECB | S | M | €0 | P2 | Planned | — |
| T212-5 | Public API (beta, read scopes) | Import holdings | None | No | Import | User-held key used client-side only, read scopes; terms for third-party apps **unverified** → owner/legal check first | Trading 212 API | M | M | €0 | P3 | Blocked by licensing (terms review) | — |
| T212-6 | Mobile-first UI | Accessibility | Responsive layouts, bottom nav, no-overflow checks | Parity | — | — | — | — | — | — | — | Implemented and verified | Playwright mobile suites |
| T212-7 | Geopolitical stress test of a portfolio | **Aurora differentiator** (not offered by T212) | Strategy Lab scenarios (single instrument) | Exceeds conceptually | Portfolio level | Scenario shocks mapped to holdings via Impact Radar channels | — | M | H | €0 | P2 | Planned | — |

### 2.7 Institutional, trade and research references (owner brief §3)
| ID | Feature — description | Why useful | Aurora today | Parity | Missing | Feasible implementation | Data provider · licence | Effort | Value | Cost | Prio | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| INST-1 | **CFTC Commitments of Traders dashboard** | Positioning/crowding context | `/positioning`: 14 markets, net spec/commercial/small, weekly change, % OI, 156-wk index + percentile + extremes, 3/10/20-yr charts, CSV, method | Partial parity with brief §3D | Positioning vs. price (needs TV-11); Disaggregated & TFF reports | Add datasets `72hh-3qpy` (Disaggregated), `gpe5-46if` (TFF) | CFTC Socrata (public, no key) | S per report | H | €0 | P1 | Implemented and verified | 92 unit tests; Playwright 22/22; live CFTC on PR #5 preview: smoke 17/17, all 14 markets returned |
| INST-2 | SEC Schedule 13D/13G ownership | Activist/stake tracking | None | No | All | Parse structured 13D/G XML (mandatory since 2024-12-18); issuer ↔ filer graph; amendments timeline | SEC EDGAR | L | H | €0 | P1 | Planned | — |
| INST-3 | Form 13F holdings | Institutional ownership | None | No | All | Quarterly data sets; label 45-day reporting delay | SEC | L | H | €0 | P2 | Planned | — |
| INST-4 | Form ADV adviser directory | Adviser research | None | No | All | Monthly bulk files; post-2025 bulk format **unverified** | SEC IAPD | L | M | €0 | P3 | Planned | — |
| INST-5 | Form 4 insider transactions | Insider activity | None | No | All | EDGAR submissions per issuer | SEC | M | M | €0 | P2 | Planned | — |
| INST-6 | European net short positions | Short interest | None | No | All | Per-regulator ingest (formats differ; UK FCA now publishes aggregated ANSP) | NCAs (reuse terms per regulator unverified) | L | M | €0 | P3 | Planned | — |
| INST-7 | Financial relationship networks | Ownership/control mapping | None | No | All | 2D force graph over INST-2/3/4 edges (sourced edges only) | SEC | L | H | €0 | P3 | Planned | — |
| INST-8 | Commodity trade flows + Sankey | Supply-chain exposure | None | No | All | Annual bilateral flows by HS code; Sankey origin → destination | UN Comtrade (free key, 500 calls/day; redistribution **unverified**) | L | H | €0 | P2 | Planned | — |
| INST-9 | Public procurement search | Tender intelligence | None | No | All | EU TED Search API v3 | TED (free reuse, attribution) | M | M | €0 | P3 | Planned | — |
| INST-10 | AI Paper Lab | Reproducible research | Monte Carlo/backtest engines exist | No | Upload, extraction, experiment builder | Supported model families only; parameters extracted by AI, executed by tested engines | Anthropic API | XL | H | €10–40 | P3 | Planned | — |
| INST-11 | Multi-agent research desk + AI Ops dashboard | Scaled research | None | No | All | Few specialised agents (research, filings, verification, reporting) with job log, cost meter, hard caps; owner-only | Anthropic API, Supabase | XL | H | €20–80 | P3 | Planned | — |

## 3. Highest-value missing functions (ranked)
Ranking = value × urgency × feasibility within budget and licences.

| Rank | Function | Why first | Dependency |
|---|---|---|---|
| 1 | Real FX + macro series (ECB, IMF, Eurostat, public-domain FRED) | Replaces simulated data where licences allow; feeds dashboards, portfolio FX risk, event studies | None |
| 2 | Real conflict events + conflict dossiers (UCDP + curated sources) | Core of the geopolitical promise; replaces simulated Radar scenarios | **UCDP token (owner request)** |
| 3 | News/OSINT layer (GDELT, labelled unverified) | Freshness parity with World Monitor | None |
| 4 | SEC ownership research (13D/13G → 13F → network) | Distinctive institutional capability | None |
| 5 | Live accounts (Supabase) + alert delivery | Personalisation, retention | **Owner: Worker vars + migration** |
| 6 | Read-only portfolio research + geopolitical stress test | Differentiator vs. brokers | Rank 1 |
| 7 | Detailed map stack (MapLibre) + infrastructure/chokepoint layers | Situational awareness | None |
| 8 | Rule editor + walk-forward backtesting | Quant parity | Real prices for meaningful results |
| 9 | Trade flows + Sankey (Comtrade) | Supply-chain intelligence | Terms check |
| 10 | AI briefs with citations (cost-capped) | Synthesis | Owner budget confirmation |

## 4. How Aurora can surpass each benchmark
- **World Monitor:** every layer carries provenance, delay and confidence; indices publish formula, weights and a
  robustness range (already true for the Tension Index); events link directly to country dossiers and market channels.
- **Koyfin:** macro and fundamentals placed next to the geopolitical and supply-chain exposure of a country or company.
- **TradingView:** event studies and geopolitical scenario overlays on the same chart; positioning context (COT) next to
  price; reproducible, exportable backtests with explicit no-look-ahead guarantees.
- **CFR:** quantitative trend charts, comparative regional views and economic consequence links in every conflict dossier,
  with review dates and sources.
- **Conflictly:** depth and verifiability rather than real-time military tracking.
- **Trading 212:** portfolio stress testing against geopolitical, currency and commodity scenarios — analysis a broker app
  does not provide — while staying read-only.

## 5. Operating-cost view (recurring, €/month)
| Item | Now | With ranks 1–5 | With AI (ranks 10, INST-10/11) |
|---|---|---|---|
| Cloudflare Workers (free tier: 100k req/day) | 0 | 0 (Paid plan €5 only if traffic exceeds) | 0–5 |
| Supabase (free tier) | 0 | 0 | 0–25 |
| Public data APIs (WB, USGS, GDACS, CFTC, SEC, ECB, IMF, GDELT, UCDP) | 0 | 0 | 0 |
| Licensed EOD equity data (optional, owner approval) | 0 | 10–80 | 10–80 |
| AI models (capped) | 0 | 0 | 20–100 |
| **Total** | **0** | **0–85** | **30–210 → keep caps so the total stays ≤ €200** |

## 6. Sources (competitor research, 2026-10-21)
World Monitor: github.com/koala73/worldmonitor (README, licence) · worldmonitor.app/pricing.md · worldmonitor.app/docs/data-sources.md ·
worldmonitor.app/docs/features · worldmonitor.app/country-instability-index/.
Koyfin: koyfin.com · koyfin.com/pricing-llm-info/ · koyfin.com/llm-info/ · koyfin.com/features/financial-analysis/.
TradingView: tradingview.com/pricing/ · TradingView help centre (alerts, heatmaps, parallel charts) · tradingview.com/pine-script-docs ·
github.com/tradingview/lightweight-charts (Apache-2.0; attribution required — Aurora keeps `attributionLogo` on and credits
TradingView in the footer).
CFR: cfr.org/global-conflict-tracker · cfr.org/global-conflict-tracker/methodology.
Conflictly: conflictly.app · App Store listing id6794010515 (features per listing; data sources and methodology unverified).
Trading 212: docs.trading212.com · trading212.com/multi-currency · helpcentre.trading212.com (portfolio charts).
Data terms: sec.gov/os/accessing-edgar-data · sec.gov/developer · cftc.gov/MarketReports/CommitmentsofTraders · gdacs.org terms ·
ucdp.uu.se/apidocs · developers.cloudflare.com/radar · acleddata.com/eula · gdeltproject.org/about.html · imf.org copyright and terms ·
frankfurter.dev · fred.stlouisfed.org/docs/api/terms_of_use.html · portwatch.imf.org · docs.ted.europa.eu.
