import { ExternalLink, FileText, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoEvent } from '../../../shared/types';
import { ANALYSTS, WINDOWS, type Line, type Plan, type Scene } from '../../lib/briefingPlan';
import type { MapState } from '../../lib/geo/state';
import type { Narrator } from '../../lib/narration';
import { Clock, locate, startOf, total } from '../../lib/presentation';
import type { GeoMapHandle } from '../geo/GeoMap';

const GeoMap = lazy(() => import('../geo/GeoMap'));

export type PresentationMode = 'read' | 'play' | 'tour';
export type ExitReason = 'done' | 'user';

interface Props {
  plan: Plan;
  mode: PresentationMode;
  /** Real events drawn on the globe (the plan's own events are highlighted in turn). */
  events: GeoEvent[];
  /** Narrator for `play`; null: no audio (the written captions still run, with `audioNote` explaining why). */
  narrator?: Narrator | null;
  audioNote?: string | null;
  /** Ask the browser for full screen (only when the user started the presentation). */
  fullscreen: boolean;
  /** Period label shown in the corner, e.g. the voiced edition and the time it covers. */
  subtitle?: string;
  onExit: (reason: ExitReason) => void;
}

const webgl2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};
const fmtDate = (iso: string) => new Date(iso).toUTCString().replace(/:\d\d GMT$/, ' UTC');

/** The scenes actually presented: narrated briefings open with a short spoken introduction over the whole globe. */
function scenesFor(plan: Plan, mode: PresentationMode): Scene[] {
  if (mode !== 'play') return plan.scenes;
  const intro: Scene = {
    id: 'intro',
    kind: 'event',
    title: 'Aurora briefing',
    explanation: `${WINDOWS[plan.window].label}: ${plan.scenes.length} ${plan.scenes.length === 1 ? 'story' : 'stories'} from public sources.`,
    date: plan.scenes[0]?.date ?? new Date(0).toISOString(),
    sources: [],
    related: 0,
    lead: plan.intro.speaker,
    lines: [plan.intro],
    readMs: 3_000,
    speakMs: 3_000,
  };
  return [intro, ...plan.scenes];
}

/**
 * Full-screen presentation on the grayscale globe, shared by the written briefing (`read`), the narrated briefing
 * (`play`) and the passive Auto Tour (`tour`). The plan is frozen by the caller; nothing here regenerates or reorders
 * it. One clock drives everything: pausing freezes the timeline, the narration and the atmosphere, and moving to a
 * scene restores its camera, card, captions and audio from the start of that scene.
 */
