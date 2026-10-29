import { RotateCcw, Volume2, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoEvent } from '../../../shared/types';
import type { Ambience } from '../../lib/ambience';
import { ANALYSTS, SPEAKER_COLOR, type Analyst, type Line, type Plan, type Scene } from '../../lib/briefingPlan';
import type { MapState } from '../../lib/geo/state';
import type { Narrator } from '../../lib/narration';
import { Clock, locate, startOf } from '../../lib/presentation';
import type { CameraStage, DetailImagery, GeoMapHandle, MapTarget } from '../geo/GeoMap';
import { Monogram } from '../Logo';

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
  /** Operations-room ambience (narrated briefing only), started by the user's click. */
  ambience?: Ambience | null;
  /** Licensed high-resolution imagery for close-ups, when configured. */
  detailImagery?: DetailImagery | null;
  /** Kept for compatibility; the presentation always fills the viewport and never asks for browser full screen. */
  fullscreen?: boolean;
  /** Edition label (e.g. the edition date, or "Preview"). */
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
const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const OPEN_MS = 1800;
/** Reading time for a caption line in the silent modes: about 3 words per second, never under 2.4 s. */
const readLineMs = (text: string) => Math.max(2_400, (text.split(/\s+/).length / 3) * 1000 + 600);
const CAMERA_LEAD_MS = 1_200;

/** Narrated briefings open over the whole globe and close back on it. */
function scenesFor(plan: Plan, mode: PresentationMode): Scene[] {
  if (mode !== 'play') return plan.scenes;
  const base = { kind: 'event' as const, date: plan.scenes[0]?.date ?? new Date(0).toISOString(), sources: [], related: 0, lead: 'lead' as Analyst, readMs: 3_000 };
  const intro: Scene = { ...base, id: 'intro', title: 'Operations Briefing', explanation: `${plan.scenes.length} ${plan.scenes.length === 1 ? 'item' : 'items'} from public sources.`, lines: [plan.intro, plan.agenda], speakMs: 4_000 };
  const outro: Scene = { ...base, id: 'outro', title: 'End of briefing', explanation: '', lines: [plan.outro], speakMs: 2_500 };
  return [intro, ...plan.scenes, outro];
}

/** Camera path for a scene: Earth → region → country → local, never closer than the location precision allows. */
function pathFor(s: Scene, closeZoom: number): { stages: CameraStage[]; detailFrom: number | null } {
  if (s.lat == null || s.lon == null) return { stages: [], detailFrom: null };
  const overLand = s.kind === 'event' && !!s.title && !/ridge|ocean|sea\b|trench|islands? region/i.test(s.title);
  const stages: CameraStage[] = [
    { lon: s.lon, lat: s.lat, zoom: 2.4, duration: 1500 },
    { lon: s.lon, lat: s.lat, zoom: 4.6, duration: 1300 },
    { lon: s.lon, lat: s.lat, zoom: overLand ? 7.2 : 6, duration: 1400 },
  ];
  // The final close-up goes only as deep as the imagery resolves (no upsampled blur).
  if (overLand && closeZoom > 7.2) stages.push({ lon: s.lon, lat: s.lat, zoom: closeZoom, duration: 1700 });
  return { stages, detailFrom: 2 };
}

/** Original role badges: one geometric shape per presenter (identity, not rank insignia). */
function RoleBadge({ role }: { role: Analyst }) {
  const c = SPEAKER_COLOR[role];
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      {role === 'lead' && <path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" fill="none" stroke={c} strokeWidth="1.4" />}
      {role === 'eve' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="1.4" />
          <circle cx="8" cy="8" r="2" fill={c} />
        </>
      )}
      {role === 'knox' && <path d="M8 1.5 14 4v4.5c0 3-2.6 5.2-6 6-3.4-.8-6-3-6-6V4z" fill="none" stroke={c} strokeWidth="1.4" />}
    </svg>
  );
}

/**
 * Full-screen briefing on the intelligence globe, shared by the Situation Report (`read`), the Operations Briefing
 * (`play`) and Comfort Mode (`tour`). The plan is frozen by the caller; nothing here regenerates or reorders it.
 * The narrated briefing is driven by the speech itself: the next story starts as soon as the previous one has been
 * spoken (no dead air), the camera dives through several zoom levels while the Commander hands over, and close-ups switch
 * from the grayscale map to natural-colour imagery with a short acquisition effect. Controls stay hidden until the
 * pointer moves; there is no player frame.
 */
