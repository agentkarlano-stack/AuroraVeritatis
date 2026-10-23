/**
 * Internal quotation calculator for Business & Institutional proposals (administrators only; nothing is published).
 * All money is EUR per month unless stated. Provider prices are entered by the administrator; none are built in.
 *
 * Gross margin = (price − cost) / price. Markup = (price − cost) / cost. They are not interchangeable: a 50% markup is
 * only a 33% gross margin. The minimum price for a target gross margin m is cost / (1 − m); with a payment or
 * invoicing fee f taken from the price, it is cost / (1 − m − f).
 */

export interface QuoteInputs {
  /** A. Seats (users). */
  seats: number;
  /** B. Contract term in months (spreads the one-off onboarding cost). */
  months: number;
  /** C. Infrastructure and hosting cost per seat per month. */
  infraPerSeat: number;
  /** D. Expected AI requests per seat per month (the "expected" scenario). */
  aiRequestsPerSeat: number;
  /** E. Average input tokens per AI request. */
  tokensIn: number;
  /** F. Average output tokens per AI request. */
  tokensOut: number;
  /** G. AI provider price per million input tokens (EUR). */
  pricePerMIn: number;
  /** H. AI provider price per million output tokens (EUR). */
  pricePerMOut: number;
  /** I. Data licence costs allocated to this customer per month. */
  dataLicences: number;
  /** J. Support hours per month. */
  supportHours: number;
  /** K. Support cost per hour. */
  supportRate: number;
  /** L. One-off onboarding and set-up cost. */
  onboarding: number;
  /** M. Payment or invoicing fee, as a fraction of the price (e.g. 0.03). */
  feeRate: number;
  /** N. Risk and contingency buffer on costs, as a fraction (e.g. 0.1). */
  buffer: number;
  /** Target gross margin, as a fraction (e.g. 0.6). */
  targetMargin: number;
  /** AI usage multipliers for the three scenarios. */
  scenarios: { low: number; expected: number; heavy: number };
}

export const FACTOR_LABELS: Record<Exclude<keyof QuoteInputs, 'scenarios' | 'targetMargin'>, string> = {
  seats: 'A. Seats',
  months: 'B. Contract term (months)',
  infraPerSeat: 'C. Infrastructure per seat per month (€)',
  aiRequestsPerSeat: 'D. AI requests per seat per month (expected)',
  tokensIn: 'E. Input tokens per AI request',
  tokensOut: 'F. Output tokens per AI request',
  pricePerMIn: 'G. AI price per million input tokens (€)',
  pricePerMOut: 'H. AI price per million output tokens (€)',
  dataLicences: 'I. Data licences allocated per month (€)',
  supportHours: 'J. Support hours per month',
  supportRate: 'K. Support cost per hour (€)',
  onboarding: 'L. One-off onboarding cost (€)',
  feeRate: 'M. Payment or invoicing fee (% of price)',
  buffer: 'N. Risk buffer on costs (%)',
};

export const DEFAULT_INPUTS: QuoteInputs = {
  seats: 10,
  months: 12,
  infraPerSeat: 0,
  aiRequestsPerSeat: 0,
  tokensIn: 0,
  tokensOut: 0,
  pricePerMIn: 0,
  pricePerMOut: 0,
  dataLicences: 0,
  supportHours: 0,
  supportRate: 0,
  onboarding: 0,
  feeRate: 0,
  buffer: 0.1,
  targetMargin: 0.6,
  scenarios: { low: 0.5, expected: 1, heavy: 2 },
};

export type ScenarioId = 'low' | 'expected' | 'heavy';

export interface ScenarioResult {
  id: ScenarioId;
  aiRequests: number;
  costs: { ai: number; infra: number; data: number; support: number; onboarding: number; buffer: number; total: number };
  costPerSeat: number;
  /** Minimum monthly price that reaches the target gross margin after fees. */
  minPrice: number;
  minPricePerSeat: number;
}

export interface QuoteResult {
  scenarios: ScenarioResult[];
  /** Recommended monthly price per seat (rounded up to the euro) and its margins in each scenario. */
  recommendation: { pricePerSeat: number; monthly: number; basis: string; margins: Record<ScenarioId, { grossMargin: number; markup: number }> } | null;
  warnings: string[];
}

