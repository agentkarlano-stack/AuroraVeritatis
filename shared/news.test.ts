import { describe, expect, it } from 'vitest';
import { gdeltTime, groupStories, sourceOf, type NewsArticle } from './news';

const art = (domain: string, title: string, seen = '2026-10-24T10:00:00Z'): NewsArticle => ({ url: `https://${domain}/x`, title, domain, seen, language: 'English', sourceCountry: '' });

describe('news coverage', () => {
  it('identifies publishers, including subdomains and official domains', () => {
    expect(sourceOf('edition.cnn.com')?.name).toBe('CNN');
    expect(sourceOf('www.reuters.com')?.kind).toBe('wire');
    expect(sourceOf('state.gov')?.kind).toBe('official');
    expect(sourceOf('ec.europa.eu')?.kind).toBe('official');
    expect(sourceOf('random-blog.net')).toBeUndefined();
  });
  it('groups headlines about the same story and rates support', () => {
    const s = groupStories([
      art('reuters.com', 'Earthquake of magnitude 6.1 strikes off Japan coast'),
      art('bbc.co.uk', 'Strong earthquake strikes off coast of Japan, magnitude 6.1'),
      art('example-news.com', 'Central bank raises interest rates by half a point'),
    ]);
    const quake = s.find((x) => /Earthquake/i.test(x.title))!;
    expect(quake.articles).toHaveLength(2);
    expect(quake.status).toBe('corroborated');
    expect(s.find((x) => /Central bank/.test(x.title))!.status).toBe('unverified');
  });
  it('does not count syndicated copies as independent confirmation', () => {
    const [s] = groupStories([art('paper-a.com', 'Minister resigns after budget dispute'), art('paper-b.com', 'Minister resigns after budget dispute'), art('paper-c.com', 'Minister resigns after budget dispute')]);
    expect(s!.independent).toEqual(['paper-a.com']);
    expect(s!.syndicated).toEqual(['paper-b.com', 'paper-c.com']);
    expect(s!.status).toBe('unverified');
  });
  it('marks a story confirmed when an official source published it', () => {
    const [s] = groupStories([art('who.int', 'WHO declares end of outbreak in region'), art('apnews.com', 'WHO declares outbreak in region over')]);
    expect(s!.status).toBe('confirmed');
    expect(s!.official).toEqual(['who.int']);
  });
  it('converts GDELT times', () => {
    expect(gdeltTime('20261024T101500Z')).toBe('2026-10-24T10:15:00Z');
  });
});
