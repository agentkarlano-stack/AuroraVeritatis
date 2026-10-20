# Roadmap

Milestones follow the phases in the Project Overview (October 2026). Effort figures are the overview's planning estimates, not commitments. Detailed, ordered tasks live in [BACKLOG.md](BACKLOG.md).

| Phase | Objective | Est. effort | Status |
|---|---|---|---|
| 1 | Architecture, GitHub, deployment, database | 25–50 h | **In progress.** v0.1 in PR #1 |
| 2 | Branding and customisable Headquarters | 20–35 h | Started (layout, watchlist, agent preference) |
| 3 | Global Conflict Radar and OSINT integration | 60–110 h | Map prototype done; ingestion not started |
| 4 | Country intelligence and military data | 40–75 h | 33 profiles with live WDI indicators |
| 5 | Prime Terminal and market tools | 40–75 h | Synthetic-data prototype; no licensed data |
| 6 | EVE/KNOX, briefing and voice | 30–60 h | Not started (needs AI spend approval) |
| 7 | Scenario Desk, alerts, backtesting | 35–65 h | Basic backtesting in the Quant Lab |
| 8 | Subscriptions, security, testing, beta | 55–100 h | Not started |

## Definition of "initial functional version" (v0.2 target)

- CI green with real dependencies and a committed lockfile
- Preview deployment reachable on `workers.dev`, reviewed by the owner
- Real basemap and live World Bank indicators verified in the deployed preview
- Supabase project connected; sign-up, confirmation, sign-in, recovery and preference sync verified
- Playwright smoke tests in CI
- Light and dark themes, self-hosted brand font, accessibility pass
- Owner approves the production go-ahead for aurorav.app
