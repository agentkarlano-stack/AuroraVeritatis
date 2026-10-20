# Data policy

These rules apply to every feature and every contributor, human or AI.

1. **No fabricated live data.** If a real source is not connected, the feature shows labelled sample or synthetic content, or nothing.
2. **Label every demonstration.** Use the `DemoTag` (dashed gold) or a `Notice` wherever synthetic series or sample records appear. API payloads carry `demo: true`.
3. **Date and source every figure.** Indicators display the source name, licence and observation year. Retrieval time is shown where relevant.
4. **Separate reference from intelligence.** Static registries (country codes, chokepoint locations) are marked as reference data and carry a review date (`REGISTRY_REVIEWED`).
5. **Analysis is not prediction.** The Market Impact Radar describes transmission mechanisms. Never show speculative moves as expected outcomes.
6. **Lawful sources only.** Aircraft, vessel and military data come only from sources whose terms allow our use. Coverage gaps are stated, never hidden.
7. **Fail honestly.** When an upstream source is down, say so in the UI. Never fall back to stale or invented numbers silently. Failed responses are cached for at most 60 seconds.
8. **Not investment advice.** No trade execution, no recommendations.

## Current sources

| Data | Source | Licence | Status |
|---|---|---|---|
| Country indicators | World Bank WDI API | CC BY 4.0 | Live (cached 24 h) |
| Basemap | Natural Earth via `world-atlas` | Public domain | Bundled |
| Chokepoint references | U.S. EIA "World Oil Transit Chokepoints" (linked) | Public | Reference |
| Events | None (fictional samples) | n/a | Demo |
| Market prices | None (synthetic) | n/a | Demo |
