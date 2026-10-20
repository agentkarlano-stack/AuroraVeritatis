import type { EventCategory } from '../../shared/types';

/**
 * Evidence classes, from strongest to weakest. The UI must never present a lower class as a higher one.
 * - mechanism: textbook economic transmission channel (explains *how* an effect could arise, not that it will)
 * - correlation: statistical co-movement measured on data (here: synthetic demo data)
 * - hypothesis: analyst judgement on plausible exposure, to be tested
 * - scenario: model-generated outcome under stated assumptions
 */
export type EvidenceClass = 'mechanism' | 'correlation' | 'hypothesis' | 'scenario';

export interface Exposure {
  symbol: string;
  /** Plausible direction of first-order pressure, if the channel is active. */
  direction: 'up' | 'down' | 'mixed';
  evidence: EvidenceClass;
  rationale: string;
}

export interface ImpactChannel {
  id: string;
  title: string;
  /** Event categories in the radar that can activate this channel. */
  triggers: EventCategory[];
  mechanism: string;
  exposures: Exposure[];
  caveats: string;
}

export const IMPACT_CHANNELS: ImpactChannel[] = [
  {
    id: 'energy',
    title: 'Energy supply disruption',
    triggers: ['energy', 'conflict'],
    mechanism:
      'A loss or threatened loss of oil or gas supply reduces expected near-term availability. With short-run demand relatively inelastic, prices tend to adjust upward until demand, inventories or alternative supply respond.',
    exposures: [
      { symbol: 'CRUDE.D', direction: 'up', evidence: 'mechanism', rationale: 'Direct supply channel; size depends on spare capacity and inventories.' },
      { symbol: 'NATGAS.D', direction: 'up', evidence: 'mechanism', rationale: 'Regional gas markets are less fungible, so local disruptions can matter more.' },
      { symbol: 'EUR-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Energy-importing economies face higher input costs.' },
      { symbol: 'GOLD.D', direction: 'mixed', evidence: 'hypothesis', rationale: 'Safe-haven demand vs. real-rate effects; historically inconsistent.' },
    ],
    caveats: 'Markets price expectations: if a disruption was anticipated, the reaction may already have happened.',
  },
  {
    id: 'shipping',
    title: 'Shipping & chokepoint disruption',
    triggers: ['energy', 'security'],
    mechanism:
      'Rerouting around a blocked or risky chokepoint lengthens voyages, absorbs vessel capacity and raises insurance premiums, which can raise freight rates and delivery times.',
    exposures: [
      { symbol: 'SHIP.D', direction: 'mixed', evidence: 'hypothesis', rationale: 'Carriers may benefit from higher rates while shippers face costs.' },
      { symbol: 'CRUDE.D', direction: 'up', evidence: 'mechanism', rationale: 'Tanker routes through chokepoints carry a large share of seaborne crude.' },
      { symbol: 'GLB-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Supply-chain delays can compress margins for import-dependent sectors.' },
    ],
    caveats: 'Effects depend on duration; short disruptions are often absorbed by inventories.',
  },
  {
    id: 'conflict',
    title: 'Armed conflict escalation',
    triggers: ['conflict', 'security'],
    mechanism:
      'Escalation raises uncertainty and risk premia, can disrupt production and trade in affected regions, and may shift fiscal priorities toward defence.',
    exposures: [
      { symbol: 'DEF.D', direction: 'up', evidence: 'hypothesis', rationale: 'Expected increases in procurement budgets.' },
      { symbol: 'WHEAT.D', direction: 'up', evidence: 'mechanism', rationale: 'Relevant if the region is a major grain exporter or export routes are affected.' },
      { symbol: 'GOLD.D', direction: 'up', evidence: 'hypothesis', rationale: 'Safe-haven flows during acute uncertainty.' },
      { symbol: 'EM-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Risk-off flows tend to hit higher-risk assets first.' },
    ],
    caveats: 'Geography matters: a conflict far from production or trade routes may have little market effect.',
  },
  {
    id: 'monetary',
    title: 'Monetary policy surprise',
    triggers: ['economic'],
    mechanism:
      'An unexpected change in the policy rate or guidance shifts the expected path of interest rates, affecting bond prices directly and currencies through rate differentials.',
    exposures: [
      { symbol: 'UST10Y.D', direction: 'down', evidence: 'mechanism', rationale: 'Higher expected rates lower bond prices (and vice versa for cuts).' },
      { symbol: 'USDJPY.D', direction: 'mixed', evidence: 'mechanism', rationale: 'Direction depends on which central bank surprised and in which direction.' },
      { symbol: 'GLB-EQ.D', direction: 'mixed', evidence: 'hypothesis', rationale: 'Discount-rate effect vs. growth signal.' },
    ],
    caveats: 'Only the surprise component matters; expected moves are typically priced in advance.',
  },
  {
    id: 'trade',
    title: 'Trade restrictions & sanctions',
    triggers: ['economic', 'political'],
    mechanism:
      'Tariffs, export controls and sanctions raise costs or block flows of specific goods, redirecting trade and creating scarcity premia for hard-to-substitute inputs.',
    exposures: [
      { symbol: 'EM-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Export-oriented economies are exposed to demand and access shocks.' },
      { symbol: 'GLB-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Supply-chain costs for manufacturers relying on restricted inputs.' },
    ],
    caveats: 'Enforcement, exemptions and substitution often dilute headline effects over time.',
  },
  {
    id: 'political',
    title: 'Political instability & country risk',
    triggers: ['political', 'humanitarian'],
    mechanism:
      'Instability raises uncertainty about policy, contracts and property rights, which investors may demand compensation for through higher risk premia on local assets.',
    exposures: [
      { symbol: 'EM-EQ.D', direction: 'down', evidence: 'hypothesis', rationale: 'Local equity and currency exposure; spillovers depend on contagion.' },
    ],
    caveats: 'Single-country events often have negligible effects on global indices.',
  },
];
