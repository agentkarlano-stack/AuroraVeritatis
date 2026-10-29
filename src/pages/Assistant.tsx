import { Bot, Pause, Play, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { AddToBrain } from '../components/AddToBrain';
import { ModuleLink, PageHeader, Panel, ProvenanceBadge, Unavailable } from '../components/ui';
import { ASSISTANTS, relatedLinks, segments, speakableSentences, type AiAnswer, type AssistantId } from '../lib/assistant';
import type { BrainNode } from '../lib/brain';
import { getActiveGraphId, getGraph } from '../lib/brainStore';
import { COUNTRIES } from '../lib/countries';
import { useApi } from '../lib/api';
import { playBlob, unlockAudio } from '../lib/narration';
import { usePrefs } from '../store/prefs';

interface Status {
  providers: Record<string, boolean>;
  order: string[];
  accounts: boolean;
}
interface Usage {
  enabled: boolean;
  tier: string;
  used_today: number;
  limit_today: number;
}

/**
 * EVE and KNOX: Aurora's own AI research assistants. Answers come from the Worker gateway (worker/ai), grounded in
 * numbered sources from Aurora's data and, if the user chooses, their own Brain notes. Every answer is labelled as
 * AI-generated, lists its sources and can be read aloud with the browser's built-in speech (no extra cost).
 */
export default function Assistant() {
  const { status: authStatus, session, client } = useAuth();
  const status = useApi<Status>('/api/ai/status');
  const lastCountry = usePrefs((s) => s.lastCountry);
  const [assistant, setAssistant] = useState<AssistantId>('eve');
  const [question, setQuestion] = useState('');
  const [country, setCountry] = useState<string>(lastCountry ?? '');
  const [events, setEvents] = useState(false);
  const [brain, setBrain] = useState<BrainNode[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [asked, setAsked] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  // The user's active Brain graph (local to this browser), so they can choose notes to share with the assistant.
  useEffect(() => {
    let alive = true;
    void getActiveGraphId()
      .then((id) => (id ? getGraph(id) : undefined))
      .then((g) => alive && setBrain((g?.nodes ?? []).filter((n) => n.label).slice(0, 60)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const refreshUsage = useMemo(
    () => () => {
      if (!client) return;
      void client.rpc('my_ai_usage').then(({ data, error }) => setUsage(error ? null : ((data as Usage | null) ?? null)));
    },
    [client],
  );
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) refreshUsage();
    });
    return () => {
      alive = false;
    };
  }, [refreshUsage]);

  const configured = status.status === 'ready' && status.data.order.length > 0;
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setErr(null);
    setAnswer(null);
    const notes = brain.filter((n) => picked.includes(n.id)).map((n) => ({ title: n.label, text: n.notes ?? n.label }));
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assistant, question: question.trim(), country: country || undefined, includeEvents: events, notes }),
      });
      const j = (await res.json().catch(() => ({ error: 'The assistant returned an unreadable response.' }))) as AiAnswer & { error?: string };
      if (!res.ok) setErr(j.error ?? `Request failed (${res.status}).`);
      else {
        setAnswer(j);
        setAsked(question.trim());
      }
    } catch {
      setErr('The assistant could not be reached. Check your connection and try again.');
    } finally {
      setBusy(false);
      refreshUsage();
    }
  };

  const meta = ASSISTANTS[assistant];
  const links = relatedLinks(asked || question);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="Aurora AI" title="EVE and KNOX research assistants">
        Ask about countries, events, markets or methods. Answers are generated from the sources listed with them: official statistics and live hazard data
        from Aurora, and any notes you choose to share. They are AI-generated and may contain errors.
      </PageHeader>

      <div className="mb-4 flex gap-1.5" role="tablist" aria-label="Assistant">
        {(Object.keys(ASSISTANTS) as AssistantId[]).map((id) => (
          <button key={id} role="tab" aria-selected={assistant === id} aria-pressed={assistant === id} className="chip" onClick={() => setAssistant(id)}>
            <Bot className="h-3.5 w-3.5" aria-hidden /> {ASSISTANTS[id].name}
            <span className="hidden text-[11px] text-slate-dim sm:inline">· {ASSISTANTS[id].role}</span>
          </button>
        ))}
      </div>

      {status.status === 'ready' && !configured ? (
        <Unavailable phase="activation pending">
          The AI assistants are built but not switched on yet: an AI provider and the usage controls (database update) are still to be configured.
        </Unavailable>
      ) : authStatus !== 'signed-in' ? (
        <Panel title="Sign in to use EVE and KNOX">
          <p className="text-sm text-mist">AI requests cost money, so each account has a daily allowance. Sign in to ask a question.</p>
          <Link to="/signin" className="btn-primary mt-3 inline-flex">
            Sign in
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Panel title={`Ask ${meta.name}`} eyebrow={meta.role}>
              <form className="space-y-3" onSubmit={(e) => void ask(e)}>
                <textarea
                  className="input min-h-24"
                  value={question}
                  maxLength={1000}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={meta.examples[0]}
                  aria-label="Your question"
                />
                <div className="flex flex-wrap gap-1.5">
                  {meta.examples.map((x) => (
                    <button key={x} type="button" className="chip text-[11px]" onClick={() => setQuestion(x)}>
                      {x}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-mist">
                    Country data (World Bank)
                    <select className="input mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>
                      <option value="">None</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.iso3} value={c.iso3}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end text-xs text-mist">
                    <input type="checkbox" className="accent-[#c9a35a]" checked={events} onChange={(e) => setEvents(e.target.checked)} />
                    Include current earthquakes and disaster alerts (USGS, GDACS)
                  </label>
                </div>
                {brain.length > 0 && (
                  <details className="rounded-md border border-line px-3 py-2 text-xs text-mist">
                    <summary className="cursor-pointer">Share notes from my Brain ({picked.length} selected, up to 8)</summary>
                    <p className="mt-1 text-[11px] text-slate-dim">Only the notes you tick are sent, for this question only. They are marked as unverified for the assistant.</p>
                    <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                      {brain.map((n) => (
                        <label key={n.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="accent-[#c9a35a]"
                            checked={picked.includes(n.id)}
                            disabled={!picked.includes(n.id) && picked.length >= 8}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, n.id] : p.filter((x) => x !== n.id)))}
                          />
                          <span className="truncate">{n.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn-primary" disabled={busy || question.trim().length < 3}>
                    <Send className="h-4 w-4" aria-hidden /> {busy ? `${meta.name} is working…` : `Ask ${meta.name}`}
                  </button>
                  {usage && (
                    <span className="text-xs text-slate-dim">
                      {usage.enabled ? `${usage.used_today} of ${usage.limit_today} requests used today (${usage.tier} plan)` : 'AI is switched off by the administrator.'}
                    </span>
                  )}
                </div>
                {err && (
                  <p role="alert" className="text-sm text-down">
                    {err}
                  </p>
                )}
              </form>
            </Panel>

            {answer && <AnswerView answer={answer} question={asked} />}
          </div>

          <aside className="space-y-4">
            <Panel title="How answers are made" eyebrow="Transparency">
              <ul className="space-y-1.5 text-xs text-mist">
                <li>The assistant sees only the sources listed with the answer.</li>
                <li>Citations to anything else are removed before you see the answer.</li>
                <li>Facts and the assistant&apos;s own interpretation are kept apart.</li>
                <li>No investment advice and no price predictions.</li>
                <li>Your Brain stays in this browser; only notes you tick are sent.</li>
              </ul>
            </Panel>
            {links.length > 0 && (
              <Panel title="Go directly to" eyebrow="Related in Aurora">
                <div className="flex flex-wrap gap-1.5">
                  {links.map((l) => (
                    <ModuleLink key={l.to} to={l.to}>
                      {l.label}
                    </ModuleLink>
                  ))}
                </div>
              </Panel>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function AnswerView({ answer, question }: { answer: AiAnswer; question: string }) {
  const sentences = speakableSentences(answer.answer);
  return (
    <Panel title={`${answer.assistant === 'knox' ? 'KNOX' : 'EVE'}: answer`} eyebrow="AI-generated">
      <div className="space-y-3">
        <p className="rounded-md border border-gold-dim/50 bg-gold/5 px-3 py-2 text-xs text-gold-soft" role="note">
          {answer.notice}
        </p>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-platinum">
          {segments(answer.answer).map((s, i) =>
            s.kind === 'text' ? (
              <span key={i}>{s.text}</span>
            ) : (
              <span key={i} className="whitespace-nowrap">
                [
                {s.ids.map((id, k) => (
                  <span key={id}>
                    {k > 0 && ', '}
                    <a href={`#src-${id}`} className="text-gold hover:underline">
                      {id}
                    </a>
                  </span>
                ))}
                ]
              </span>
            ),
          )}
        </div>
        <ReadAloud sentences={sentences} assistant={answer.assistant} />
        <div>
          <div className="eyebrow mb-1">Sources</div>
          {answer.sources.length === 0 ? (
            <p className="text-xs text-slate-dim">No sources were provided, so the assistant could only answer in general terms.</p>
          ) : (
            <ol className="space-y-1.5 text-xs">
              {answer.sources.map((s) => (
                <li key={s.id} id={`src-${s.id}`} className={`rounded-md border px-2 py-1.5 ${answer.cited.includes(s.id) ? 'border-gold-dim/60' : 'border-line opacity-80'}`}>
                  <span className="font-semibold text-platinum">[{s.id}]</span> {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}{' '}
                  <span className="text-slate-dim">
                    · {s.publisher}
                    {s.date ? ` · ${s.date}` : ''}
                  </span>{' '}
                  <ProvenanceBadge kind={s.provenance} />
                  {!answer.cited.includes(s.id) && <span className="ml-1 text-slate-dim">(not cited)</span>}
                </li>
              ))}
            </ol>
          )}
          {answer.removedCitations > 0 && (
            <p className="mt-1 text-[11px] text-warn">{answer.removedCitations} citation(s) to sources that were not provided were removed.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2 text-[11px] text-slate-dim">
          <span>
            {answer.provider} · {answer.model}
            {answer.fallback ? ' (fallback provider)' : ''} · {answer.usage.tokensIn + answer.usage.tokensOut} tokens
          </span>
          <AddToBrain
            entity={{
              kind: 'note',
              label: `AI answer: ${question.slice(0, 80)}`,
              notes: `AI-generated (${answer.provider}, ${answer.model}); verify against the sources.\n\nQ: ${question}\n\n${answer.answer}`.slice(0, 5000),
              sources: answer.sources.filter((s) => s.url && answer.cited.includes(s.id)).map((s) => ({ title: s.title, url: s.url!, date: s.date })),
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

/** Read-aloud with the browser's built-in speech synthesis: free, offline-capable, with the current sentence highlighted. */
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

/**
 * Read-aloud: the natural voice (ElevenLabs through the Worker; cached, metered by characters) when it is available
 * and the reader is signed in, otherwise the browser's own voice with the sentence being read highlighted.
 */
function ReadAloud({ sentences, assistant }: { sentences: string[]; assistant: AssistantId }) {
  const { session } = useAuth();
  const natural = useApi<{ natural: boolean }>('/api/voice/status');
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [mode, setMode] = useState<'natural' | 'browser'>('natural');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [current, setCurrent] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const stopped = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const naturalOk = natural.status === 'ready' && natural.data.natural && !!session;
  const useNatural = naturalOk && mode === 'natural';
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audio.current?.pause();
      if (audio.current?.src) URL.revokeObjectURL(audio.current.src);
    },
    [],
  );
  if ((!supported && !naturalOk) || !sentences.length) return null;

  const stop = () => {
    stopped.current = true;
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    setState('idle');
    setCurrent(-1);
  };
  const playBrowser = (from = 0) => {
    stopped.current = false;
    window.speechSynthesis.cancel();
    const speak = (i: number) => {
      if (stopped.current || i >= sentences.length) return (setState('idle'), setCurrent(-1));
      const u = new SpeechSynthesisUtterance(sentences[i]);
      u.lang = 'en-GB';
      u.rate = speed;
      u.onstart = () => setCurrent(i);
      u.onend = () => speak(i + 1);
      u.onerror = () => (setState('idle'), setCurrent(-1));
      window.speechSynthesis.speak(u);
    };
    setState('playing');
    speak(from);
  };
  const playNatural = async () => {
    setNote(null);
    // Unlock an audio element inside the click; playback after the request is then not blocked as autoplay.
    const el = audio.current ?? unlockAudio();
    if (audio.current?.dataset.ready === '1') {
      audio.current.playbackRate = speed;
      const ok = await audio.current.play().then(
        () => true,
        () => false,
      );
      if (ok) return setState('playing');
    }
    setState('loading');
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ text: sentences.join(' '), voice: assistant }),
    }).catch(() => null);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { error?: string; code?: string } | null;
      setNote(`${j?.error ?? 'The natural voice is unavailable.'}${j?.code ? ` [${j.code}]` : ''} Using your browser's voice.`);
      setMode('browser');
      return supported ? playBrowser() : setState('idle');
    }
    if (!el) {
      setNote("This browser cannot play audio. Using your browser's voice.");
      setMode('browser');
      return supported ? playBrowser() : setState('idle');
    }
    try {
      await playBlob(el, await res.blob(), speed, () => setState('idle'));
    } catch (err) {
      setNote(`This browser blocked the natural voice (${err instanceof Error ? err.name : 'error'}). Using your browser's voice.`);
      setMode('browser');
      return supported ? playBrowser() : setState('idle');
    }
    audio.current = el;
    setState('playing');
  };
  const pause = () => {
    if (useNatural) audio.current?.pause();
    else window.speechSynthesis.pause();
    setState('paused');
  };
  const resume = () => {
    if (useNatural) void audio.current?.play();
    else window.speechSynthesis.resume();
    setState('playing');
  };

  return (
    <div className="rounded-md border border-line px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === 'playing' ? (
          <button className="btn-ghost h-8 text-xs" onClick={pause}>
            <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
          </button>
        ) : (
          <button
            className="btn-ghost h-8 text-xs"
            disabled={state === 'loading'}
            onClick={() => (state === 'paused' ? resume() : useNatural ? void playNatural() : playBrowser())}
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> {state === 'loading' ? 'Preparing…' : state === 'paused' ? 'Resume' : 'Listen'}
          </button>
        )}
        {state !== 'idle' && state !== 'loading' && (
          <button className="btn-ghost h-8 text-xs" onClick={stop}>
            <Square className="h-3.5 w-3.5" aria-hidden /> Stop
          </button>
        )}
        <label className="flex items-center gap-1 text-[11px] text-slate-dim">
          Speed
          <select
            className="input h-8 w-auto py-0 text-xs"
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value) as (typeof SPEEDS)[number];
              setSpeed(v);
              if (audio.current) audio.current.playbackRate = v;
            }}
          >
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        {naturalOk && supported && (
          <label className="flex items-center gap-1 text-[11px] text-slate-dim">
            Voice
            <select
              className="input h-8 w-auto py-0 text-xs"
              value={mode}
              disabled={state !== 'idle'}
              onChange={(e) => setMode(e.target.value as 'natural' | 'browser')}
            >
              <option value="natural">Natural (ElevenLabs)</option>
              <option value="browser">Browser</option>
            </select>
          </label>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-dim">
        {useNatural ? 'Natural voice by ElevenLabs, generated from the text below.' : "Read aloud by your browser's voice; the text below follows along."}
      </p>
      {note && <p className="mt-1 text-[11px] text-warn">{note}</p>}
      {state !== 'idle' && (
        <p className="mt-2 text-sm leading-relaxed" aria-live="polite">
          {sentences.map((s, i) => (
            <span key={i} className={!useNatural && i === current ? 'rounded bg-gold/15 text-platinum' : useNatural ? 'text-mist' : 'text-slate-dim'}>
              {s}{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