export function Presentation({ plan, mode, events, narrator = null, audioNote = null, ambience = null, detailImagery = null, subtitle, onExit }: Props) {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    narrator?.reportTo(setProblem);
  }, [narrator]);
  const note = problem ?? audioNote;
  const play = mode === 'play';
  const tour = mode === 'tour';
  const scenes = useMemo(() => scenesFor(plan, mode), [plan, mode]);
  // Silent modes (Situation Report, Comfort Mode) show the conversation as captions, timed by reading length.
  const lineTimes = useMemo(() => scenes.map((s) => s.lines.map((l) => readLineMs(l.text))), [scenes]);
  const timeline = useMemo(
    () => ({ durations: scenes.map((s, i) => (play ? s.speakMs : CAMERA_LEAD_MS + (lineTimes[i]!.reduce((a, b) => a + b, 0) || s.readMs))) }),
    [scenes, play, lineTimes],
  );
  const [clock] = useState(() => new Clock());
  const [gl] = useState(webgl2);
  const [state, setState] = useState({ index: 0, offset: 0, line: 0, lineAt: 0, paused: false, phase: (tour ? 'live' : 'opening') as 'opening' | 'live' | 'closing', detail: false, acquire: 0, spoken: 0, tick: 0, run: 0 });
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<GeoMapHandle>(null);
  const current = useRef(-1);
  const userPaused = useRef(false);
  const pendingSpeech = useRef(false);
  const exited = useRef(false);
  /** The closing card is up: the reading clock stops driving scenes until a replay. */
  const closing = useRef(false);
  const [desktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);
  const pad = useMemo(() => (desktop ? { top: 70, bottom: 150, left: 60, right: 470 } : { top: 60, bottom: 300, left: 24, right: 24 }), [desktop]);

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const exit = useCallback(
    (reason: ExitReason) => {
      if (exited.current || closing.current) return;
      exited.current = true;
      narrator?.cancel();
      ambience?.stop();
      onExitRef.current(reason);
    },
    [narrator, ambience],
  );

  /** Camera choreography for a scene; switches to colour imagery when the close stages begin. */
  const frame = useCallback(
    (s: Scene) => {
      const m = map.current;
      if (!m) return;
      setState((st) => (st.detail ? { ...st, detail: false } : st));
      if (s.id === 'intro' || s.id === 'outro') {
        void m.flyStages([{ lon: 12, lat: 24, zoom: s.id === 'intro' ? 1.5 : 1.15, duration: 2200 }], pad);
        return;
      }
      if (s.lat == null || s.lon == null) {
        if (s.iso3) m.focusCountry(s.iso3, pad);
        return;
      }
      const { stages, detailFrom } = pathFor(s, detailImagery ? 12 : 8);
      void m.flyStages(stages, pad, (i) => {
        if (detailFrom !== null && i === detailFrom) setState((st) => ({ ...st, detail: true, acquire: st.acquire + 1 }));
      });
    },
    [pad, detailImagery],
  );

  const enterRef = useRef<(i: number) => void>(() => undefined);
  const speak = useCallback(
    (s: Scene, i: number) => {
      if (!play) return;
      if (!narrator) {
        // Captions only: advance by reading time.
        window.setTimeout(() => {
          if (current.current === i && !userPaused.current) enterRef.current(i + 1);
        }, s.speakMs);
        return;
      }
      if (userPaused.current) {
        pendingSpeech.current = true;
        return;
      }
      pendingSpeech.current = false;
      const id = s.id;
      const before = scenes.slice(0, i).reduce((n, x) => n + x.lines.length, 0);
      void narrator
        .speak(s.lines, (li) => {
          if (scenes[current.current]?.id !== id) return;
          ambience?.duck(true);
          setState((st) => ({ ...st, line: li, lineAt: performance.now(), spoken: before + li }));
        })
        .finally(() => {
          if (scenes[current.current]?.id !== id || exited.current) return;
          ambience?.duck(false);
          // Speech-driven: the next story starts at once, so there is no silence between events.
          if (!userPaused.current) enterRef.current(i + 1);
        });
    },
    [play, narrator, scenes, ambience],
  );

  /** Shows scene `i` from its start: camera, card, captions and narration. Past the last scene: the closing card. */
  const enter = useCallback(
    (i: number) => {
      if (i >= scenes.length) {
        if (tour) return enterRef.current(0);
        closing.current = true;
        clock.pause();
        narrator?.cancel();
        ambience?.duck(false);
        setState((st) => ({ ...st, phase: 'closing', detail: false }));
        void map.current?.flyStages([{ lon: 12, lat: 24, zoom: 1.2, duration: 2200 }], pad);
        return;
      }
      const s = scenes[i]!;
      current.current = i;
      narrator?.cancel();
      if (i > 0 && play) ambience?.cue();
      frame(s);
      clock.seek(startOf(timeline, i));
      if (!userPaused.current) clock.play();
      setState((st) => ({ ...st, index: i, offset: 0, line: 0, lineAt: performance.now() }));
      speak(s, i);
    },
    [scenes, tour, play, narrator, ambience, frame, clock, timeline, speak, pad],
  );
  useEffect(() => {
    enterRef.current = enter;
  }, [enter]);

  const seek = useCallback((i: number) => enter(Math.max(0, Math.min(scenes.length - 1, i))), [enter, scenes.length]);

  const togglePause = useCallback(() => {
    if (userPaused.current) {
      userPaused.current = false;
      clock.play();
      ambience?.resume();
      if (pendingSpeech.current) {
        const s = scenes[current.current];
        if (s) speak(s, current.current);
      } else narrator?.resume();
      setState((st) => ({ ...st, paused: false }));
    } else {
      userPaused.current = true;
      clock.pause();
      narrator?.pause();
      ambience?.pause();
      setState((st) => ({ ...st, paused: true }));
    }
  }, [clock, narrator, ambience, scenes, speak]);

  // Opening card, then the first scene. Reading modes start at once and follow the clock.
  useEffect(() => {
    const t = window.setTimeout(
      () => {
        setState((st) => ({ ...st, phase: 'live' }));
        enterRef.current(0);
      },
      tour ? 0 : OPEN_MS,
    );
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 90) return;
      last = now;
      if (play) {
        setState((st) => ({ ...st, offset: clock.now() - startOf(timeline, st.index), tick: now }));
        return;
      }
      if (exited.current) return;
      const at = locate(timeline, clock.now());
      if (current.current < 0) return;
      if (at.done) {
        enterRef.current(scenes.length);
        return;
      }
      if (at.index !== current.current) enterRef.current(at.index);
      else setState((st) => (Math.abs(st.offset - at.offset) < 90 ? st : { ...st, offset: at.offset }));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
      narrator?.cancel();
    };
  }, [clock, timeline, scenes.length, play, tour, narrator]);

  // The map loads lazily: frame the current scene once it is there.
  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (map.current) {
        const s = scenes[Math.max(0, current.current)];
        if (s && current.current >= 0) frame(s);
        else void map.current.flyStages([{ lon: 12, lat: 24, zoom: 0.9, duration: 10 }]);
        clearInterval(t);
      } else if (tries > 40) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, [scenes, frame]);

  // The presentation fills the viewport (no browser full-screen request); the page underneath does not scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Starts the whole presentation again from the opening (the plan and stored audio are reused). */
  const replay = useCallback(() => {
    closing.current = false;
    setState((st) => ({ ...st, phase: 'opening', run: st.run + 1, index: 0, offset: 0, line: 0, spoken: 0 }));
    window.setTimeout(() => {
      setState((st) => ({ ...st, phase: 'live' }));
      enterRef.current(0);
    }, OPEN_MS);
  }, []);

  // Keyboard: Esc exits; Space pauses; arrows move between stories. In Comfort Mode any key exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tour) {
        e.preventDefault();
        e.stopPropagation();
        exit('user');
        return;
      }
      if (e.key === 'Escape') exit(state.phase === 'closing' ? 'done' : 'user');
      else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'ArrowRight') seek(current.current + 1);
      else if (e.key === 'ArrowLeft') seek(current.current - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, exit, togglePause, seek, state.phase]);

  // Comfort Mode: any click or tap exits and is consumed, so it never activates what is underneath.
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

  const scene = scenes[state.index];
  const mapState: MapState = useMemo(
    () => ({
      mode: '3d',
      style: 'grayscale',
      layers: [
        { id: 'earthquakes', opacity: 1 },
        { id: 'disasters', opacity: 1 },
      ],
      center: [12, 24],
      zoom: 0.9,
      date: new Date().toISOString().slice(0, 10),
      year: new Date().getUTCFullYear() - 2,
      country: scene?.iso3 ?? null,
    }),
    [scene?.iso3],
  );
  const selectedId = scene?.id.startsWith('ev:') ? scene.id.slice(3) : null;
  const target: MapTarget | null = useMemo(
    () => (scene && scene.lat != null && scene.lon != null && state.phase === 'live' ? { lon: scene.lon, lat: scene.lat, label: scene.title.replace(/^M\s?\d+(\.\d)?\s*-\s*/, '').slice(0, 40), precise: scene.kind === 'event' } : null),
    [scene, state.phase],
  );
  // Which line is on screen: the narrator says so when speaking; the silent modes follow reading time.
  let lineIdx = state.line;
  let sinceLine = state.tick - state.lineAt;
  if (!play && scene) {
    let t = state.offset - CAMERA_LEAD_MS;
    lineIdx = -1;
    for (const [i, d] of (lineTimes[state.index] ?? []).entries()) {
      if (t < 0) break;
      lineIdx = i;
      sinceLine = t;
      t -= d;
    }
  }
  const line: Line | undefined = lineIdx >= 0 ? scene?.lines[Math.min(lineIdx, scene.lines.length - 1)] : undefined;
  // Captions reveal word by word, slightly ahead of the voice (about 3.4 words per second) so they are easy to read.
  const words = line ? line.text.split(' ') : [];
  const shown = Math.min(words.length, 3 + Math.floor(sinceLine / 290));
  const label = tour ? 'Comfort Mode' : play ? 'Operations Briefing' : 'Situation Report';

  return (
    <div
      ref={root}
      className={`av-present fixed inset-0 z-[100] overflow-hidden bg-ink-950 text-platinum ${state.paused ? "av-paused" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={tour ? 'Comfort Mode. Press any key or click to exit.' : label}
    >
      <div className="absolute inset-0">
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
              detail={state.detail}
              detailImagery={detailImagery}
              target={target}
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
      <div className="av-vignette pointer-events-none absolute inset-0" aria-hidden />
      {state.acquire > 0 && <div key={state.acquire} className="av-acquire" aria-hidden />}

      {/* Edition label only; no explanatory captions on the presentation. */}
      {!tour && (
        <div className="pointer-events-none absolute left-5 top-4 z-10 text-[11px] text-mist">
          <div className="eyebrow !text-[10px]">{label}</div>
          {subtitle && <div className="mt-0.5">{subtitle}</div>}
        </div>
      )}

      {/* Story card: what and when (sources stay in the transcript and the evidence views). */}
      {scene && state.phase === 'live' && scene.id !== 'intro' && scene.id !== 'outro' && !tour && (
        <section
          key={`${state.run}-${scene.id}`}
          className={`av-session absolute z-10 border-l-2 border-gold/70 bg-ink-950/75 p-4 backdrop-blur ${desktop ? 'right-6 top-20 w-[380px]' : 'inset-x-3 top-16'}`}
          aria-live="polite"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-dim">{fmtDate(scene.date)}</div>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug">{scene.title}</h2>
          {scene.explanation && <p className="mt-1.5 text-sm leading-relaxed text-mist">{scene.explanation}</p>}
        </section>
      )}

      {/* The conversation: spoken in the Operations Briefing, shown as timed captions in the silent modes. */}
      {line && state.phase === 'live' && (
        <div
          key={`${state.run}-${scene?.id}-${lineIdx}`}
          className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${tour ? 'bottom-[18%] w-[min(820px,calc(100%-48px))]' : desktop ? 'bottom-14 w-[min(760px,calc(100%-560px))]' : 'bottom-10 w-[calc(100%-24px)]'}`}
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: SPEAKER_COLOR[line.speaker] }}>
            <RoleBadge role={line.speaker} />
            {ANALYSTS[line.speaker].name}
          </div>
          <p className={`mt-1 leading-relaxed text-platinum [text-shadow:0_1px_6px_rgba(0,0,0,0.9)] ${tour ? 'text-xl' : 'text-[17px]'}`}>
            {words.slice(0, shown).join(' ')}
            <span className="opacity-0">{shown < words.length ? ` ${words.slice(shown).join(' ')}` : ''}</span>
          </p>
        </div>
      )}

      {/* A real playback block (no user gesture) gets one clean recovery action; other problems one short line. */}
      {problem === 'SOUND_BLOCKED' ? (
        <button
          className="btn-primary absolute bottom-24 left-1/2 z-30 -translate-x-1/2 text-xs"
          onClick={() => {
            setProblem(null);
            narrator?.resume();
            ambience?.resume();
          }}
        >
          <Volume2 className="h-4 w-4" aria-hidden /> Enable sound
        </button>
      ) : (
        play && note && state.phase === 'live' && <p className="absolute bottom-4 left-5 z-20 text-[11px] text-slate-dim">{note}</p>
      )}

      {/* Session open and close: the briefing starts like a session, not a video. */}
      {state.phase !== 'live' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
          <div key={`${state.run}-${state.phase}`} className="av-session flex flex-col items-center gap-4 text-center">
            <Monogram className="h-14 w-auto" />
            <div className="eyebrow">{state.phase === 'opening' ? label : 'Briefing complete'}</div>
            {subtitle && <div className="text-xs text-mist">{subtitle}</div>}
            {state.phase === 'closing' && (
              <div className="mt-2 flex gap-2">
                <button className="btn-ghost text-xs" onClick={replay}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay Briefing
                </button>
                <button className="btn-primary text-xs" onClick={() => exit('done')} autoFocus>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* One discreet, accessible way out (Esc does the same). */}
      {!tour && state.phase !== 'closing' && (
        <button className="absolute right-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full text-mist/60 hover:bg-ink-900/60 hover:text-platinum" onClick={() => exit('user')} aria-label="Close briefing">
          <X className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
