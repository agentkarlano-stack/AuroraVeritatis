/**
 * Subscription periods for individual plans (owner directive 2026-10-24). Discounts are provisional proposals: they
 * must be checked against operating costs before launch, and no payment is taken while payments are switched off.
 */
export const PERIODS = [
  { months: 1, label: 'Monthly', discount: 0 },
  { months: 3, label: '3 months', discount: 0.05 },
  { months: 6, label: '6 months', discount: 0.1 },
  { months: 12, label: '12 months', discount: 0.15 },
] as const;
export type PeriodMonths = (typeof PERIODS)[number]['months'];

const cents = (v: number) => Math.round(v * 100) / 100;

export interface PeriodPrice {
  months: number;
  /** Paid once at the start of the period. */
  upfront: number;
  /** Upfront divided by the months, for comparison only. */
  perMonth: number;
  /** Compared with paying monthly for the same months. */
  savings: number;
  discount: number;
}

export function periodPrice(monthly: number, months: PeriodMonths): PeriodPrice {
  const p = PERIODS.find((x) => x.months === months)!;
  const full = cents(monthly * months);
  const upfront = cents(full * (1 - p.discount));
  return { months, upfront, perMonth: cents(upfront / months), savings: cents(full - upfront), discount: p.discount };
}

/**
 * Gross margin of a period price given an estimated monthly cost per user (infrastructure, data, AI allowance) and a
 * payment fee rate. Used to check that the provisional discounts still leave a margin.
 */
export function periodMargin(price: PeriodPrice, monthlyCost: number, feeRate = 0): number | null {
  if (price.upfront <= 0) return null;
  const net = price.upfront * (1 - feeRate);
  return (net - monthlyCost * price.months) / price.upfront;
}

/** Days until an ISO date (rounded up), negative when past. */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((Date.parse(iso) - now) / 86_400_000);
}

/** A plan or grant ending within this many days shows an expiry warning. */
export const EXPIRY_WARNING_DAYS = 14;
