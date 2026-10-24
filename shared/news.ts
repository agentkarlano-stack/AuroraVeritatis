/**
 * News coverage comparison (AI directive §3). Articles come from the GDELT DOC 2.0 API (headlines, links, publication
 * time, publisher domain; GDELT data may be used freely with attribution). Aurora shows headlines and links only, never
 * article text. Articles about the same story are grouped; the status says how well the story is supported, and
 * syndicated copies of the same text are not counted as independent confirmation.
 */

export interface NewsArticle {
  url: string;
  title: string;
  domain: string;
  /** ISO 8601 (UTC) time GDELT first saw the article. */
  seen: string;
  language: string;
  sourceCountry: string;
}

export type SourceKind = 'official' | 'wire' | 'broadcaster' | 'newspaper' | 'magazine' | 'other';

export interface SourceInfo {
  name: string;
  kind: SourceKind;
  /** Short, factual note on the outlet (ownership or editorial model); not a truth score. */
  note: string;
}

/**
 * Source registry: identity and type of well-known publishers. Unknown domains are shown as unrated, never hidden.
 * Usage rights for every entry: headline, time and link only (no article text).
 */
export const SOURCES: Record<string, SourceInfo> = {
  'reuters.com': { name: 'Reuters', kind: 'wire', note: 'International news agency' },
  'apnews.com': { name: 'Associated Press', kind: 'wire', note: 'US news cooperative' },
  'afp.com': { name: 'AFP', kind: 'wire', note: 'French international news agency' },
  'bbc.co.uk': { name: 'BBC', kind: 'broadcaster', note: 'UK public broadcaster' },
  'bbc.com': { name: 'BBC', kind: 'broadcaster', note: 'UK public broadcaster' },
  'dw.com': { name: 'Deutsche Welle', kind: 'broadcaster', note: 'German international public broadcaster' },
  'france24.com': { name: 'France 24', kind: 'broadcaster', note: 'French international public broadcaster' },
  'aljazeera.com': { name: 'Al Jazeera', kind: 'broadcaster', note: 'Qatar-funded broadcaster' },
  'npr.org': { name: 'NPR', kind: 'broadcaster', note: 'US public radio' },
  'cnn.com': { name: 'CNN', kind: 'broadcaster', note: 'US commercial broadcaster' },
  'nytimes.com': { name: 'The New York Times', kind: 'newspaper', note: 'US newspaper' },
  'washingtonpost.com': { name: 'The Washington Post', kind: 'newspaper', note: 'US newspaper' },
  'wsj.com': { name: 'The Wall Street Journal', kind: 'newspaper', note: 'US newspaper' },
  'ft.com': { name: 'Financial Times', kind: 'newspaper', note: 'UK business newspaper' },
  'theguardian.com': { name: 'The Guardian', kind: 'newspaper', note: 'UK newspaper' },
  'economist.com': { name: 'The Economist', kind: 'magazine', note: 'UK weekly' },
  'bloomberg.com': { name: 'Bloomberg', kind: 'wire', note: 'US financial news service' },
  'politico.eu': { name: 'Politico Europe', kind: 'newspaper', note: 'European politics' },
  'euronews.com': { name: 'Euronews', kind: 'broadcaster', note: 'European broadcaster' },
  'lemonde.fr': { name: 'Le Monde', kind: 'newspaper', note: 'French newspaper' },
  'spiegel.de': { name: 'Der Spiegel', kind: 'magazine', note: 'German weekly' },
  'derstandard.at': { name: 'Der Standard', kind: 'newspaper', note: 'Austrian newspaper' },
  'orf.at': { name: 'ORF', kind: 'broadcaster', note: 'Austrian public broadcaster' },
  'telex.hu': { name: 'Telex', kind: 'newspaper', note: 'Hungarian online newspaper' },
  'hvg.hu': { name: 'HVG', kind: 'magazine', note: 'Hungarian weekly' },
  'index.hu': { name: 'Index', kind: 'newspaper', note: 'Hungarian online newspaper' },
  'nhk.or.jp': { name: 'NHK', kind: 'broadcaster', note: 'Japanese public broadcaster' },
  'scmp.com': { name: 'South China Morning Post', kind: 'newspaper', note: 'Hong Kong newspaper' },
  'tass.com': { name: 'TASS', kind: 'wire', note: 'Russian state news agency' },
  'xinhuanet.com': { name: 'Xinhua', kind: 'wire', note: 'Chinese state news agency' },
  'un.org': { name: 'United Nations', kind: 'official', note: 'Intergovernmental organisation' },
  'who.int': { name: 'World Health Organization', kind: 'official', note: 'UN agency' },
  'europa.eu': { name: 'European Union', kind: 'official', note: 'EU institutions' },
  'nato.int': { name: 'NATO', kind: 'official', note: 'Military alliance' },
  'imf.org': { name: 'IMF', kind: 'official', note: 'International Monetary Fund' },
  'worldbank.org': { name: 'World Bank', kind: 'official', note: 'International financial institution' },
  'ecb.europa.eu': { name: 'European Central Bank', kind: 'official', note: 'Central bank' },
  'whitehouse.gov': { name: 'The White House', kind: 'official', note: 'US government' },
  'gov.uk': { name: 'UK Government', kind: 'official', note: 'UK government' },
  'kormany.hu': { name: 'Hungarian Government', kind: 'official', note: 'Hungarian government' },
  'kremlin.ru': { name: 'Kremlin', kind: 'official', note: 'Russian presidency' },
};

