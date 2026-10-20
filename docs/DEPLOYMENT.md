# Deployment & environments

> **Rule:** nothing reaches `aurorav.app` without a reviewed and merged pull request and an explicit go-ahead from the project owner.

## Environments

| Environment | URL | How it is updated |
|---|---|---|
| Local | `http://localhost:8787` | `npm run dev` or `npm run dev:worker` |
| Preview | `*.workers.dev` preview URL per version | `npm run deploy:preview` (`wrangler versions upload`). Uploads a version **without** routing production traffic to it. |
| Production | `https://aurorav.app` | Only after review: `npm run deploy:production` or Cloudflare Workers Builds on `main`. |

## One-time setup (project owner)

1. **Cloudflare:** create the account (free plan), then run `npx wrangler login`.
2. **First upload:** run `npm run deploy:preview`. This creates the `aurora-veritatis` Worker on `workers.dev`.
3. **Variables** (Workers → aurora-veritatis → Settings → Variables):
   - `SUPABASE_URL`: public project URL
   - `SUPABASE_ANON_KEY`: public anon key
   - `wrangler.jsonc` sets `keep_vars: true`, so deploys do not wipe these.
4. **Custom domain (after review only):** add `aurorav.app` under Workers → Settings → Domains & Routes, or add to `wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "aurorav.app", "custom_domain": true }]
   ```
   The domain's DNS must be on Cloudflare.
5. **Optional CI deploys:** connect the GitHub repo in Workers Builds with build command `npm run build:ci` and deploy command `npx wrangler versions upload` for non-production branches. Keep production deploys manual until the project is stable.

## Secrets

- Never commit `.dev.vars`, `.env` or any `service_role` key.
- Future server-only secrets (AI API key, Stripe, Resend) go through `npx wrangler secret put NAME`, never into `vars`.

## Security headers

`public/_headers` applies HSTS, CSP (self and `*.supabase.co`), frame denial and a strict referrer policy to all static responses. If you add a third-party origin (tiles, analytics), update the CSP first.

## Pre-deploy checklist

- [ ] `npm run check` passes locally and CI is green
- [ ] PR reviewed and merged to `main`
- [ ] Preview version checked on `workers.dev`
- [ ] No new paid service, or approval recorded in the PR
- [ ] Owner approval for the production rollout
