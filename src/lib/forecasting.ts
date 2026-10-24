/**
 * Prediction Research: the user's own probability forecasts and how good they turn out to be. Pure scoring and
 * calibration (proper scoring rules); no market data and no claims about the future.
 */

export type Outcome = 'yes' | 'no' | 'void';

export interface Forecast {
  id: string;
  question: string;
  /** How the question is decided (resolution criteria), written before the outcome is known. */
  criteria: string;
  category: string;
  /** YYYY-MM-DD by which the question resolves. */
  closes: string;
  /** Probability history (0–1), oldest first; the last entry is the current forecast. */
  history: { at: string; p: number; note?: string }[];
  outcome?: Outcome;
  resolvedAt?: string;
  /** Optional links into Aurora (country ISO3, event id). */
  country?: string;
  eventId?: string;
}

export const CATEGORIES = ['Geopolitics', 'Elections', 'Economy', 'Markets', 'Energy and commodities', 'Conflict', 'Technology', 'Other'] as const;

export const current = (f: Forecast) => f.history.at(-1)?.p ?? 0.5;
const clamp = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

/** Brier score of one forecast (0 best, 1 worst); null if unresolved or void. */
export function brier(f: Forecast): number | null {
  if (f.outcome !== 'yes' && f.outcome !== 'no') return null;
  const o = f.outcome === 'yes' ? 1 : 0;
  return (current(f) - o) ** 2;
}

/** Logarithmic score (natural log of the probability given to what happened; 0 best, more negative worse). */
export function logScore(f: Forecast): number | null {
  if (f.outcome !== 'yes' && f.outcome !== 'no') return null;
  const p = clamp(current(f));
  return Math.log(f.outcome === 'yes' ? p : 1 - p);
}

export interface Summary {
  resolved: number;
  open: number;
  meanBrier: number | null;
  /** The Brier score of always answering 50% is 0.25: a reference for "better than a coin flip". */
  baselineBrier: 0.25;
  meanLog: number | null;
  /** Share of resolved forecasts on the right side of 50% (forecasts at exactly 50% count half). */
  hitRate: number | null;
}

export function summarize(fs: Forecast[]): Summary {
  const scored = fs.filter((f) => brier(f) !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  return {
    resolved: scored.length,
    open: fs.filter((f) => !f.outcome).length,
    meanBrier: mean(scored.map((f) => brier(f)!)),
    baselineBrier: 0.25,
    meanLog: mean(scored.map((f) => logScore(f)!)),
    hitRate: mean(scored.map((f) => (current(f) === 0.5 ? 0.5 : (current(f) > 0.5) === (f.outcome === 'yes') ? 1 : 0))),
  };
}

export interface CalibrationBin {
  /** Bin range of forecast probabilities, e.g. 0.6–0.7. */
  from: number;
  to: number;
  count: number;
  /** Mean forecast probability in the bin. */
  meanForecast: number | null;
  /** Share of those questions that resolved yes. */
  observed: number | null;
}

/** Reliability diagram data: forecasts grouped in `bins` equal bins; a calibrated forecaster lies on the diagonal. */
export function calibration(fs: Forecast[], bins = 10): CalibrationBin[] {
  const scored = fs.filter((f) => brier(f) !== null);
  return Array.from({ length: bins }, (_, i) => {
    const from = i / bins;
    const to = (i + 1) / bins;
    const inBin = scored.filter((f) => {
      const p = current(f);
      return p >= from && (p < to || (i === bins - 1 && p <= 1));
    });
    const n = inBin.length;
    return {
      from,
      to,
      count: n,
      meanForecast: n ? inBin.reduce((s, f) => s + current(f), 0) / n : null,
      observed: n ? inBin.filter((f) => f.outcome === 'yes').length / n : null,
    };
  });
}

/** Mean Brier score per category, for categories with resolved forecasts. */
export function byCategory(fs: Forecast[]): { category: string; count: number; meanBrier: number }[] {
  const groups = new Map<string, number[]>();
  for (const f of fs) {
    const b = brier(f);
    if (b === null) continue;
    groups.set(f.category, [...(groups.get(f.category) ?? []), b]);
  }
  return [...groups].map(([category, xs]) => ({ category, count: xs.length, meanBrier: xs.reduce((s, v) => s + v, 0) / xs.length })).sort((a, b) => a.meanBrier - b.meanBrier);
}

/** Validates a probability typed as a percentage (1–99): certainty is not allowed, because it makes log scores infinite. */
export function parsePercent(raw: string): number | null {
  const v = Number(raw.replace('%', '').trim());
  return Number.isFinite(v) && v >= 1 && v <= 99 ? Math.round(v * 10) / 1000 : null;
}

export function toCsv(fs: Forecast[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = fs.map((f) => [q(f.question), q(f.category), f.closes, current(f).toFixed(3), f.history.length, f.outcome ?? '', brier(f)?.toFixed(4) ?? ''].join(','));
  return `question,category,closes,current_probability,revisions,outcome,brier\n${rows.join('\n')}\n`;
}
