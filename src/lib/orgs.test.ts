import { describe, expect, it } from 'vitest';
import { budgetState, budgetText, budgetUsed, euros, parseEuros, seatsText } from './orgs';

const b = (budget_cents: number | null, spent_cents: number, hard_cap = true) => ({ budget_cents, spent_cents, hard_cap, alert_percent: 80 });

describe('organisation AI budget', () => {
  it('formats euros from cents', () => {
    expect(euros(12345)).toBe('€123.45');
    expect(euros(0)).toBe('€0.00');
  });
  it('follows the server allowance rules', () => {
    expect(budgetState(b(null, 0))).toBe('none');
    expect(budgetState(b(10000, 7999))).toBe('ok');
    expect(budgetState(b(10000, 8000))).toBe('alert');
    expect(budgetState(b(10000, 10000))).toBe('reached');
    expect(budgetState(b(10000, 12000, false))).toBe('alert');
    expect(budgetState(b(0, 0))).toBe('reached');
    expect(budgetUsed(b(10000, 2500))).toBe(0.25);
  });
  it('describes the state', () => {
    expect(budgetText(b(null, 0))).toBe('No AI allowance in this contract.');
    expect(budgetText(b(10000, 10000))).toMatch(/paused/);
    expect(budgetText(b(10000, 100))).toBe('€1.00 of €100.00 used this month.');
  });
  it('parses typed amounts', () => {
    expect(parseEuros('')).toBeNull();
    expect(parseEuros('1 200,50')).toBe(120050);
    expect(parseEuros('€15')).toBe(1500);
    expect(parseEuros('1.234')).toBeNaN();
    expect(parseEuros('-5')).toBeNaN();
  });
  it('counts seats', () => {
    expect(seatsText(1, 1)).toBe('1 of 1 seat used');
    expect(seatsText(3, 10)).toBe('3 of 10 seats used');
  });
});
