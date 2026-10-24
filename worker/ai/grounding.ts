/**
 * Source grounding for Aurora's assistants. The Worker collects sources from Aurora's own data (official statistics,
 * live hazard feeds) and from the user's own notes when they choose to share them. The model is told to answer only
 * from these numbered sources and to cite them as [S1], [S2]; citations to anything else are removed before the answer
 * is shown, and the answer is always labelled as AI-generated.
 */
import type { AiMessage } from './providers';

export type Assistant = 'eve' | 'knox';

export interface GroundSource {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  date?: string;
  /** confirmed (official statistic), estimate, unverified (user note, preliminary report). */
  provenance: 'confirmed' | 'estimate' | 'unverified';
  text: string;
}

export const PERSONA: Record<Assistant, string> = {
  eve: 'You are EVE, the research and briefing assistant of Aurora Veritatis, an independent geopolitical and economic research platform.',
  knox: 'You are KNOX, the quantitative and market research assistant of Aurora Veritatis, an independent research platform.',
};

const RULES = [
  'Answer in English, concisely, for a professional reader.',
  'Use only the numbered sources provided. Cite every factual statement with its source number in square brackets, for example [S2].',
  'Never invent sources, numbers, dates, quotations or URLs. If the sources do not answer the question, say so plainly and suggest what data would be needed.',
  'Keep facts and your own analysis apart: put interpretation, assumptions and scenarios under a final heading "Analysis (AI interpretation)".',
  'Treat sources marked "unverified" as claims, not facts. Mention the reference date of statistics.',
  'Do not give personal investment, legal or medical advice and do not predict prices. Probabilities, if any, must be described as rough judgements.',
];

export function buildMessages(assistant: Assistant, question: string, sources: GroundSource[]): AiMessage[] {
  const list = sources.length
    ? sources
        .map((s) => `[${s.id}] ${s.title} | ${s.publisher}${s.date ? ` | ${s.date}` : ''} | ${s.provenance}${s.url ? ` | ${s.url}` : ''}\n${s.text}`)
        .join('\n\n')
    : '(no sources were provided)';
  return [
    { role: 'system', content: `${PERSONA[assistant]}\n${RULES.map((r) => `- ${r}`).join('\n')}` },
    { role: 'user', content: `Sources:\n${list}\n\nQuestion: ${question}` },
  ];
}

/** Keeps citations to provided sources, removes any other [S…] marker, and lists the sources actually cited. */
export function checkCitations(text: string, sources: GroundSource[]): { text: string; cited: string[]; removed: number } {
  const ids = new Set(sources.map((s) => s.id));
  const cited = new Set<string>();
  let removed = 0;
  const out = text.replace(/\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, (_m, inner: string) => {
    const keep = inner.split(/\s*,\s*/).filter((id) => {
      if (ids.has(id)) {
        cited.add(id);
        return true;
      }
      removed++;
      return false;
    });
    return keep.length ? `[${keep.join(', ')}]` : '';
  });
  return { text: out.replace(/ +([.,;:])/g, '$1'), cited: [...cited].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), removed };
}

/** Numbers sources S1…Sn in the given order. */
export function numberSources(list: Omit<GroundSource, 'id'>[]): GroundSource[] {
  return list.map((s, i) => ({ ...s, id: `S${i + 1}` }));
}
