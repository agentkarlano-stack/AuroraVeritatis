import { describe, expect, it } from 'vitest';
import { relatedLinks, segments, speakableSentences } from './assistant';

describe('assistant helpers', () => {
  it('splits citations for rendering', () => {
    expect(segments('GDP grew [S1]. Risk [S2, S3].')).toEqual([
      { kind: 'text', text: 'GDP grew ' },
      { kind: 'cite', ids: ['S1'] },
      { kind: 'text', text: '. Risk ' },
      { kind: 'cite', ids: ['S2', 'S3'] },
      { kind: 'text', text: '.' },
    ]);
  });
  it('prepares readable sentences for read-aloud', () => {
    expect(speakableSentences('**GDP** grew 2.1% [S1]. Inflation fell. Outlook')).toEqual(['GDP grew 2.1%.', 'Inflation fell.', 'Outlook']);
  });
  it('finds countries and modules mentioned in a question', () => {
    const l = relatedLinks('How does inflation in Hungary compare with Austria, and what is the value at risk of oil?');
    const to = l.map((x) => x.to);
    expect(to).toContain('/countries/HUN');
    expect(to).toContain('/countries/AUT');
    expect(to).toContain('/currency');
    expect(to).toContain('/lab?tool=risk');
    expect(to).toContain('/markets/commodities');
    expect(relatedLinks('hello')).toEqual([]);
  });
});
