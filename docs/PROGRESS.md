# Progress log

Newest entry first. Each development session appends an entry: date (Europe/Budapest), branch, what was done, what was verified, what is next, and any blockers.

---

## 2026-10-21 — v0.1 foundation (branch `dev/v0.1-foundation`)

**Done**
- Scaffolded the Cloudflare Workers + Static Assets architecture: esbuild client build, TypeScript Worker API, `wrangler.jsonc` (no production route), security headers and CSP.
- Built the institutional design system (midnight/graphite/champagne/platinum), the AV monogram, and a responsive header with a mobile drawer.
- Pages: Home, Headquarters (reorderable/hideable widgets, watchlist, EVE/KNOX preference), Global Radar (d3-geo map, pan/zoom/pinch, chokepoint and sample-event layers, filters, Market Impact panel), Country index and profiles (live World Bank WDI via the Worker with 24 h cache), Markets (synthetic relative performance, candles, SMA/RSI, correlation, Market Impact Radar), Quant Lab (SMA crossover, RSI reversion, buy and hold; CSV import; stats), Account (Supabase Auth over fetch), Plans, Roadmap & data policy.
- Supabase migration with RLS for profiles, preferences, watchlists and plan limits; a plan-change guard; an auto-profile trigger.
- 21 unit tests (quant maths, no-look-ahead backtest, CSV, TopoJSON decoder, World Bank parsers, Worker routes), plus a CI workflow.
- Documentation: README, architecture, deployment, Supabase, data policy, backlog.

**Verified in this session**
- `npm test`: 21/21 pass. `npm run build` succeeds (about 330 KB JS minified).
- Strict type check against a minimal React shim: no errors apart from shim limitations. Full check with real `@types/react` is pending (AV-001).
- Playwright run over 12 routes at 1440 px and 390 px: no console errors and no horizontal overflow. Interactions checked: map country and event selection, zoom, HQ reorder and watchlist persisting across reload, Lab CSV backtest, World Bank failure notice, mobile navigation.

**Environment limits in this session**
- The npm registry, World Bank API and GitHub raw content were blocked. The build used preinstalled React 19, esbuild, TypeScript and d3. There is no `package-lock.json` yet (AV-001), the basemap was tested with a synthetic topology (AV-002), and the live World Bank path is unverified (AV-003).

**Next**
- AV-001 → AV-005 in order (see BACKLOG.md).

**Blockers needing the owner**
- Create Cloudflare and Supabase free accounts and set the Worker variables (see docs/DEPLOYMENT.md, docs/SUPABASE.md).
- Approve any production deploy to aurorav.app.
