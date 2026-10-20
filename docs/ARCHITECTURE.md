# Architecture

## Overview

```
Browser (React SPA)
   │  static files: index.html, /assets/*, /geo/*      ← Workers Static Assets (free, CDN-cached)
   │  /api/*                                             ← Cloudflare Worker (run_worker_first)
   │                                                        ├─ /api/health
   │                                                        ├─ /api/config      public runtime config
   │                                                        ├─ /api/events      sample events (demo: true)
   │                                                        ├─ /api/chokepoints reference data
   │                                                        ├─ /api/countries[/:iso3]
   │                                                        └─ /api/countries/:iso3/indicators → World Bank API (Cache API, 24 h)
   │
   └─ Supabase (direct from browser, anon key + user JWT, protected by RLS)
        ├─ Auth: sign-up / sign-in / recovery
        └─ Postgres: profiles, user_preferences, watchlists, plan_limits
```

### Why this shape

- **One Worker serves both the SPA and the API.** That means one deploy unit and one domain (`aurorav.app`), with no CORS.
- **Runtime config comes from `/api/config`.** Supabase URL and anon key live in Worker variables, not in the bundle, so the same build runs in preview and production.
- **Supabase is reached directly from the browser** for user data, because RLS enforces ownership. Server-only work (ingestion, billing webhooks, AI calls) will run in the Worker with secrets set through `wrangler secret`.
- **Shared code in `src/shared/` stays pure** (no DOM or Worker APIs), so quant maths, parsers and registries are unit-tested in Node and reused on both sides.

## Client

| Path | Responsibility |
|---|---|
| `lib/router.tsx` | History-API router (`Link`, `useRouter`, `matchPath`). The Worker's SPA fallback makes deep links work. |
| `lib/config.ts` | Loads `/api/config` once; `getJson` helper. |
| `lib/supabase.ts` | `SupabaseLite`: Auth (GoTrue) and PostgREST over `fetch`, about 3 KB. Its interface mirrors the parts of `@supabase/supabase-js` we use, so it can be swapped for the SDK later. |
| `lib/auth.tsx` | `AuthProvider` / `useAuth`: status (`loading`, `unconfigured`, `signed-out`, `signed-in`), session restore and refresh, profile. |
| `lib/prefs.tsx` | `HqPrefsProvider` / `useHqPrefs`: Headquarters layout, watchlist and agent. Saved in localStorage and upserted to `user_preferences` when signed in. |
| `components/WorldMap.tsx` | d3-geo Natural Earth projection, SVG, pan/zoom/pinch, chokepoint and event layers, country selection. |
| `components/charts.tsx` | SVG `LineChart`, `BarChart`, `CandleChart`, `Sparkline` with hover tooltips. The palette is validated for colour-vision deficiency against the panel surface. |

## Shared

| Path | Responsibility |
|---|---|
| `shared/data/countries.ts` | Structural country facts only: codes, capital, region, currency, memberships. Numeric ids match world-atlas. |
| `shared/data/chokepoints.ts` | Chokepoint coordinates and qualitative market transmission channels (the Market Impact Radar seed). |
| `shared/data/sampleEvents.ts` | **Fictional** event records with `demo: true` and `verified: false`. |
| `shared/data/demoMarkets.ts` | Generic synthetic instruments (`DEMO-*`), deterministic seeded random walks. |
| `shared/quant/*` | Indicators (SMA, EMA, RSI, MACD, volatility, drawdown, correlation), a no-look-ahead backtester and a CSV parser. |
| `shared/geo/topojson.ts` | Minimal TopoJSON → GeoJSON decoder. |
| `shared/worldbank.ts` | WDI indicator definitions, URLs and response parsers. |

## Build

`scripts/build.mjs` uses esbuild to bundle `src/client/main.tsx` into hashed `/assets/main-[hash].{js,css}`, writes `index.html`, copies `public/` (including `_headers` security headers and CSP), and copies `world-atlas/countries-110m.json` to `/geo/`. Wrangler bundles the Worker from TypeScript at deploy time.

Vite was not used because the first release was built in an environment without registry access. esbuild covers the needs of this app; moving to Vite with `@cloudflare/vite-plugin` later is a mechanical change.

## Cost model (v0.1)

| Service | Plan | Monthly cost |
|---|---|---|
| Cloudflare Workers + Static Assets | Free (100k requests/day) | €0. Upgrade to Paid ($5) only when traffic needs it. |
| Supabase | Free (50k MAU, 500 MB DB) | €0. Note that free projects pause after 7 days of inactivity. |
| World Bank Open Data | Free, no key, CC BY 4.0 | €0 |
| Resend (future) | Free (3,000 emails/month) via Supabase custom SMTP | €0 |
| n8n (future) | Self-hosted on a small VPS, or the Worker Cron Triggers | €0–10 |

## Planned evolution

- **OSINT ingestion:** n8n or Worker Cron → normalise → Supabase `events` table with source, verification status and confidence → `/api/events` (the `demo` flag becomes false only for verified feeds).
- **Map:** move to MapLibre GL + OpenFreeMap tiles once raster and vector layers (vessels, aircraft) are needed.
- **Charts:** TradingView Lightweight Charts for the Prime Terminal once real OHLC data is licensed.
- **AI (EVE/KNOX):** Worker endpoint with a server-side API key, per-plan rate limits from `plan_limits`, and source-grounded prompts only.
