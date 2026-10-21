import { describe, expect, it } from 'vitest';
import { HOME } from './copy';

describe('approved homepage copy', () => {
  it('matches the owner-approved wording exactly', () => {
    expect(HOME).toEqual({
      heroLine1: 'See the world.',
      heroLine2: 'Understand its impact.',
      supporting: 'Track global events, countries and markets in one place.',
      primaryCta: 'Open Headquarters',
      secondaryCta: 'Explore the Global Radar',
      earlyAccess: 'Early access. Free to explore. No account needed.',
    });
  });
});
