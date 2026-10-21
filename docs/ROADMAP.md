# Roadmap

## Phase 1 — Foundation ✅ (this PR)
App skeleton, branding, Headquarters, Conflict Radar, country dossiers, markets terminal, Research Lab, auth scaffolding,
Cloudflare build config, CI, docs.

## Phase 2 — Real data & accounts
- Verify Worker data routes on a Cloudflare preview (World Bank, USGS).
- Geopolitical events: evaluate GDELT 2.0 (event/GKG; unverified-media provenance), UCDP GED (CC BY 4.0, research-grade, lagged), ReliefWeb API, GDACS.
- Real market data: evaluate licensed options within budget (e.g. ECB reference FX rates via Frankfurter, FRED with key, Alpha Vantage/Twelve Data free tiers). Label delayed/EOD clearly.
- Apply Supabase migration (owner approval), enable auth, sync `prefs` to `user_preferences`, notes to `research_notes`.
- PostHog (EU, consent-gated). Cloudflare Rate Limiting binding. Mobile QA pass.

## Phase 3 — Advanced analysis
Benchmarks and platform map: see [REFERENCES.md](REFERENCES.md).
- CFR-style conflict profiles (trend: worsening/unchanged/improving, impact, sourced timeline); TradingView-style chart workspace (symbol search, drawing tools, saved layouts); Koyfin-style watchlist columns and comparison charts; HQ density mode; mobile bottom navigation.
Market Impact Radar, calibrated World Tension Index, Strategy Lab/backtesting, historical timelines, politics data,
alerts infrastructure (Cron Triggers + Resend), MapLibre detailed map.

## Phase 4 — AI & automation
EVE & KNOX (cost-capped, cached, cited), private AI Operations HQ (owner-only, server-side authz), n8n workflows, marketing automation, cost tracking.

## Phase 5 — Commercial launch (requires owner authorisation)
Stripe (separate AV account), tier gating from `src/data/tiers.ts`, legal review, security audit, lifecycle tests.