/** Registry entry for a domain (subdomains match their parent, e.g. edition.cnn.com → cnn.com). */
export function sourceOf(domain: string): SourceInfo | undefined {
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (SOURCES[d]) return SOURCES[d];
  const parts = d.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (SOURCES[parent]) return SOURCES[parent];
  }
  if (/\.gov(\.[a-z]{2})?$|\.gouv\.fr$|\.gv\.at$|\.europa\.eu$|\.int$/.test(d)) return { name: d, kind: 'official', note: 'Government or intergovernmental domain' };
  return undefined;
}

export type CoverageStatus = 'confirmed' | 'corroborated' | 'unverified';

export interface Story {
  id: string;
  title: string;
  articles: NewsArticle[];
  /** Publisher domains with their own headline (independent reporting). */
  independent: string[];
  /** Domains whose headline is identical to another outlet's (likely syndicated copies). */
  syndicated: string[];
  official: string[];
  status: CoverageStatus;
  first: string;
  last: string;
}

const STOP = new Set('a an and are as at be by for from has have in is it its of on or said says that the this to was were will with after over into amid new us uk eu'.split(' '));

export function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const normTitle = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();

/**
 * Groups articles into stories by headline similarity (Jaccard of significant words ≥ `threshold`), then rates each:
 * - confirmed: an official source (government, intergovernmental body) is among the publishers;
 * - corroborated: at least two independent publishers with their own headlines;
 * - unverified: one publisher, or only copies of the same headline.
 * "Disputed" needs a reading of the content and is not assigned automatically.
 */
export function groupStories(articles: NewsArticle[], threshold = 0.4): Story[] {
  const items = [...articles].sort((a, b) => a.seen.localeCompare(b.seen));
  const groups: { toks: Set<string>; arts: NewsArticle[] }[] = [];
  for (const a of items) {
    const t = tokens(a.title);
    let best: (typeof groups)[number] | undefined;
    let bestScore = threshold;
    for (const g of groups) {
      const s = similarity(t, g.toks);
      if (s >= bestScore) {
        best = g;
        bestScore = s;
      }
    }
    if (best) {
      best.arts.push(a);
      for (const w of t) best.toks.add(w);
    } else groups.push({ toks: t, arts: [a] });
  }
  return groups
    .map((g, i) => {
      const byDomain = new Map<string, NewsArticle>();
      for (const a of g.arts) if (!byDomain.has(a.domain)) byDomain.set(a.domain, a);
      const titles = new Map<string, string[]>();
      for (const [d, a] of byDomain) titles.set(normTitle(a.title), [...(titles.get(normTitle(a.title)) ?? []), d]);
      const syndicated = [...titles.values()].filter((ds) => ds.length > 1).flatMap((ds) => ds.slice(1));
      const independent = [...byDomain.keys()].filter((d) => !syndicated.includes(d));
      const official = [...byDomain.keys()].filter((d) => sourceOf(d)?.kind === 'official');
      const status: CoverageStatus = official.length ? 'confirmed' : independent.length >= 2 ? 'corroborated' : 'unverified';
      const seen = g.arts.map((a) => a.seen).sort();
      return { id: `s${i}`, title: g.arts[0]!.title, articles: [...byDomain.values()], independent, syndicated, official, status, first: seen[0]!, last: seen.at(-1)! };
    })
    .sort((a, b) => b.independent.length - a.independent.length || b.last.localeCompare(a.last));
}

/** GDELT `seendate` (YYYYMMDDTHHMMSSZ) to ISO 8601. */
export function gdeltTime(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : s;
}
