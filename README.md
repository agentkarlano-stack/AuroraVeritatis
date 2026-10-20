# Aurora Veritatis

**Global analysis & strategic insight.** A geopolitical, economic and financial intelligence platform that connects world events to the countries, assets and markets they affect.

Production domain (not yet live): `aurorav.app` · Hosting: Cloudflare Workers · Backend: Supabase

> **Status: v0.1 foundation (pre-release).** Demonstration content is clearly labelled in the product. Nothing here is investment advice.

## What works in v0.1

| Module | Route | State |
|---|---|---|
| Homepage & navigation | `/` | Working. Responsive, with a mobile drawer. |
| Headquarters dashboard | `/hq` | Working. Widgets can be reordered and hidden; a country watchlist and analyst preference (EVE/KNOX) persist locally and sync to Supabase when signed in. |
| Global Radar (map) | `/radar` | Working map (pan, zoom, pinch, layers, filters). Chokepoints are **reference data**. Events are **fictional sample records**. |
| Country intelligence | `/countries`, `/countries/:iso3` | Working. 33 profiles. **Live** indicators from World Bank Open Data with year and source, via the Worker (cached 24 h). |
| Markets & economics | `/markets` | Working charts (relative performance, candles, SMA, RSI, correlation matrix, Market Impact Radar). **All prices are synthetic.** |
| Quantitative Research Lab | `/lab` | Working. SMA-crossover, RSI-reversion and buy-and-hold backtests on demo series or a pasted CSV, computed in the browser. |
| Accounts | `/account` | Working sign-up, sign-in, reset and sign-out against Supabase Auth **once Supabase is configured**. Otherwise disabled with a notice. |
| Plans | `/plans` | Proposed tiers only. No payments. |

**Not yet built** (shown as "Planned" in the UI): live OSINT feed, aircraft and vessel tracking, licensed market data, EVE/KNOX AI, voice, alerts, Stripe subscriptions.

## Quick start

```bash
npm install
npm run check        # typecheck + unit tests + production build
npm run dev          # build + local preview with the real API handler on http://localhost:8787
npm run dev:worker   # full Cloudflare runtime via wrangler dev (needs `npm run build` output)
```

Optional for local accounts: copy `.dev.vars.example` to `.dev.vars` and fill in the **public** Supabase URL and anon key.

## Stack

- **Client:** React 19 + TypeScript, bundled with esbuild into `dist/client`. Tiny in-house router, no CSS framework.
- **Charts and map:** d3-scale / d3-shape / d3-geo rendering SVG. Natural Earth 1:110m basemap from `world-atlas`.
- **Edge API:** Cloudflare Worker (`src/worker/index.ts`) on `/api/*`, with Workers Static Assets serving the SPA.
- **Data and auth:** Supabase (Auth + Postgres with RLS). Schema in `supabase/migrations/`.
- **Cost:** the free tiers of Cloudflare Workers, Supabase and World Bank Open Data cover v0.1, so it costs €0/month. See `docs/ARCHITECTURE.md`.

## Repository layout

```
src/client/     React app (pages, components, lib)
src/shared/     Pure TypeScript shared by client and worker (data registries, quant maths, parsers)
src/worker/     Cloudflare Worker API
supabase/       SQL migrations
scripts/        build and local preview
tests/          node:test unit tests
docs/           architecture, deployment, data policy, progress reports
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment & environments](docs/DEPLOYMENT.md)
- [Supabase setup](docs/SUPABASE.md)
- [Data policy](docs/DATA_POLICY.md)
- [Roadmap](docs/ROADMAP.md)
- [Backlog & priorities](docs/BACKLOG.md)
- [Integrations](docs/INTEGRATIONS.md)
- [Security](docs/SECURITY.md)
- [Progress log](docs/DEVELOPMENT_PROGRESS.md)

## Ground rules

1. No fabricated live data. Synthetic and sample content is always labelled.
2. No secrets in the repo. Only public Supabase values are exposed to the browser.
3. No paid services without explicit approval. The budget ceiling is €200/month.
4. No production deploys without review. Changes land through pull requests.
