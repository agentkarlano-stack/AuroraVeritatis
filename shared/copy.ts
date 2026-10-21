/**
 * Central public copy. Strings marked APPROVED are the owner's exact wording: change them only on a new owner
 * instruction (a unit test pins them). Style: short, plain sentences; sentence case; no em dashes in prose.
 */

/** APPROVED homepage copy (owner, 2026-10-21). */
export const HOME = {
  heroLine1: 'See the world.',
  heroLine2: 'Understand its impact.',
  supporting: 'Track global events, countries and markets in one place.',
  primaryCta: 'Open Headquarters',
  secondaryCta: 'Explore the Global Radar',
  earlyAccess: 'Early access. Free to explore. No account needed.',
} as const;

export const BRAND = {
  name: 'Aurora Veritatis',
  subtitle: 'Global Analysis & Strategic Insight',
  contact: 'auroraveritatissup@gmail.com',
  disclaimer: 'Aurora Veritatis is a research and education tool. It does not give investment advice or promise financial outcomes.',
} as const;

/** What each provenance label means. Used by badges, tooltips and the homepage. */
export const PROVENANCE = {
  confirmed: { label: 'Sourced', description: 'Published by an identified official or primary source, such as the World Bank or USGS.' },
  estimate: { label: 'Estimate', description: 'A modelled or estimated value. See the source for its method.' },
  unverified: { label: 'Unverified', description: 'Reported, but not independently confirmed.' },
  simulated: { label: 'Simulated', description: 'Demonstration data made by Aurora. Never a real event or price.' },
} as const;

/** Missing value in tables and statistics. A typographic convention, not prose. */
export const NO_VALUE = '—';
