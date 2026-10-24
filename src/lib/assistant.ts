/**
 * Client helpers for Aurora's AI assistants (EVE, KNOX): answer rendering, natural-language navigation without AI, and
 * sentence splitting for read-aloud. The answers themselves come from the Worker gateway (worker/ai).
 */
import { COUNTRIES, type CountryRef } from './countries';
import { PAGES, type SearchItem } from './search';

export type AssistantId = 'eve' | 'knox';

export interface AiSource {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  date?: string;
  provenance: 'confirmed' | 'estimate' | 'unverified';
  text: string;
}

export interface AiAnswer {
  answer: string;
  assistant: AssistantId;
  sources: AiSource[];
  cited: string[];
  removedCitations: number;
  provider: string;
  model: string;
  fallback: boolean;
  usage: { tokensIn: number; tokensOut: number; usedToday?: number; limitToday?: number };
  notice: string;
}

export const ASSISTANTS: Record<AssistantId, { name: string; role: string; examples: string[] }> = {
  eve: {
    name: 'EVE',
    role: 'Research and briefings: countries, geopolitics, current events',
    examples: ['Summarise the main economic indicators for this country.', 'What do the current disaster alerts mean for the affected countries?'],
  },
  knox: {
    name: 'KNOX',
    role: 'Quantitative and market research: risk, statistics, methods',
    examples: ['Explain how expected shortfall differs from value at risk.', 'Which indicators describe this economy’s external vulnerability?'],
  },
};

/** Splits an answer into text and citation parts ([S1], [S2, S3]) for rendering links to the sources. */
export function segments(text: string): ({ kind: 'text'; text: string } | { kind: 'cite'; ids: string[] })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'cite'; ids: string[] })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'cite', ids: m[1]!.split(/\s*,\s*/) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Text to read aloud: citation markers and Markdown symbols removed, split into sentences for highlighting. */
export function speakableSentences(text: string): string[] {
  const clean = text
    .replace(/\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, '')
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return clean ? clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Aurora pages and country dossiers that a question mentions, found by plain matching (no AI): country names and the
 * words of page titles. Used to offer direct navigation next to an answer.
 */
export function relatedLinks(question: string, limit = 6): SearchItem[] {
  const q = ` ${question.toLowerCase().replace(/[^\p{L}\p{N}\s&]/gu, ' ')} `;
  const countries = COUNTRIES.filter((c: CountryRef) => c.name.length > 3 && q.includes(` ${c.name.toLowerCase()} `)).map((c) => ({
    id: `c:${c.iso3}`,
    group: 'Countries' as const,
    label: `${c.name} dossier`,
    hint: c.iso3,
    to: `/countries/${c.iso3}`,
  }));
  const KEYWORDS: [string[], string][] = [
    [['earthquake', 'disaster', 'flood', 'cyclone', 'event', 'radar'], '/radar'],
    [['briefing', 'today', 'latest'], '/briefing'],
    [['inflation', 'exchange rate', 'currency', 'purchasing power'], '/currency'],
    [['interest rate', 'ecb', 'yield', 'euro'], '/macro'],
    [['commodity', 'commodities', 'oil', 'gas', 'copper', 'wheat', 'gold'], '/markets/commodities'],
    [['value at risk', 'var', 'expected shortfall', 'portfolio', 'risk'], '/lab?tool=risk'],
    [['backtest', 'strategy'], '/lab?tool=backtest'],
    [['forecast', 'probability', 'calibration'], '/lab/forecasts'],
    [['chart', 'indicator', 'rsi', 'macd'], '/markets'],
    [['map', 'satellite', 'layer'], '/geo'],
  ];
  const pages = KEYWORDS.filter(([words]) => words.some((w) => q.includes(` ${w} `) || q.includes(` ${w}s `)))
    .map(([, to]) => PAGES.find((p) => p.to === to) ?? { id: `p:${to}`, group: 'Pages' as const, label: to === '/markets/commodities' ? 'Commodity & Energy Monitor' : to === '/lab?tool=risk' ? 'Portfolio risk' : to === '/lab/forecasts' ? 'Prediction Research' : to, hint: '', to });
  const seen = new Set<string>();
  return [...countries, ...pages].filter((x) => (seen.has(x.to) ? false : (seen.add(x.to), true))).slice(0, limit);
}
