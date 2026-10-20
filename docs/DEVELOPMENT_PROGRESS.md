# Development Progress

_Last updated: 2026-10-20, session `session_01DABSiCB2yNMA9QbADoheEi` (run 2)_

## Current status
| Field | Value |
|---|---|
| Phase | 1 complete on this branch → starting Phase 2/3 items |
| Branch / PR | `claude/phase1-foundation` → PR #2 |
| Competing work | PR #1 `dev/v0.1-foundation` (esbuild). The owner's latest directive prefers Vite + Cloudflare Vite plugin, which is PR #2. **Owner should close one.** |
| GitHub Actions CI | ✅ passing |
| Cloudflare Workers Builds | ❌ fails in **0 s** on every commit of every branch, incl. the README-only `main` → failing before clone; dashboard/account issue (see Blockers) |
| Scheduled task | "AV development (every 2h)" exists but is **paused** (`enabled: false`) |
| Next recommended action | Owner: fix Workers Builds connection (or add `CLOUDFLARE_API_TOKEN` for the Actions preview workflow); choose PR. Dev: Market Impact Radar page. |

## Completed
### Run 2 (2026-10-20)
- **Deploy config**: reproduced a real failure mode — `wrangler deploy` / `versions upload` without a dashboard build command
  aborted (`assets.directory` missing). Added `build.command` + `assets.directory`; dry-runs pass for all three setups;
  `wrangler dev` with wrangler-bundled Worker serves SPA + API.
- **Preview workflow** `.github/workflows/preview.yml`: `wrangler versions upload --preview-alias pr-N` + PR comment.
  Inert until `CLOUDFLARE_API_TOKEN` secret and `CLOUDFLARE_ACCOUNT_ID` variable exist.
- **Entitlements** (`src/lib/entitlements.ts`): plan limits/feature gates from the tier table; Free limits enforced for
  watchlist (10) and alert rules (2) with notices; Account "Plan & usage" panel with meters; billing placeholders.
- **Intro animation**: wordmark → AV monogram, ~2.6 s, skippable (button/Esc/click), skipped for reduced motion, once per
  visitor, replayable from Account. No audio.
- **Auth**: password reset request, `PASSWORD_RECOVERY` → set-new-password panel, redirect `error_description` surfaced.
- **Radar timeline**: daily stacked bars by category; click to filter by day.
### Run 1
Phase 1 foundation: Home, Headquarters, Conflict Radar, Country dossiers (World Bank), Markets (Lightweight Charts),
Research Lab (Monte Carlo), Plans, Sign-in/Account, Status, legal drafts, Worker API, RLS migration, CI, docs.

## Verification (run 2)
- `npm run check`: lint ✅ · typecheck ✅ · 29/29 tests ✅ · build ✅
- Playwright: intro shows/skips/doesn't repeat/absent under reduced motion; timeline filters 14 → 1; alert limit blocks 3rd
  rule; watchlist stops at 10; reset link present; Account usage panel; 0 console errors.

## Known defects / unverified
- Live World Bank / USGS responses unverified (sandbox egress blocked; mocked tests only).
- Workers Builds failing (external). No preview URL yet.
- Per-isolate rate limiting only. Plan limits are client-side until Supabase sync exists.

## Required environment variables (names only)
Worker vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTHOG_KEY`, `POSTHOG_HOST`, `ENVIRONMENT` (optional).
Worker secret: `RESEND_API_KEY` (unused). GitHub (optional preview workflow): secret `CLOUDFLARE_API_TOKEN`, variable `CLOUDFLARE_ACCOUNT_ID`.

## Blockers (owner)
1. Cloudflare dashboard → Workers & Pages → `auroraveritatis` → Settings → Builds: open a failed build log. 0-second
   failures usually mean the Git connection/build token is broken — disconnect and reconnect the repository. Settings
   that work for this repo: build command `npm run build` (or empty), deploy `npx wrangler deploy`, non-production
   `npx wrangler versions upload`, root `/`.
2. Choose PR #1 or PR #2; close the other.
3. Decide whether to re-enable the paused scheduled task.

## Next recommended actions (dev)
1. Market Impact Radar page (event type → transmission channel → assets, evidence classes; correlation matrix on demo data).
2. Supabase preference sync once auth is configured.
3. Real geopolitical source evaluation (GDELT/UCDP/ReliefWeb) with provenance mapping.
