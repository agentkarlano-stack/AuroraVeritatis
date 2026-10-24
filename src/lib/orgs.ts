/** Business & Institutional organisations: display helpers for seats and the monthly AI budget (server: organisations migration). */

export type AiBudgetState = 'none' | 'ok' | 'alert' | 'reached';

export interface AiBudget {
  budget_cents: number | null;
  spent_cents: number;
  hard_cap: boolean;
  alert_percent: number;
}

/** Euro amount from cents, e.g. 12345 → "€123.45". */
export function euros(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Share of the monthly budget used (0–1, may exceed 1 without a hard cap); null without a budget. */
export function budgetUsed(b: AiBudget): number | null {
  if (b.budget_cents === null) return null;
  if (b.budget_cents === 0) return b.spent_cents > 0 ? Infinity : 1;
  return b.spent_cents / b.budget_cents;
}

/** Mirrors aurora_private.ai_allowance: no budget → no AI; hard cap reached → blocked; past the alert share → warn. */
export function budgetState(b: AiBudget): AiBudgetState {
  const used = budgetUsed(b);
  if (used === null) return 'none';
  if (used >= 1) return b.hard_cap ? 'reached' : 'alert';
  return used >= b.alert_percent / 100 ? 'alert' : 'ok';
}

export function budgetText(b: AiBudget): string {
  const state = budgetState(b);
  if (state === 'none') return 'No AI allowance in this contract.';
  const base = `${euros(b.spent_cents)} of ${euros(b.budget_cents ?? 0)} used this month`;
  if (state === 'reached') return `${base}: the budget is reached and AI features are paused until the 1st of next month.`;
  if (state === 'alert') return b.hard_cap ? `${base}: over ${b.alert_percent}% of the budget.` : `${base}: over ${b.alert_percent}% of the budget (no hard cap).`;
  return `${base}.`;
}

/** Parses a euro amount typed by an administrator ("1 200,50", "1200.5", "") into cents; null for empty, NaN for invalid. */
export function parseEuros(text: string): number | null {
  const t = text.replace(/[€\s]/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

export function seatsText(used: number, seats: number): string {
  return `${used} of ${seats} ${seats === 1 ? 'seat' : 'seats'} used`;
}
