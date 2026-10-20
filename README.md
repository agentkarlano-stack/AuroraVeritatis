# Aurora Veritatis

**Global Analysis & Strategic Insight** — a geopolitical, economic and financial intelligence platform.
Production: <https://aurorav.app> · Contact: auroraveritatissup@gmail.com

React + TypeScript single-page app served by a Cloudflare Worker, which also hosts a small `/api` layer.
Supabase provides auth and user data (opt-in via environment variables).

## Quick start

```bash
nvm use            # Node 22
npm install
cp .dev.vars.example .dev.vars   # optional: Supabase / PostHog public settings
npm run dev        # Vite + Cloudflare Worker runtime at http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with the Worker running in workerd |
| `npm run build` | Typecheck + production build (`dist/`) |
| `npm run preview` | Serve the production build locally through the Worker |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc -b`, Vitest |
| `npm run check` | All of the above |
| `npm run deploy` | Build and `wrangler deploy` (normally done by Cloudflare Workers Builds) |

## What works today

See `/status` in the app or [docs/DEVELOPMENT_PROGRESS.md](docs/DEVELOPMENT_PROGRESS.md). In short:
Headquarters dashboard, Conflict Radar (live USGS earthquakes + labelled simulated scenarios), World Bank country
dossiers, a markets terminal on synthetic demo prices, and a Monte Carlo research lab.

## Documentation

- [CLAUDE.md](CLAUDE.md) — working rules for AI development sessions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) · [docs/SECURITY.md](docs/SECURITY.md)

Long-term project knowledge lives in `agentkarlano-stack/AuroraVeritatis-Knowledge` (`DEVELOPMENT_STATUS.md`).
