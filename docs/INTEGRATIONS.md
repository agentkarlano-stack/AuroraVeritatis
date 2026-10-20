# Integrations

| Service | Purpose | Status | Cost | Config (names only) |
|---|---|---|---|---|
| GitHub | Source control, PRs, Actions CI | Active | Free | — |
| Cloudflare Workers + Static Assets | Hosting, edge API | Workers Builds is connected to the repo (Worker `auroraveritatis`) | Free tier | `wrangler.jsonc` |
| Supabase | Auth, Postgres (RLS) | Code and schema ready; project not yet connected | Free tier | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| World Bank Open Data | Country indicators | Live, no key | Free (CC BY 4.0) | — |
| world-atlas / Natural Earth | Basemap geometry | Bundled at build time | Free (public domain) | — |
| Resend | Transactional email (via Supabase SMTP) | Planned | Free tier (3k/month) | `RESEND_API_KEY` (Supabase dashboard only) |
| n8n | Ingestion automation | Planned (design first, AV-022) | Self-host €0–10 | — |
| FRED | US macro series | Planned, blocked on key | Free | `FRED_API_KEY` (Worker secret) |
| AI provider (EVE/KNOX) | Briefings, Q&A | Planned, needs spend approval | Paid per use | `AI_API_KEY` (Worker secret) |
| Stripe | Subscriptions | Planned, needs legal and owner approval | % per transaction | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

## Adding an integration

1. Check that its terms allow our use (see DATA_POLICY.md).
2. Record the cost, and get owner approval for anything not free.
3. Keep server-side keys as Worker secrets; never put them in `vars`, the repo or the browser.
4. Add a row here and a backlog item, then implement behind `/api/*` with timeouts, caching and honest failure states.