const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
export const grossMargin = (price: number, cost: number) => (price > 0 ? (price - cost) / price : 0);
export const markup = (price: number, cost: number) => (cost > 0 ? (price - cost) / cost : 0);
/** Minimum price for a gross margin target with a fee taken from the price; Infinity when margin + fee ≥ 100%. */
export const minPriceFor = (cost: number, margin: number, fee = 0) => (margin + fee < 1 ? cost / (1 - margin - fee) : Infinity);
/** Converts a markup to the equivalent gross margin, and back. */
export const markupToMargin = (m: number) => m / (1 + m);
export const marginToMarkup = (g: number) => (g < 1 ? g / (1 - g) : Infinity);

/** Floor for the heavy-usage scenario: below this, recommend an AI allowance cap rather than a higher price. */
export const HEAVY_MARGIN_FLOOR = 0.2;

export function calculateQuote(raw: QuoteInputs): QuoteResult {
  const seats = Math.max(1, Math.round(n(raw.seats)));
  const months = Math.max(1, Math.round(n(raw.months)));
  const fee = Math.min(n(raw.feeRate), 0.5);
  const margin = Math.min(n(raw.targetMargin), 0.95);
  const warnings: string[] = [];
  if (n(raw.aiRequestsPerSeat) > 0 && (n(raw.pricePerMIn) === 0 || n(raw.pricePerMOut) === 0)) warnings.push('AI usage is set but an AI token price is 0: enter the current provider prices (G, H).');
  if (n(raw.aiRequestsPerSeat) > 0 && n(raw.tokensIn) + n(raw.tokensOut) === 0) warnings.push('AI usage is set but tokens per request are 0 (E, F).');
  if (margin + fee >= 1) warnings.push('Target margin plus fee reaches 100%: no price can satisfy it.');

  const scenarios = (['low', 'expected', 'heavy'] as const).map((id): ScenarioResult => {
    const aiRequests = seats * n(raw.aiRequestsPerSeat) * n(raw.scenarios[id]);
    const ai = (aiRequests * (n(raw.tokensIn) * n(raw.pricePerMIn) + n(raw.tokensOut) * n(raw.pricePerMOut))) / 1e6;
    const infra = seats * n(raw.infraPerSeat);
    const data = n(raw.dataLicences);
    const support = n(raw.supportHours) * n(raw.supportRate);
    const onboarding = n(raw.onboarding) / months;
    const base = ai + infra + data + support + onboarding;
    const buffer = base * n(raw.buffer);
    const total = base + buffer;
    const minPrice = minPriceFor(total, margin, fee);
    return { id, aiRequests, costs: { ai, infra, data, support, onboarding, buffer, total }, costPerSeat: total / seats, minPrice, minPricePerSeat: minPrice / seats };
  });

  const [, expected, heavy] = scenarios as [ScenarioResult, ScenarioResult, ScenarioResult];
  let recommendation: QuoteResult['recommendation'] = null;
  if (Number.isFinite(expected.minPrice) && expected.costs.total > 0) {
    const pricePerSeat = Math.ceil(expected.minPricePerSeat);
    const monthly = pricePerSeat * seats;
    const net = monthly * (1 - fee);
    const margins = Object.fromEntries(scenarios.map((s) => [s.id, { grossMargin: grossMargin(net, s.costs.total), markup: markup(net, s.costs.total) }])) as Record<ScenarioId, { grossMargin: number; markup: number }>;
    let basis = `Priced so the expected scenario reaches the ${Math.round(margin * 100)}% target gross margin after fees.`;
    if (margins.heavy.grossMargin < HEAVY_MARGIN_FLOOR) {
      basis += ` Heavy use would cut the margin to ${Math.round(margins.heavy.grossMargin * 100)}%: include an AI allowance of about ${Math.round(expected.aiRequests / seats)} requests per seat per month with a hard cap or overage terms.`;
    }
    recommendation = { pricePerSeat, monthly, basis, margins };
    if (heavy.costs.total > net) warnings.push('In the heavy scenario costs exceed the recommended price: an AI cap is required.');
  }
  return { scenarios, recommendation, warnings };
}
