# Aurora Veritatis — instructions for AI development sessions

Read `README.md`, `docs/BACKLOG.md` and the latest entry of `docs/PROGRESS.md` before changing anything.

## Non-negotiable rules
- **Never deploy to production** (`aurorav.app`, `wrangler deploy`, `npm run deploy:production`). Preview uploads are allowed only if the owner has configured credentials in the session. Never configure credentials yourself.
- **Never add a paid service, plan upgrade or paid API** without written approval from the owner in an issue or PR. The budget ceiling is €200/month and v0.1 runs on free tiers.
- **Never commit secrets** (`.dev.vars`, `.env`, `service_role` keys, API keys). Only public Supabase URL and anon key may reach the browser, via `/api/config`.
- **Never fabricate live data.** Follow `docs/DATA_POLICY.md`: label demos, date and source every figure, fail honestly.
- **Never merge your own PRs** or push to `main`. Work on a `dev/*` branch and open or update a PR.

## Workflow for each session
1. `git fetch origin`. If a `dev/*` PR is open, continue on that branch; otherwise branch `dev/<yyyy-mm-dd>-<task-id>` from `origin/main`.
2. Pick the first `todo` item in `docs/BACKLOG.md` whose dependencies are met. Skip `blocked` items.
3. Implement it, then run `npm run check`. Fix failures before committing.
4. Update `docs/BACKLOG.md` (status) and add an entry to the top of `docs/PROGRESS.md` (done, verified, next, blockers).
5. Commit with a clear message, push, and open or update the PR, summarising the change and the verification.
6. If usage or time runs low, commit work-in-progress as a draft commit (`wip:` prefix) with a PROGRESS entry describing the exact resume point, push, and stop.

## Conventions
- TypeScript strict; pure logic in `src/shared/` with tests in `tests/` (`node:test`).
- UI copy: plain, sentence case, active voice; use `DemoTag`, `PlannedTag`, `SourceTag` and `Notice` for honesty labels.
- Colours only from CSS tokens in `src/client/styles/global.css`. Chart series use `SERIES` (validated for colour-vision deficiency, max four per chart).