export function Presentation({ plan, mode, events, narrator = null, audioNote = null, fullscreen, subtitle, onExit }: Props) {
  const [transcript, setTranscript] = useState(false);
  const scenes = useMemo(() => scenesFor(plan, mode), [plan, mode]);
  const timeline = useMemo(() => ({ durations: scenes.map((s) => (mode === 'play' ? s.speakMs : s.readMs)) }), [scenes, mode]);
  const [clock] = useState(() => new Clock());
  const [gl] = useState(webgl2);
  const [state, setState] = useState({ index: 0, offset: 0, line: 0, paused: false });
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<GeoMapHandle>(null);
  const current = useRef(-1);
  /** Narration of the current scene still running (the clock waits for it at the end of the scene). */
  const speaking = useRef(false);
  const holding = useRef(false);
  const userPaused = useRef(false);
  const pendingSpeech = useRef(false);
  const exited = useRef(false);
  const [desktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);
  const pad = useMemo(() => (desktop ? { top: 80, bottom: 120, left: 60, right: 480 } : { top: 60, bottom: 320, left: 30, right: 30 }), [desktop]);
  const tour = mode === 'tour';

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const exit = useCallback(
    (reason: ExitReason) => {
      if (exited.current) return;
      exited.current = true;
      narrator?.cancel();
      onExitRef.current(reason);
    },
    [narrator],
  );

  const frame = useCallback(
    (s: Scene) => {
      const m = map.current;
      if (!m) return;
      if (s.lat != null && s.lon != null) m.flyTo(s.lon, s.lat, 3.4, pad);
      else if (s.iso3) m.focusCountry(s.iso3, pad);
      else m.flyTo(15, 22, 1.4, pad);
    },
    [pad],
  );

  const speak = useCallback(
    (s: Scene) => {
      if (mode !== 'play' || !narrator) return;
      if (userPaused.current) {
        pendingSpeech.current = true;
        return;
      }
      pendingSpeech.current = false;
      speaking.current = true;
      const id = s.id;
      void narrator
        .speak(s.lines, (i) => {
          if (scenes[current.current]?.id === id) setState((st) => ({ ...st, line: i }));
        })
        .finally(() => {
          if (scenes[current.current]?.id !== id) return;
          speaking.current = false;
          if (holding.current) {
            holding.current = false;
            if (!userPaused.current) clock.play();
          }
        });
    },
    [mode, narrator, scenes, clock],
  );

  /** Shows scene `i` from its start: camera, card, captions and narration. */
  const enter = useCallback(
    (i: number) => {
      const s = scenes[i];
      if (!s) return;
      current.current = i;
      holding.current = false;
      narrator?.cancel();
      speaking.current = false;
      frame(s);
      speak(s);
    },
    [scenes, narrator, frame, speak],
  );

  const seek = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(scenes.length - 1, i));
      clock.seek(startOf(timeline, n));
      if (!userPaused.current) clock.play();
      enter(n);
      setState((st) => ({ ...st, index: n, offset: 0, line: 0 }));
    },
    [clock, timeline, enter, scenes.length],
  );

  const togglePause = useCallback(() => {
    if (userPaused.current) {
      userPaused.current = false;
      if (!holding.current) clock.play();
      if (pendingSpeech.current) {
        const s = scenes[current.current];
        if (s) speak(s);
      } else narrator?.resume();
      setState((st) => ({ ...st, paused: false }));
    } else {
      userPaused.current = true;
      clock.pause();
      narrator?.pause();
      setState((st) => ({ ...st, paused: true }));
    }
  }, [clock, narrator, scenes, speak]);

  // Start, and drive the timeline from one clock.
  useEffect(() => {
    clock.seek(0);
    clock.play();
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 100) return;
      last = t;
      const now = clock.now();
      const at = locate(timeline, now);
      if (at.done) {
        if (tour) {
          clock.seek(0);
          enter(0);
          setState((st) => ({ ...st, index: 0, offset: 0, line: 0 }));
          return;
        }
        // Narration still finishing the last scene: wait for it.
        if (speaking.current) {
          clock.pause();
          holding.current = true;
          return;
        }
        if (!holding.current) exit('done');
        return;
      }
      if (at.index !== current.current) {
        // Narration still running for the previous scene: hold the clock at the end of that scene.
        if (speaking.current && current.current >= 0 && at.index === current.current + 1) {
          clock.pause();
          clock.seek(startOf(timeline, at.index) - 1);
          holding.current = true;
          return;
        }
        enter(at.index);
        setState((st) => ({ ...st, index: at.index, offset: at.offset, line: 0 }));
      } else setState((st) => (Math.abs(st.offset - at.offset) < 90 ? st : { ...st, offset: at.offset }));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      narrator?.cancel();
    };
  }, [clock, timeline, enter, exit, narrator, tour, mode]);

  // The map loads lazily: frame the current scene once it is there.
  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const s = scenes[Math.max(0, current.current)];
      if (map.current && s) {
        frame(s);
        clearInterval(t);
      } else if (tries > 40) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [scenes, frame]);

  // Page under the presentation: no scrolling; browser full screen when the user started it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = root.current;
    let requested = false;
    if (fullscreen && el?.requestFullscreen && !document.fullscreenElement) {
      requested = true;
      el.requestFullscreen().catch(() => undefined);
    }
    return () => {
      document.body.style.overflow = prev;
      if (requested && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [fullscreen]);

  // Keyboard: Esc exits; in briefings Space pauses and the arrows move between scenes. In the tour any key exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tour) {
        e.preventDefault();
        e.stopPropagation();
        exit('user');
        return;
      }
      if (e.key === 'Escape') exit('user');
      else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      }
      else if (e.key === 'ArrowRight') seek(current.current + 1);
      else if (e.key === 'ArrowLeft') seek(current.current - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, exit, togglePause, seek]);

  // Tour: any click or tap exits and is consumed, so it never activates what is underneath.
  useEffect(() => {
    if (!tour) return;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = (e: Event) => {
      swallow(e);
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 600);
      exit('user');
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [tour, exit]);

  // Leaving browser full screen ends a tour; a briefing continues edge to edge.
  useEffect(() => {
    const on = () => {
      if (tour && !document.fullscreenElement && fullscreen) exit('user');
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [tour, fullscreen, exit]);

  const scene = scenes[state.index];
  const mapState: MapState = useMemo(
    () => ({
      mode: '3d',
      style: 'grayscale',
      layers: [
        { id: 'earthquakes', opacity: 1 },
        { id: 'disasters', opacity: 1 },
      ],
      center: [15, 22],
      zoom: 1.4,
      date: new Date().toISOString().slice(0, 10),
      year: new Date().getUTCFullYear() - 2,
      country: scene?.iso3 ?? null,
    }),
    [scene?.iso3],
  );
  const selectedId = scene?.id.startsWith('ev:') ? scene.id.slice(3) : null;
  const line: Line | undefined = scene?.lines[Math.min(state.line, scene.lines.length - 1)];
  const dur = timeline.durations[state.index] ?? 1;
  const elapsed = startOf(timeline, state.index) + state.offset;
  const remaining = Math.max(0, Math.ceil((total(timeline) - elapsed) / 1000));

  return (
    <div
      ref={root}
      className={`fixed inset-0 z-[100] overflow-hidden bg-ink-950 text-platinum ${state.paused ? 'av-paused' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={tour ? 'Auto Tour. Press any key or click to exit.' : mode === 'play' ? 'AI briefing' : 'Written briefing'}
    >
      {/* The map stops above the control bar so its attribution stays visible. */}
      <div className={`absolute inset-x-0 top-0 ${tour ? 'bottom-0' : 'bottom-14'}`}>
        {gl ? (
          <Suspense fallback={null}>
            <GeoMap
              ref={map}
              state={mapState}
              today={mapState.date}
              events={events}
              values={{}}
              selectedEventId={selectedId}
              interactive={false}
              onView={() => undefined}
              onCountry={() => undefined}
              onEvent={() => undefined}
              onTileError={() => undefined}
            />
          </Suspense>
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-dim">The globe needs WebGL 2, which this browser does not offer.</div>
        )}
      </div>

      {/* Sensor reticle around the framed point while the camera travels; it fades once the scene settles. */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ paddingRight: desktop ? 440 : 0, paddingBottom: desktop ? 0 : 300 }}>
        <div className="relative h-full w-full">
          <div
            className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500"
            style={{ opacity: scene?.id !== 'intro' && state.offset < 1800 ? 1 : 0 }}
          >
            <span className="av-bracket left-0 top-0 border-l border-t" />
            <span className="av-bracket right-0 top-0 border-r border-t" />
            <span className="av-bracket bottom-0 left-0 border-b border-l" />
            <span className="av-bracket bottom-0 right-0 border-b border-r" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 text-[11px] text-mist">
        <span className="eyebrow !text-[10px]">{tour ? 'Auto Tour' : mode === 'play' ? 'AI briefing' : 'Briefing'}</span>
        <span>{subtitle ?? WINDOWS[plan.window].label}</span>
        <span className="num">
          {state.index + 1}/{scenes.length}
        </span>
        {!tour && <span className="num">{remaining} s left</span>}
      </div>
      {tour && <div className="pointer-events-none absolute right-4 top-4 text-[11px] text-mist">Click, tap or press any key to return</div>}

      {/* Scene card: title, explanation, date and sources. */}
      {scene && (
        <section
          key={scene.id}
          className={`absolute z-10 border border-line bg-ink-950/90 p-5 backdrop-blur ${desktop ? 'right-6 top-16 w-[420px] rounded-xl' : 'inset-x-3 bottom-24 rounded-xl'}`}
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-dim">
            <span>{scene.kind === 'news' ? 'News' : scene.id === 'intro' ? 'Overview' : 'Signal'}</span>
            <span>·</span>
            <span>
              {ANALYSTS[scene.lead].name} · {ANALYSTS[scene.lead].role}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold leading-snug">{scene.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">{scene.explanation}</p>
          {scene.id !== 'intro' && <p className="mt-2 text-[11px] text-slate-dim">{fmtDate(scene.date)}</p>}
          {scene.sources.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[11px]">
              {scene.sources.slice(0, 3).map((s) => (
                <li key={s.url}>
                  {tour ? (
                    <span className="text-mist">{s.name}</span>
                  ) : (
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-gold hover:underline">
                      {s.name} <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Timing cue for the current scene. */}
          <div className="mt-4 h-0.5 bg-line" aria-hidden>
            <div className="h-full bg-gold/70" style={{ width: `${Math.min(100, (state.offset / dur) * 100)}%` }} />
          </div>
        </section>
      )}

      {/* Captions (narrated briefing). */}
      {mode === 'play' && line && !transcript && (
        <div className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-center ${desktop ? 'bottom-24 w-[min(720px,calc(100%-560px))]' : 'top-14 w-[calc(100%-24px)]'}`}>
          <p className="inline rounded bg-ink-950/85 px-3 py-1.5 text-sm leading-relaxed">
            <span className={line.speaker === 'eve' ? 'text-gold' : 'text-platinum'}>{ANALYSTS[line.speaker].name}:</span> {line.text}
          </p>
          {audioNote && <p className="mt-2 text-[11px] text-warn">{audioNote}</p>}
        </div>
      )}

      {/* Controls and timeline (briefings only). */}
      {!tour && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-t border-line bg-ink-950/90 px-3 py-2 backdrop-blur sm:gap-3 sm:px-4">
          <button className="chip min-h-10 px-3" onClick={togglePause} aria-label={state.paused ? 'Resume' : 'Pause'}>
            {state.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">{state.paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button className="chip min-h-10 px-3" onClick={() => seek(state.index - 1)} disabled={state.index === 0} aria-label="Previous story">
            <SkipBack className="h-4 w-4" aria-hidden />
          </button>
          <button className="chip min-h-10 px-3" onClick={() => (state.index >= scenes.length - 1 ? exit('done') : seek(state.index + 1))} aria-label="Next story">
            <SkipForward className="h-4 w-4" aria-hidden />
          </button>
          <ol className="flex min-w-[120px] flex-1 items-center gap-1" aria-label="Timeline">
            {scenes.map((s, i) => (
              <li key={s.id} className="flex-1" style={{ flexGrow: timeline.durations[i] }}>
                <button
                  className="flex h-10 w-full items-center disabled:cursor-default"
                  disabled={i > state.index}
                  onClick={() => seek(i)}
                  aria-label={`${i < state.index ? 'Back to' : i === state.index ? 'Restart' : 'Upcoming:'} ${s.title}`}
                  aria-current={i === state.index ? 'step' : undefined}
                >
                  <span className="block h-1 w-full overflow-hidden rounded bg-line">
                    <span className="block h-full bg-gold" style={{ width: i < state.index ? '100%' : i === state.index ? `${Math.min(100, (state.offset / dur) * 100)}%` : '0%' }} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button className="chip min-h-10 px-3" onClick={() => setTranscript((t) => !t)} aria-pressed={transcript} aria-label="Transcript">
            <FileText className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Transcript</span>
          </button>
          <button className="chip min-h-10 px-3" onClick={() => exit('user')} aria-label="Exit briefing">
            <X className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      )}
      {transcript && !tour && (
        <section
          className={`absolute z-20 overflow-y-auto border border-line bg-ink-950/95 p-4 text-sm backdrop-blur ${desktop ? 'bottom-20 left-6 top-14 w-[380px] rounded-xl' : 'inset-x-3 bottom-20 top-14 rounded-xl'}`}
          aria-label="Transcript"
          data-scroll-panel
        >
          <div className="eyebrow mb-2">Transcript</div>
          <ol className="space-y-3">
            {scenes.map((sc, i) => (
              <li key={sc.id} className={i === state.index ? 'text-platinum' : 'text-mist'}>
                <div className="text-[10px] uppercase tracking-wider text-slate-dim">{sc.title}</div>
                {sc.lines.map((l, j) => (
                  <p key={j} className="mt-1 leading-relaxed">
                    <span className={l.speaker === 'eve' ? 'text-gold' : 'text-platinum'}>{ANALYSTS[l.speaker].name}:</span> {l.text}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
      {mode === 'play' && !line && audioNote && <p className="absolute bottom-16 left-4 text-[11px] text-warn">{audioNote}</p>}
    </div>
  );
}
