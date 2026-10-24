# Aurora AI: EVE and KNOX

Provider-independent AI research assistants (owner directive "AI activation", 2026-10-24).

## Request flow (`POST /api/ai/ask`, `worker/ai/handler.ts`)
1. **Rate limit per IP:** a burst of 6, then one request every 10 s.
2. **Bearer token required** (the signed-in user's Supabase access token).
3. **Sources are gathered from Aurora's own data** (`gatherSources`):
   - World Bank indicators for the chosen country;
   - USGS earthquakes and GDACS alerts, if ticked;
   - the user's chosen Brain notes, labelled *unverified* and sent only for this question.
4. **Prompt** (`grounding.ts`): persona plus rules (only the numbered sources, cite `[S#]`, never invent sources, facts kept apart from "Analysis (AI interpretation)", no investment advice).
5. **Reservation in the database:** `ai_begin(feature, est_cents)` is called with the user's own token. It checks:
   - AI switched on;
   - the session is active;
   - the daily allowance for the plan;
   - the organisation budget;
   - the global monthly budget.
6. **Provider router** (`providers.ts`): the order comes from `AI_PROVIDERS` (default `openai,workers-ai`). There is a 25 s timeout per provider and failover to the next. Error texts never contain keys.
7. **Citation check:** citations to sources that were not provided are removed and counted.
8. **Completion:** `ai_finish` records provider, model, tokens and estimated cost. The charge is never lower than the reservation. A failed request is recorded with zero cost and does not count against the allowance or the budget.
9. **Response:** answer, sources, the citations used, provider and model, whether a fallback provider answered, usage, and the "AI-generated" notice.

## Configuration (Cloudflare → auroraveritatis → Settings → Variables and Secrets)
| Name | Type | Purpose |
|---|---|---|
| `AI` | binding (in `wrangler.jsonc`) | Cloudflare Workers AI. The free daily allocation is available on the Workers Free plan; requests beyond it fail rather than incur charges |
| `OPENAI_API_KEY` | secret (optional) | OpenAI as the preferred provider. Set a monthly limit in OpenAI billing too |
| `OPENAI_MODEL` | variable (optional) | Default `gpt-4o-mini` |
| `WORKERS_AI_MODEL` | variable (optional) | Default `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `AI_PROVIDERS` | variable (optional) | Order, e.g. `workers-ai,openai` |

**Database update `supabase/migrations/20261025000000_ai_gateway.sql`** (owner applies after the three 2026-10-24 updates):
- AI is **off** until an administrator switches it on in `/admin` → AI usage and spending.
- Default global budget: €30 a month.
- Default daily requests: Free 5, Premium 30, Prime 100, Intelligence 300. Usage is never unlimited.
- `/admin` also shows spending by provider and the top users, and saves settings with an audit entry.

## Client
- **`/assistant`** (`pages/Assistant.tsx`):
  - EVE (research and briefings) and KNOX (quantitative and markets) tabs.
  - Country preselected from the last dossier opened.
  - Optional live events and Brain notes.
  - The answer shows linked citations, source cards with provenance badges ("not cited" marked), the provider and fallback, and Add to Brain.
- **Read-aloud** uses the browser's own speech synthesis (free), with the current sentence highlighted and Pause, Resume and Stop.
- **Natural-language navigation** works without AI: `relatedLinks` finds the countries and Aurora modules a question mentions.
- **Local development:** `vite.config.ts` sets `remoteBindings: false`, so Workers AI is absent locally and the gateway answers "not configured". Previews and production get the real binding.

## Not yet built
- ElevenLabs voice: the key is not supplied and the browser voice is the fallback.
- AI-written World Briefings and news comparison: they need the news ingestion layer.
- Streaming answers.
- Conversation history.
