# Backlog

Ordered by priority. Automated development runs take the **first `todo` item** whose dependencies are met, set it to `in-progress`, and update this file in the same commit as the work. Status values: `todo`, `in-progress`, `done`, `blocked (reason)`.

Goal of the current milestone: **initial functional version of aurorav.app (v0.2)**, a stable, reviewed preview that is ready for a production go-ahead.

## P1: complete and harden the first release

| ID | Task | Status | Notes |
|---|---|---|---|
| AV-001 | Commit `package-lock.json` (CI is already green with real `@types/react`) | todo | Needs npm registry access in the session, or the owner runs `npm install` locally and commits |
| AV-002 | Verify the real world-atlas basemap: rendering, antimeridian countries (Russia, Fiji), click-to-profile for all 33 registry ids | todo | v0.1 was browser-tested with a synthetic three-shape topology |
| AV-003 | Verify live World Bank indicator fetch end to end in `wrangler dev` (latest values, history charts, Cache API) | todo | The sandbox could not reach api.worldbank.org |
| AV-004 | Handle Supabase email-confirmation and password-recovery redirects (tokens in the URL hash on `/account`), plus a "set new password" form | todo | Required before enabling accounts publicly |
| AV-005 | Add Playwright smoke tests (all routes at desktop and mobile widths, no console errors, no horizontal overflow) to the repo and CI | todo | Port the scratch script described in DEVELOPMENT_PROGRESS.md |
| AV-006 | Add a React error boundary, focus management on route change, and a keyboard-accessible country list on the Radar | todo | Accessibility |
| AV-007 | Light theme toggle (the brief asks for dark and light themes), persisted per user | todo | Define tokens under `[data-theme="light"]` |
| AV-008 | Self-host the Lato font (OFL licence) in `public/fonts`, with no third-party font requests | todo | GDPR-friendly; matches the brand PDF |
| AV-009 | Expand the country registry to all G20 + EU members + key states (around 60), with tests for numeric-id coverage against world-atlas | todo | Structural facts only; verify memberships |
| AV-010 | Route-level code splitting (lazy-load Markets/Lab/Radar) to cut initial JS below 150 KB gzip | todo | |

## P2: first real data beyond World Bank (all free)

| ID | Task | Status | Notes |
|---|---|---|---|
| AV-020 | Strategic calendar from free official sources (central-bank meeting schedules published as static pages, entered as reviewed reference data with source links) | todo | Not live; mark as reviewed with a date |
| AV-021 | Macro indicators via FRED API (free key stored as a Worker **secret**, owner must create it) | blocked (needs FRED API key from owner) | |
| AV-022 | Design the OSINT ingestion pipeline: `events` table, verification states, n8n or Worker Cron, GDELT as the first unverified media-signal source | todo | Design doc first, owner approval before building |
| AV-023 | Market Impact Radar historical event studies (needs a real price source) | blocked (needs data licence decision) | |

## P3: later phases (see Roadmap in the app)

- MapLibre GL + OpenFreeMap migration when vessel and aircraft layers arrive
- TradingView Lightweight Charts for the Prime Terminal
- EVE/KNOX backend (owner approval for AI API spend required)
- Stripe subscriptions (owner approval and legal review required)
