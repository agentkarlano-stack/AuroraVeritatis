# Integrations

Status legend: ✅ in use · 🟡 wired, not enabled · ⏳ planned · ❔ unverified

| Service | Status | Notes |
|---|---|---|
| Cloudflare Workers (`auroraveritatis`, aurorav.app) | ❔ | Config in `wrangler.jsonc`. Not verifiable from the dev sandbox; confirm Workers Builds succeeds on this branch. |
| World Bank API (`api.worldbank.org/v2`) | ✅ code, ❔ live | No key. CC BY 4.0 — attribution shown in dossiers. |
| USGS earthquake feed | ✅ code, ❔ live | Public domain. 10-minute edge cache. |
| Supabase (project "AuroraVeritatis") | 🟡 | Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` as Worker vars. Apply `supabase/migrations/*` after review. Add `https://aurorav.app/account` to Auth redirect URLs. |
| Resend (`aurorav.app` domain, `RESEND_API_KEY` secret) | ⏳ ❔ | Not used yet. Option: configure Supabase Auth SMTP to use Resend for branded magic-link emails. |
| PostHog | ⏳ | `POSTHOG_KEY`, `POSTHOG_HOST` exposed via `/api/config`; client integration pending consent banner. |
| n8n Cloud | ⏳ | Phase 4. |
| Stripe | ⏳ | Phase 5, separate from MARVETO. Requires owner approval. |
| OpenAI / Anthropic API | ⏳ | Phase 4 (EVE/KNOX), with per-request and monthly caps. |

## Environment variables (names only)
Worker vars (plain text, dashboard): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTHOG_KEY`, `POSTHOG_HOST`, `ENVIRONMENT` (`production`/`preview`, optional).
Worker secrets: `RESEND_API_KEY` (exists, unused). Future: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`.
