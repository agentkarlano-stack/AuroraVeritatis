import { quantileSorted } from './stats';

export interface BranchStats {
  /** Number of simulated paths in this branch. */
  n: number;
  /** Share of all paths. */
  share: number;
  median: number;
  probLoss: number;
  p05: number;
  p95: number;
}

/** Split terminal values by whether the scenario event occurred, for a two-branch scenario tree. */
export function scenarioTree(terminal: Float64Array, jumped: Uint8Array, s0: number): { occurred: BranchStats | null; notOccurred: BranchStats | null } {
  const yes: number[] = [];
  const no: number[] = [];
  terminal.forEach((v, i) => (jumped[i] ? yes : no).push(v));
  const branch = (xs: number[]): BranchStats | null => {
    if (!xs.length) return null;
    const s = Float64Array.from(xs).sort();
    return {
      n: s.length,
      share: s.length / terminal.length,
      median: quantileSorted(s, 0.5),
      probLoss: xs.filter((v) => v < s0).length / s.length,
      p05: quantileSorted(s, 0.05),
      p95: quantileSorted(s, 0.95),
    };
  };
  return { occurred: branch(yes), notOccurred: branch(no) };
}

export interface ScenarioTemplate {
  id: string;
  title: string;
  symbol: string;
  probability: number;
  mean: number;
  sd: number;
  day: number;
  rationale: string;
}

/**
 * Illustrative starting assumptions, linked to the Market Impact Radar channels. They are editable
 * hypotheses for exploration, not calibrated estimates or forecasts.
 */
export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  { id: 'energy', title: 'Energy supply disruption', symbol: 'CRUDE.D', probability: 0.3, mean: 0.2, sd: 0.1, day: 20, rationale: 'Supply loss with inelastic short-run demand pushes prices up.' },
  { id: 'conflict', title: 'Conflict escalation in Europe', symbol: 'EUR-EQ.D', probability: 0.25, mean: -0.08, sd: 0.05, day: 15, rationale: 'Risk premia rise; energy-importing economies face higher costs.' },
  { id: 'monetary', title: 'Hawkish policy surprise', symbol: 'UST10Y.D', probability: 0.5, mean: -0.03, sd: 0.015, day: 30, rationale: 'Higher expected rates lower bond prices.' },
  { id: 'trade', title: 'New export restrictions', symbol: 'EM-EQ.D', probability: 0.35, mean: -0.1, sd: 0.06, day: 40, rationale: 'Export-oriented economies face demand and access shocks.' },
  { id: 'haven', title: 'Safe-haven demand spike', symbol: 'GOLD.D', probability: 0.3, mean: 0.06, sd: 0.04, day: 10, rationale: 'Acute uncertainty can raise demand for perceived safe havens.' },
];
