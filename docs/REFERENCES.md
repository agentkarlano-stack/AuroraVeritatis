# Product, Design & Data References

Owner-supplied benchmarks (2026-10-20). **Patterns only**: we learn from layouts, chart types and interactions, never copy
code, artwork, branding, text or datasets. Data licences must be verified before anything is ingested. Public pages do not
name these products. AV's differentiator stays the *link* between geopolitics and markets with explicit provenance.

## Planned platform map (owner, Oct 2026)
| Module | Route | Benchmarks | Built so far |
|---|---|---|---|
| Global Radar | `/radar` | World Monitor · Conflictly · ACLED · Liveuamap · CFR Conflict Tracker | Map, layers, filters, timeline, live USGS, simulated scenarios |
| Market Terminal | `/markets`, `/impact` | TradingView · Koyfin · OpenBB · Quiver Quant | Lightweight Charts, indicators, stats, Market Impact Radar |
| Country Dossiers | `/countries` | Our World in Data · Gapminder · Cloudflare Radar | 23 World Bank indicators, history charts, Gapminder-style Compare explorer |
| Quant Research | `/lab` | Orion RFX · OpenBB | Monte Carlo VaR/ES, CI, sensitivity, CSV |
| AI Intelligence | — | EVE · KNOX · Reports | Planned (Phase 4) |
| Headquarters | `/hq` | Personalised workspace (World Monitor, Koyfin dashboards) | 7 widgets, layouts, watchlist, alerts, notes |

## What to learn from each
| Reference | Pattern worth adopting | Status / next |
|---|---|---|
| World Monitor | Dense situation-room: many toggleable layers, region-grouped live feeds, compact panels | Next: HQ density mode, regional feed panels |
| Liveuamap | Event list ↔ map sync, time-stamped icons per event type | Partly (list/map sync). Next: category icons |
| Conflictly | Clear consumer conflict map + news context | Benchmark for clarity |
| CFR Global Conflict Tracker | Conflict profiles with trend (worsening / unchanged / improving), impact, background, sourced developments | Next: conflict profile pages (needs curated sources) |
| ACLED Conflict Index | Transparent multi-indicator conflict ranking (deadliness, diffusion, danger, fragmentation) | Use as methodology reference for World Tension Index calibration |
| Cloudflare Radar Outage Center | Internet outages by country with cause and duration | Next: "Communications" dossier section + Radar layer (API token needed) |
| Flightradar24 | Aviation layer UX | Deferred: needs licensed ADS-B data |
| TradingView | Chart workspace: symbol search, interval bar, drawing tools, saved layouts | Partly. Next: symbol search, drawings, saved layouts |
| Koyfin | Macro dashboards, watchlist columns, multi-series comparison | Next: watchlist columns, comparison chart |
| OpenBB | Research terminal workflows | Ideas only (AGPL-3.0 — no code reuse without licence review) |
| Quiver Quant | Alternative-data panels (insider/congress trades) | Planned "Whale & insider tracker" from public SEC Form 4 data |
| Orion RFX | Probability/scorecard displays | Lab & AI Signal Scorecard UX |
| Our World in Data | Clean single-indicator charts with sources and notes | Dossier charts follow this pattern |
| Gapminder | Animated bubble chart (x, y, size, colour, year) | ✅ `/countries/compare` on World Bank data |
| Trading 212 | Simple mobile-first instrument pages | Next: mobile instrument page, bottom nav |

## Data sources: licence notes (verify before use)
| Source | Use | Licence / access | Status |
|---|---|---|---|
| World Bank WDI | Dossiers, Compare | CC BY 4.0, no key | ✅ integrated (live call unverified from sandbox) |
| USGS earthquake feed | Radar layer | Public domain | ✅ integrated (live call unverified from sandbox) |
| Our World in Data | Dossier breadth | Mostly CC BY; per-dataset check | Candidate (Phase 2) |
| Cloudflare Radar API | Internet outages | Free with Cloudflare API token; attribution | Candidate — needs owner token |
| ACLED | Conflict events, index | Registration; commercial use needs licence | Blocked on licence decision |
| UCDP | Conflict events | CC BY 4.0; API token required | Candidate — needs token |
| GDELT | News-derived events (unverified) | Open, cite | Candidate; label as "unverified" |
| ReliefWeb / GDACS | Humanitarian, disasters | Open APIs | Candidate |
| SEC EDGAR (Form 4) | Insider transactions | Public domain; fair-access rate limits | Candidate |
| Flightradar24, Liveuamap, Koyfin, TradingView data, Quiver | — | Proprietary | Not used |
