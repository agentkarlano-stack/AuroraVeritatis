# Rebuild ledger — 30 October 2026 master plan

Source: owner package `Aurora_Veritatis_2026-10-30_CLAUDE_LIGHT_CRM_UPDATED.zip`, archived verbatim (text, palettes,
CRM previews; no private videos) in the Knowledge repo `OWNER-MESSAGES/2026-10-30-master-28/`. Chapter numbers below
refer to `01_MASTER_SPLIT/*` there. Work packages P0–P6: `05_HANDOFF/EXECUTION_WORK_PACKAGES.md`.

Statuses: `working and verified`, `partial`, `missing`, `in progress`, `blocked`, `implemented awaiting verification`,
`verified complete`. Earlier "completed" claims are hypotheses until shown in the browser (ch. 1, step 3).

## Session state

- Ten-part intake: 10/10 read in full on 30 October 2026, plus READ_ME, REVIEW_NOTES, EXECUTION_WORK_PACKAGES,
  READING_INDEX, PROGRESS_TEMPLATE. Media inspected: none of the private videos (not in the LIGHT archive except OCT30-21,
  not yet viewed); storyboards not yet viewed.
- Production at intake: `main` 13a3137 (PR #79), post-deploy smoke, UI audit and Workers build green.
- Current package: P3 (briefing contradictions between PR #79 and this plan), then P1 shell/design system.

## Chapter coverage

| ID | Chapter | Status | Remaining work (short) |
|---|---|---|---|
| CH-01 | Authority, scope | working | Single workstream, branch/PR/CI; no data deletion; ledger kept here |
| CH-02 | Navigation | partial | One coherent shell for all routes; Learn destination; Plans/Subscribe top right; About/contact/legal exist |
| CH-03 | References | partial | Patterns only; reference URLs in `docs/REFERENCES.md` |
| CH-04 | Visual system | partial | New tokens/components across ALL routes (4-NEW, 4B, 4E mobile, 4F/4I palettes as references only); 4A copy audit; 5C rare panel interference |
| CH-05 | Global Radar | partial | 5-NEW rebuild: land/sea focus checks, scaled radius, direct toggles Events/Conflicts/Air/Naval/Bases/Infrastructure, ticker (3 h), All/Signals/News feed, collapsible right widgets, multi-target picker, 5A timeline |
| CH-06 | Severity/crises | partial | Separate intensity, persistent crisis, coverage; documented severity scale; icon vocabulary |
| CH-07 | Controls/layers | partial | Layers catalogue only in Map Explorer (Radar currently still has the Layers button) |
| CH-08 | Map detail | partial | Labels/glyphs progressive; colour close-up needs `ARCGIS_BASEMAP_KEY` (owner) else Blue Marble only; story images with rights |
| CH-09 | De jure/de facto | missing | Control modes, hatching, dispute panel; needs sourced datasets |
| CH-10 | Dossiers/leadership | partial | Leadership/cabinet, security-organisation directory, "Not verified" states |
| CH-11 | Connectivity/freshness | partial | Per-dataset cadence, Live/Delayed/Periodic/Historical/Stale/Demo states |
| CH-12 | Evidence/calendar | partial | Evidence panel, change tracking, 3-hour ticker, economic calendar, OSINT 12A catalogue entries |
| CH-13 | Briefings | partial | See P3 rows below; eleven_v4 Text-to-Dialogue evaluation (paid A/B, owner approval) |
| CH-14 | Choreography | partial | See P3 rows |
| CH-15 | Idle/Comfort/audio | partial | 15B soundtrack slot (`briefing_music_asset`, licence flag, no asset until rights); separate voice/ambience/master mute in settings |
| CH-16 | HQ/search | partial | Saved workspaces restoring map state; 2–4 country comparison exists (`/countries/vs`) |
| CH-17 | Brain | partial | Focused path view, tidy-layout with undo; 17A pipeline LAST |
| CH-18 | Market | partial | Multi-chart workspace, Screener (FMP display blocked), watchlist vs portfolio, linked panels |
| CH-19 | Quant tools | partial | Monte Carlo, VaR exist; Black–Scholes, binomial, finite difference, OLS, PCA, Cholesky, Kalman missing |
| CH-20 | Video quant tools | partial | Regression Lab, Foundations Sandbox, Backtest Lab hardening, 20A modules |
| CH-21 | Risk/private workspace | partial | Risk Lab exists; private bot workspace missing (server-enforced) |
| CH-22 | Learn | missing | Structured paths, lessons, progress |
| CH-23 | Help/tutorial | partial | `/help` exists; opt-in first-visit tour missing |
| CH-24 | Intro/status | partial | Intro exists; System Loading → System Active from real readiness missing; logo hand-off |
| CH-25 | Cost/ops | partial | Elite/APEX tiers and 25F allowances (proposal), durable metering, admin diagnostics |
| CH-26 | Acceptance | ongoing | Gate IDs AV-* tracked per package |
| CH-27 | Order | ongoing | Phases A–H |
| CH-28 | Tech refs | n/a | — |

## P3 briefing rows (this session)

| Requirement | Source | Expected | Status |
|---|---|---|---|
| AV-RETURN / no end card | 13-NEW, 14-NEW 4–5, 13F, H | After the last line: gentle pull-back and automatic return to Radar; no closing card, no Replay inside the scene; replay from launcher/archive | in progress |
| AV-NATURAL-CLOSE / no live preview | 13 entry controls, 13D.7 | No public "Preview" edition; show the latest published edition with its date or an honest unavailable state | in progress |
| Whole-turn upper captions | 13H, 14A latest, 14D | Each turn shown at once in a stable upper column; no word reveal | in progress |
| AV-AMBIENCE | 13-NEW, 14B, 15-NEW | Quiet operations-room bed (HVAC, hum, sparse equipment ticks, soft handover cue), not wind | in progress |
| LEAD filler artifacts | 13-NEW voices | Remove "um" artifacts (more stable lead settings, cache version bump) | in progress |
| Real loading state | 13H, 14D | "Initializing briefing" only while actually loading | in progress |
| Date label | 13H | Edition date shown briefly at start, then fades | in progress |
| Focus de-emphasis | 13H | Dim unrelated overlays during a story | missing |
| AV-3-VOICE production check | 26B AV-CAST-03 | Real edition audibly with LEAD, Anna, Charlie | blocked: editions need owner SQL + `SUPABASE_SERVICE_ROLE_KEY`; per-line voices verified live on 29 Oct |
| AV-PEAK-04 | 13D | Peak from PostHog | blocked: `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` (code ready, provisional slot labelled) |
| AV-SAT-03 | 8A | Licensed city colour imagery | blocked: `ARCGIS_BASEMAP_KEY` (optional); Blue Marble fallback labelled |
| System Active status | 24B, 14-NEW 6 | Real-readiness status beside the logo | missing |

## Last session handoff

- Completed and verified: intake; archive of the package in the Knowledge repo.
- Next: P3 rows above on branch `claude/briefing-rebuild`, then P1 design tokens and shell.
