import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIERS } from '../src/data/tiers.ts';

describe('plan limits', () => {
  it('match the limits the database enforces (supabase migration limit_for)', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261023000000_profiles_admin_entitlements.sql', import.meta.url), 'utf8');
    for (const key of ['researchNotes', 'assetsPerWatchlist', 'alertRules'] as const) {
      const line = sql.split('\n').find((l) => l.includes(`when '${key}' then`))!;
      for (const t of TIERS) {
        const m = t.id === 'free' ? line.match(/else (\d+) end/) : line.match(new RegExp(`when '${t.id}' then (\\d+)`));
        expect(Number(m?.[1]), `${key}/${t.id}`).toBe(t.limits[key]);
      }
    }
  });
});
