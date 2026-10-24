import { ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { sourceOf, type CoverageStatus, type Story } from '../../shared/news';
import { ErrorState, Loading, ModuleLink, PageHeader, Panel } from '../components/ui';
import { useApi } from '../lib/api';

interface NewsResult {
  query: string;
  timespan: '24h' | '3d' | '7d';
  articles: number;
  stories: Story[];
  source: { name: string; url: string; license: string };
  fetchedAt: string;
  stale?: { since: string | null; reason: string };
  partial?: string;
}

const STATUS: Record<CoverageStatus | 'disputed', { label: string; cls: string; help: string }> = {
  confirmed: { label: 'Confirmed', cls: 'border-up/50 text-up', help: 'Published by an official source (government or intergovernmental body), with or without other outlets.' },
  corroborated: { label: 'Corroborated', cls: 'border-info/50 text-info', help: 'At least two independent publishers reported it with their own headlines.' },
  unverified: { label: 'Unverified', cls: 'border-warn/50 text-warn', help: 'One publisher only, or several outlets carrying the same syndicated text.' },
  disputed: { label: 'Disputed', cls: 'border-down/50 text-down', help: 'Sources contradict each other. Needs a reading of the articles, so it is never assigned automatically here.' },
};
const SPANS = [
  ['24h', 'Last 24 hours'],
  ['3d', '3 days'],
  ['7d', '7 days'],
] as const;

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * News coverage comparison: headlines from many publishers (GDELT), grouped into stories, with how well each story is
 * supported. Headlines and links only; Aurora does not reproduce article text.
 */
export default function News() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const t = (['24h', '3d', '7d'] as const).find((x) => x === params.get('t')) ?? '24h';
  const [input, setInput] = useState(q);
  const res = useApi<NewsResult>(`/api/news?${new URLSearchParams({ ...(q ? { q } : {}), t })}`);
  const set = (patch: Record<string, string>) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    return n;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="News verification" title="How well is each story supported?">
        Headlines from publishers worldwide, grouped by story. Aurora counts independent reporting, flags syndicated copies of the same text and marks
        official sources. Read the articles at their source; Aurora shows headlines and links only.
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5" title={STATUS[k].help}>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS[k].cls}`}>{STATUS[k].label}</span>
            <span className="hidden text-slate-dim md:inline">{STATUS[k].help}</span>
          </span>
        ))}
      </div>

      <Panel title="Search" eyebrow="GDELT">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: input.trim() });
          }}
        >
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-dim" aria-hidden />
            <input className="input pl-8" value={input} maxLength={100} onChange={(e) => setInput(e.target.value)} placeholder="Topic, country or place (empty: major world topics)" aria-label="Search news" />
          </label>
          <button className="btn-primary text-xs">Search</button>
          <div className="flex gap-1" role="group" aria-label="Time window">
            {SPANS.map(([id, label]) => (
              <button key={id} type="button" className="chip" aria-pressed={t === id} onClick={() => set({ t: id })}>
                {label}
              </button>
            ))}
          </div>
        </form>
      </Panel>

      <div className="mt-4 space-y-3">
        {res.status === 'loading' && <Loading label="Loading coverage" />}
        {res.status === 'error' && <ErrorState message={res.error} onRetry={res.reload} />}
        {res.status === 'ready' && (
          <>
            <p className="text-xs text-slate-dim">
              {res.data.articles} articles in {res.data.stories.length} stories · {res.data.source.name} · {res.data.source.license}
              {res.data.stale && <span className="ml-1 text-warn">· saved copy: {res.data.stale.reason}</span>}
              {res.data.partial && <span className="ml-1 text-warn">· {res.data.partial}</span>}
            </p>
            {res.data.stories.length === 0 && <p className="text-sm text-slate-dim">No articles found for this search and period.</p>}
            {res.data.stories.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <ModuleLink to="/briefing">World Briefing</ModuleLink>
        <ModuleLink to="/assistant">Ask EVE about a story</ModuleLink>
        <ModuleLink to="/radar">Global Radar</ModuleLink>
      </div>
    </div>
  );
}

function StoryCard({ story }: { story: Story }) {
  const st = STATUS[story.status];
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-platinum">{story.title}</h2>
        <span title={st.help} className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.cls}`}>
          {st.label}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-dim">
        {story.independent.length} independent {story.independent.length === 1 ? 'publisher' : 'publishers'}
        {story.syndicated.length > 0 && ` · ${story.syndicated.length} syndicated ${story.syndicated.length === 1 ? 'copy' : 'copies'} (not counted)`}
        {story.official.length > 0 && ` · official: ${story.official.join(', ')}`} · first seen {ago(story.first)}
      </p>
      <ul className="mt-2 divide-y divide-line/60 text-xs">
        {story.articles.slice(0, 8).map((a) => {
          const src = sourceOf(a.domain);
          return (
            <li key={a.url} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
              <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-baseline gap-1 text-mist hover:text-gold-soft">
                <span className="truncate">{a.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 self-center" aria-hidden />
              </a>
              <span className="shrink-0 text-slate-dim">
                {src ? `${src.name} · ${src.kind}` : `${a.domain} · unrated`}
                {story.syndicated.includes(a.domain) ? ' · syndicated' : ''} · {ago(a.seen)}
              </span>
            </li>
          );
        })}
        {story.articles.length > 8 && <li className="py-1.5 text-slate-dim">and {story.articles.length - 8} more publishers</li>}
      </ul>
    </article>
  );
}
