import { ExternalLink, FileText, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoEvent } from '../../../shared/types';
import type { Ambience } from '../../lib/ambience';
import { ANALYSTS, SPEAKER_COLOR, WINDOWS, type Analyst, type Line, type Plan, type Scene } from '../../lib/briefingPlan';
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
  /** Ask the browser for full screen (only when the user started the presentation). */
  fullscreen: boolean;
  /** Edition and coverage label. */
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
const CLOSE_MS = 1700;
const CHROME_MS = 2600;

/** Narrated briefings open over the whole globe and close back on it. */
function scenesFor(plan: Plan, mode: PresentationMode): Scene[] {
  if (mode !== 'play') return plan.scenes;
  const base = { kind: 'event' as const, date: plan.scenes[0]?.date ?? new Date(0).toISOString(), sources: [], related: 0, lead: 'lead' as Analyst, readMs: 3_000 };
  const intro: Scene = { ...base, id: 'intro', title: 'Operations Briefing', explanation: `${plan.scenes.length} ${plan.scenes.length === 1 ? 'item' : 'items'} from public sources.`, lines: [plan.intro, plan.agenda], speakMs: 4_000 };
  const outro: Scene = { ...base, id: 'outro', title: 'End of briefing', explanation: 'Sources and the full transcript follow.', lines: [plan.outro], speakMs: 2_500 };
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
export function Presentation({ plan, mode, events, narrator = null, audioNote = null, ambience = null, detailImagery = null, fullscreen, subtitle, onExit }: Props) {
  const [transcript, setTranscript] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    narrator?.reportTo(setProblem);
  }, [narrator]);
  const note = problem ?? audioNote;
  const play = mode === 'play';
  const tour = mode === 'tour';
  const scenes = useMemo(() => scenesFor(plan, mode), [plan, mode]);
  const timeline = useMemo(() => ({ durations: scenes.map((s) => (play ? s.speakMs : s.readMs)) }), [scenes, play]);
  const [clock] = useState(() => new Clock());
  const [gl] = useState(webgl2);
  const [state, setState] = useState({ index: 0, offset: 0, line: 0, lineAt: 0, paused: false, phase: (play ? 'opening' : 'live') as 'opening' | 'live' | 'closing', detail: false, acquire: 0, chrome: true, muted: false, spoken: 0, tick: 0 });
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<GeoMapHandle>(null);
  const current = useRef(-1);
  const userPaused = useRef(false);
  const pendingSpeech = useRef(false);
  const exited = useRef(false);
  const chromeTimer = useRef(0);
  const [desktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);
  const pad = useMemo(() => (desktop ? { top: 70, bottom: 150, left: 60, right: 470 } : { top: 60, bottom: 300, left: 24, right: 24 }), [desktop]);
  const totalLines = useMemo(() => scenes.reduce((n, s) => n + s.lines.length, 0), [scenes]);

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const exit = useCallback(
    (reason: ExitReason) => {
      if (exited.current) return;
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
        setState((st) => ({ ...st, phase: 'closing' }));
        window.setTimeout(() => exit('done'), CLOSE_MS);
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
    [scenes, tour, play, narrator, ambience, frame, clock, timeline, speak, exit],
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
      play ? OPEN_MS : 0,
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
  }, [clock, timeline, scenes.length, play, narrator]);

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

  // Controls appear when the pointer moves or a key is pressed, and fade after a moment of stillness.
  const wake = useCallback(() => {
    setState((st) => (st.chrome ? st : { ...st, chrome: true }));
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setState((st) => ({ ...st, chrome: false })), CHROME_MS);
  }, []);
  useEffect(() => {
    if (tour) return;
    chromeTimer.current = window.setTimeout(() => setState((st) => ({ ...st, chrome: false })), CHROME_MS);
    window.addEventListener('pointermove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('touchstart', wake);
      window.clearTimeout(chromeTimer.current);
    };
  }, [tour, wake]);

  // Keyboard: Esc exits; Space pauses; arrows move between stories. In Comfort Mode any key exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tour) {
        e.preventDefault();
        e.stopPropagation();
        exit('user');
        return;
      }
      wake();
      if (e.key === 'Escape') exit('user');
      else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'ArrowRight') seek(current.current + 1);
      else if (e.key === 'ArrowLeft') seek(current.current - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, exit, togglePause, seek, wake]);

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
  const line: Line | undefined = scene?.lines[Math.min(state.line, scene.lines.length - 1)];
  // Captions reveal word by word, slightly ahead of the voice (about 3.4 words per second) so they are easy to read.
  const words = line ? line.text.split(' ') : [];
  const shown = play && narrator ? Math.min(words.length, 3 + Math.floor((state.tick - state.lineAt) / 290)) : words.length;
  const progress = play ? (totalLines ? Math.min(1, state.spoken / totalLines) : 0) : Math.min(1, (startOf(timeline, state.index) + state.offset) / Math.max(1, timeline.durations.reduce((a, b) => a + b, 0)));
  const label = tour ? 'Comfort Mode' : play ? 'Operations Briefing' : 'Situation Report';

  return (
    <div
      ref={root}
      className={`fixed inset-0 z-[100] overflow-hidden bg-ink-950 text-platinum ${state.paused ? 'av-paused' : ''}`}
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

      {/* Session header: quiet, always readable. */}
      <div className="pointer-events-none absolute left-5 top-4 z-10 text-[11px] text-mist">
        <div className="eyebrow !text-[10px]">{label}</div>
        <div className="mt-0.5">{subtitle ?? WINDOWS[plan.window].label}</div>
        {state.detail && <div className="mt-1 text-[10px] text-slate-dim">{detailImagery ? 'Colour satellite imagery (Esri World Imagery; not live)' : 'Natural-colour satellite composite (NASA Blue Marble; not live)'}</div>}
      </div>
      {tour && <div className="pointer-events-none absolute right-5 top-4 text-[11px] text-mist">Click, tap or press any key to return</div>}

      {/* Story card. */}
      {scene && state.phase === 'live' && scene.id !== 'intro' && scene.id !== 'outro' && (
        <section
          key={scene.id}
          className={`av-session absolute z-10 border-l-2 border-gold/70 bg-ink-950/80 p-4 backdrop-blur ${desktop ? 'right-6 top-20 w-[400px]' : 'inset-x-3 top-16'}`}
          aria-live="polite"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-dim">
            {scene.kind === 'news' ? 'News' : 'Signal'} · {fmtDate(scene.date)}
          </div>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug">{scene.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-mist">{scene.explanation}</p>
          {scene.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 text-[11px]">
              {scene.sources.slice(0, 3).map((s) =>
                tour ? (
                  <span key={s.url} className="text-mist">
                    {s.name}
                  </span>
                ) : (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-gold hover:underline">
                    {s.name} <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                  </a>
                ),
              )}
            </div>
          )}
        </section>
      )}

      {/* Live captions with the speaker's role. */}
      {play && line && !transcript && state.phase === 'live' && (
        <div className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${desktop ? 'bottom-14 w-[min(760px,calc(100%-560px))]' : 'bottom-10 w-[calc(100%-24px)]'}`}>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: SPEAKER_COLOR[line.speaker] }}>
            <RoleBadge role={line.speaker} />
            {ANALYSTS[line.speaker].name}
          </div>
          <p className="mt-1 text-[17px] leading-relaxed text-platinum [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
            {words.slice(0, shown).join(' ')}
            <span className="opacity-0">{shown < words.length ? ` ${words.slice(shown).join(' ')}` : ''}</span>
          </p>
          {note && <p className="mt-2 text-[11px] text-warn">{note}</p>}
        </div>
      )}
      {play && note && (transcript || !line) && <p className="absolute bottom-6 left-5 z-20 text-[11px] text-warn">{note}</p>}

      {/* Session open and close: the briefing starts like a session, not a video. */}
      {state.phase !== 'live' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink-950/70 backdrop-blur-sm transition-opacity duration-700">
          <div className="av-session flex flex-col items-center gap-4 text-center">
            <Monogram className="h-14 w-auto" />
            <div className="eyebrow">{state.phase === 'opening' ? 'Operations Briefing' : 'Briefing complete'}</div>
            <div className="text-xs text-mist">{subtitle}</div>
          </div>
        </div>
      )}

      {/* Minimal controls, hidden until the pointer moves. */}
      {!tour && (
        <div className="av-chrome absolute right-4 top-4 z-30 flex gap-1.5" data-hidden={!state.chrome}>
          <button className="chip min-h-10 bg-ink-950/80 px-3" onClick={togglePause} aria-label={state.paused ? 'Resume' : 'Pause'}>
            {state.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
          <button className="chip min-h-10 bg-ink-950/80 px-3" onClick={() => seek(state.index - 1)} disabled={state.index === 0} aria-label="Previous story">
            <SkipBack className="h-4 w-4" aria-hidden />
          </button>
          <button className="chip min-h-10 bg-ink-950/80 px-3" onClick={() => enter(state.index + 1)} aria-label="Next story">
            <SkipForward className="h-4 w-4" aria-hidden />
          </button>
          <button className="chip min-h-10 bg-ink-950/80 px-3" onClick={() => setTranscript((t) => !t)} aria-pressed={transcript} aria-label="Transcript">
            <FileText className="h-4 w-4" aria-hidden />
          </button>
          {ambience && (
            <button
              className="chip min-h-10 bg-ink-950/80 px-3"
              onClick={() => {
                ambience.setMuted(!state.muted);
                setState((st) => ({ ...st, muted: !st.muted }));
              }}
              aria-pressed={!state.muted}
              aria-label={state.muted ? 'Room ambience off' : 'Room ambience on'}
            >
              {state.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </button>
          )}
          <button className="chip min-h-10 bg-ink-950/80 px-3" onClick={() => exit('user')} aria-label="Exit briefing">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {/* A hairline of progress at the very bottom edge; no transport bar. */}
      {!tour && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-px bg-gold/60" style={{ transform: `scaleX(${progress})`, transformOrigin: 'left' }} aria-hidden />}

      {transcript && !tour && (
        <section
          className={`absolute z-20 overflow-y-auto border border-line bg-ink-950/95 p-4 text-sm backdrop-blur ${desktop ? 'bottom-16 left-6 top-20 w-[380px] rounded-xl' : 'inset-x-3 bottom-16 top-16 rounded-xl'}`}
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
                    <span style={{ color: SPEAKER_COLOR[l.speaker] }}>{ANALYSTS[l.speaker].name}:</span> {l.text}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
