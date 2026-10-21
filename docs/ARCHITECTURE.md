# Architecture

```
Browser (React SPA) ──► Cloudflare Worker "auroraveritatis" (aurorav.app)
                          ├─ /api/*  → worker/index.ts  ──► World Bank API, USGS feed (edge-cached)
                          └─ other   → static assets (SPA fallback, _headers CSP)
Browser ──► Supabase Auth / Postgres (RLS)   [enabled when SUPABASE_URL + SUPABASE_ANON_KEY are set]
```

## Decisions
| Decision | Rationale |
|---|---|
| Single Worker serving SPA + API (`@cloudflare/vite-plugin`) | Matches the existing Cloudflare Worker and Workers Builds GitHub integration; zero extra hosting cost. |
| `run_worker_first: ["/*", "!/assets/*", "!/brand/*", …]` | API calls and page navigations hit the Worker (route-specific `<head>` tags for crawlers and link previews via HTMLRewriter); hashed bundles and static files bypass it (free, fast). |
| Public config at runtime via `/api/config` | Enabling Supabase/PostHog needs only dashboard vars, no rebuild. Only public values are exposed. |
| SVG world map (d3-geo + Natural Earth 110m) instead of a tiled map | No tile provider, licence or API key; lightweight; fully testable. MapLibre/OpenFreeMap can be added for detailed zoom later. |
| TradingView Lightweight Charts (Apache-2.0) | Professional financial charts; attribution logo kept enabled as the licence requires. |
| Custom SVG charts for Lab/dossiers | Tiny, themeable, no extra dependency. |
| Zustand + localStorage for preferences | Works for guests; same shape will sync to Supabase `user_preferences`. |
| Deterministic seeded RNG (Mulberry32) | Reproducible simulations and stable synthetic demo data. |
| Edge Cache API with `s-maxage` (1 day World Bank, 10 min USGS) | Keeps upstream calls and Worker CPU minimal on the free tier. |

## Data provenance model
Every event carries `provenance: confirmed | estimate | unverified | simulated` and a `source {name,url,license}`.
Country indicators carry the source, licence and reference year. UI shows `ProvenanceBadge` everywhere data appears.

## Directory layout
See CLAUDE.md "Codebase map".
