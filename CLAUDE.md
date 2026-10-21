# CLAUDE.md — Aurora Veritatis

Instructions for AI development sessions (Claude Code, scheduled routines). Read this first, then
`docs/DEVELOPMENT_PROGRESS.md`.

## Session protocol
1. `git fetch` and check open PRs on `agentkarlano-stack/AuroraVeritatis`; continue the open development PR's branch
   rather than starting a parallel one.
2. Read `docs/DEVELOPMENT_PROGRESS.md` ("Next recommended action") and avoid redoing completed work.
3. Implement one achievable task end-to-end. Run `npm run check` before every commit; never commit failing checks.
4. Update `docs/DEVELOPMENT_PROGRESS.md` here **and** `DEVELOPMENT_STATUS.md` in
   `agentkarlano-stack/AuroraVeritatis-Knowledge` (completed, current tasks, commits, build result, blockers, next steps).
5. Push and open/update the PR. Never push directly to `main`.

## Hard rules
- No secrets in git (use Cloudflare Worker secrets / `.dev.vars`). Never print secret values.
- Never touch MARVETO repositories, databases, or its Stripe account.
- No paid services, purchases, live Stripe products or production DB migrations without owner approval.
- Never fabricate data. Every datum carries a provenance: `confirmed | estimate | unverified | simulated`
  (`shared/types.ts`). Demo data must be visibly labelled "Simulated" and demo instruments end in `.D`.
- No investment advice or promised returns in UI copy.
- Every visible control must work or be explicitly marked unavailable (`<Unavailable>` component, disabled buttons).

## Product references
Owner benchmarks, platform map, what to learn from each and data-licence notes: `docs/REFERENCES.md`. Patterns only — never copy their branding, text or data.

## Codebase map
- `worker/` — Cloudflare Worker: `/api/*` routes (`index.ts`), upstream clients (`worldbank.ts`, `usgs.ts`),
  edge caching, per-IP rate limiting. Assets are served by the Workers assets binding (SPA fallback).
- `shared/` — types and indicator catalogue used by both worker and client.
- `src/pages/` — one lazy-loaded page per route; `src/components/` — UI (`ui.tsx` primitives, `WorldMap`, `PriceChart`, `SvgCharts`).
- `src/lib/` — pure logic with unit tests (Monte Carlo, technical indicators, tension index, synthetic market data).
- `src/store/prefs.ts` — Zustand store persisted to localStorage (layout, watchlist, alerts, notes, chart settings, drawings;
  to be synced to Supabase `user_preferences`).
- Strategy Lab (`pages/Strategy.tsx`) uses `simulateGbm` with a `jump` and `lib/scenario.ts`; quick search is
  `components/CommandPalette.tsx` + `lib/search.ts`.
- Cloud sync: `lib/sync.ts` (backend-agnostic, tested) + `auth/PrefsSync.tsx` (subscribes to the prefs store, newer side
  wins on sign-in, debounced upserts). Synced keys are `SYNCED_KEYS`; notes are excluded (row size limit).
- `supabase/migrations/` — SQL, reviewed and applied manually by the owner.

## Conventions
- TypeScript strict, `noUncheckedIndexedAccess`. React 19 + React Compiler lint rules (no setState in effects, no impure render).
- Styling: Tailwind v4 tokens in `src/index.css` (`ink-*` charcoal scale, `charcoal`, `gold`, `platinum`, `mist`, `line`). Reusable classes are
  `@utility` blocks (`panel`, `btn-primary`, `btn-ghost`, `chip`, `input`, `eyebrow`).
- Brand (owner-approved reference logo, Oct 2026): warm charcoal/near-black, gold `#C9A35A`, platinum `#F1F0EC`, no blue cast.
  AV monogram = two separate bold geometric letters drawn as SVG paths (`components/Logo.tsx`: `Monogram`, `Wordmark`,
  `BrandLockup`); Montserrat 700 wordmark, Montserrat 500 tagline. Master files in `public/brand/` (SVG + PNG).
  No neon, gradients-as-decoration, 3D or heavy animation.
- Cloudflare: Worker name `auroraveritatis`; `wrangler.jsonc` has `keep_vars: true` so dashboard vars survive deploys.
  Do not add routes/custom domains to config. `build.command` + `assets.directory` are set so `wrangler deploy` and
  `wrangler versions upload` work with or without a dashboard build command (verified with `--dry-run` from a clean clone).
- Plans/limits: `src/lib/entitlements.ts` (`limitOf`, `checkLimit`, `hasFeature`). `EARLY_ACCESS_ALL_FEATURES` stays true until
  billing launches; numeric Free limits are enforced in the UI. Server-side enforcement belongs in Supabase (RLS/triggers).

## Gotchas
- Never `pkill -f`/`pgrep -f` with a pattern that also appears in your own shell command (it kills the shell). Use `fuser -k <port>/tcp`.
- Lightweight Charts swallows a second click that follows quickly (double-click detection). Chart drawing tools use a
  native `click` listener + `coordinateToTime/Price` (`components/PriceChart.tsx`), not `subscribeClick`.
- Scheduled tasks need the repositories attached as sources (set in the Claude app). Without them a run can only clone
  read-only and cannot push; it should stop and report rather than retry.

## Sandbox notes
Cloud sessions may block outbound calls to data APIs (World Bank, USGS). Worker integrations are unit-tested with mocked
responses; verify against live endpoints on a Cloudflare preview deployment.
