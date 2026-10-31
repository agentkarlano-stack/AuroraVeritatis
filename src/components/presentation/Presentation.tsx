import { Volume2, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoEvent } from '../../../shared/types';
import type { Ambience } from '../../lib/ambience';
import { ANALYSTS, SPEAKER_COLOR, type Analyst, type Line, type Plan, type Scene } from '../../lib/briefingPlan';
import type { MapState } from '../../lib/geo/state';
import { readingMs, type Narrator } from '../../lib/narration';
import { Clock, locate, startOf } from '../../lib/presentation';
import type { CameraStage, DetailImagery, GeoMapHandle, MapTarget } from '../geo/GeoMap';
import { countryCentre } from '../../lib/geo/worldShapes';

const GeoMap = lazy(() => import('../geo/GeoMap'));
const MapboxGlobe = lazy(() => import('../map/MapboxGlobe'));

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
  /** Mapbox public token: the Mapbox globe with real satellite imagery at close range (else the MapLibre globe). */
  mapboxToken?: string | null;
  /** Kept for compatibility; the presentation always fills the viewport and never asks for browser full screen. */
  fullscreen?: boolean;
  /** Edition label (e.g. the edition date), shown briefly at the start. */
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
const CAMERA_LEAD_MS = 1_200;
/** Camera pull-back before the presentation fades back into Global Radar. */
const RETURN_MS = { done: 1_900, user: 800 } as const;
const FADE_MS = 650;

/**
 * Narrated briefings have no separate opening or closing scene: the Commander's opening question is spoken while the
 * camera travels to the first story, and the closing words are said over the last one.
 */
function scenesFor(plan: Plan, mode: PresentationMode): Scene[] {
  if (mode !== 'play' || !plan.scenes.length) return plan.scenes;
  const said = (l: Line) => !!l.text.trim();
  const scenes = plan.scenes.map((s) => ({ ...s }));
  const last = scenes[scenes.length - 1]!;
  last.lines = last.lines.concat([plan.outro].filter(said));
  // The Commander's opening is spoken over the distant globe; the camera approaches the first story only after it.
  const first = scenes[0]!;
  const opening: Scene = { ...first, id: 'opening', kind: 'event', title: '', explanation: '', sources: [], lines: [plan.intro, plan.agenda].filter(said), lat: first.lat, lon: first.lon, iso3: first.iso3, related: 0, speakMs: 4_000, readMs: 4_000 };
  return [opening, ...scenes];
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
 * Full-viewport briefing on the intelligence globe, shared by the Situation Report (`read`), the Operations Briefing
 * (`play`) and Comfort Mode (`tour`). The plan is frozen by the caller; nothing here regenerates or reorders it.
 * The narrated briefing is driven by the speech itself (audio is the clock): each turn is shown whole in an upper
 * column when its audio starts, the next story begins as soon as the previous one has been spoken, and after the
 * Commander's last words the camera pulls back and the scene fades into Global Radar. There is no opening card,
 * closing card, transport bar or in-scene replay; Esc (or the discreet close button) leaves early the same way.
 */
export function Presentation({ plan, mode, events, narrator = null, audioNote = null, ambience = null, detailImagery = null, mapboxToken = null, subtitle, onExit }: Props) {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    narrator?.reportTo(setProblem);
  }, [narrator]);
  const note = problem ?? audioNote;
  const play = mode === 'play';
  const tour = mode === 'tour';
  const scenes = useMemo(() => scenesFor(plan, mode), [plan, mode]);
  const scenesRef = useRef(scenes);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  // Silent modes (Situation Report, Comfort Mode) show the conversation as captions, timed by reading length.
  const lineTimes = useMemo(() => scenes.map((s) => s.lines.map((l) => readingMs(l.text))), [scenes]);
  const timeline = useMemo(
    () => ({ durations: scenes.map((s, i) => (play ? s.speakMs : CAMERA_LEAD_MS + (lineTimes[i]!.reduce((a, b) => a + b, 0) || s.readMs))) }),
    [scenes, play, lineTimes],
  );
  const [clock] = useState(() => new Clock());
  const [gl] = useState(webgl2);
  const [state, setState] = useState({ index: 0, offset: 0, line: 0, spoken: false, mapReady: false, leaving: false, paused: false, detail: false, acquire: 0 });
  const map = useRef<GeoMapHandle>(null);
  const current = useRef(-1);
  const userPaused = useRef(false);
  const pendingSpeech = useRef(false);
  const leaving = useRef(false);
  const handedBack = useRef(false);
  const [desktop] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? true);
  // The upper caption column is kept clear: the focus is framed in the space below it.
  const pad = useMemo(() => (desktop ? { top: 210, bottom: 60, left: 60, right: 60 } : { top: 230, bottom: 50, left: 20, right: 20 }), [desktop]);

  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const handBack = useCallback((reason: ExitReason) => {
    if (handedBack.current) return;
    handedBack.current = true;
    onExitRef.current(reason);
  }, []);
  /** Pull back to the strategic view, fade, then hand back to the page underneath (which kept its own state). */
  const exit = useCallback(
    (reason: ExitReason) => {
      if (leaving.current) {
        if (reason === 'user') handBack(reason);
        return;
      }
      leaving.current = true;
      narrator?.cancel();
      ambience?.stop();
      clock.pause();
      void map.current?.flyStages([{ lon: 12, lat: 24, zoom: 1.3, duration: RETURN_MS[reason] }], pad);
      setState((st) => ({ ...st, detail: false }));
      window.setTimeout(() => setState((st) => ({ ...st, leaving: true })), RETURN_MS[reason] - FADE_MS / 2);
      window.setTimeout(() => handBack(reason), RETURN_MS[reason] + FADE_MS / 2);
    },
    [narrator, ambience, clock, pad, handBack],
  );

  /** Camera choreography for a scene; switches to colour imagery when the close stages begin. */
  const frame = useCallback(
    (s: Scene) => {
      const m = map.current;
      if (!m) return;
      setState((st) => (st.detail ? { ...st, detail: false } : st));
      if (s.id === 'opening') {
        // Strategic overview, turned towards the first story, while the Commander names the items.
        const c = s.lat != null && s.lon != null ? [s.lon, s.lat] : s.iso3 ? countryCentre(s.iso3) : null;
        void m.flyStages([{ lon: c?.[0] ?? 12, lat: Math.max(-35, Math.min(35, c?.[1] ?? 20)), zoom: 1.35, duration: 1_600 }], pad);
        return;
      }
      if (s.lat == null || s.lon == null) {
        // Country-level story: region context, then the whole country framed, then a slow drift (never a fake point).
        const c = s.iso3 ? countryCentre(s.iso3) : null;
        if (!c || !s.iso3) return;
        void m.flyStages([{ lon: c[0], lat: c[1], zoom: 2.6, duration: 1_500 }], pad).then(() => {
          if (scenesRef.current[current.current]?.id !== s.id) return;
          m.focusCountry(s.iso3!, pad);
          window.setTimeout(() => scenesRef.current[current.current]?.id === s.id && m.drift?.(14_000), 1_500);
        });
        return;
      }
      const { stages, detailFrom } = pathFor(s, mapboxToken ? 11 : detailImagery ? 12 : 8);
      void m
        .flyStages(stages, pad, (i) => {
          if (detailFrom !== null && i === detailFrom) setState((st) => ({ ...st, detail: true, acquire: st.acquire + 1 }));
        })
        .then(() => scenesRef.current[current.current]?.id === s.id && m.drift?.(14_000));
    },
    [pad, detailImagery, mapboxToken],
  );

  const enterRef = useRef<(i: number) => void>(() => undefined);
  const speak = useCallback(
    (s: Scene, i: number) => {
      if (!play) return;
      if (!narrator) {
        // Captions only: advance by reading time.
        const total = s.lines.reduce((n, l) => n + readingMs(l.text), 0);
        setState((st) => ({ ...st, spoken: true }));
        s.lines.forEach((_, li) => {
          const at = s.lines.slice(0, li).reduce((n, l) => n + readingMs(l.text), 0);
          window.setTimeout(() => current.current === i && setState((st) => ({ ...st, line: li })), at);
        });
        window.setTimeout(() => {
          if (current.current === i && !userPaused.current) enterRef.current(i + 1);
        }, total);
        return;
      }
      if (userPaused.current) {
        pendingSpeech.current = true;
        return;
      }
      pendingSpeech.current = false;
      const id = s.id;
      void narrator
        .speak(s.lines, (li) => {
          if (scenes[current.current]?.id !== id) return;
          ambience?.duck(true);
          setState((st) => ({ ...st, line: li, spoken: true }));
        })
        .finally(() => {
          if (scenes[current.current]?.id !== id || leaving.current) return;
          ambience?.duck(false);
          // Speech-driven: the next story starts at once, so there is no silence between events.
          if (!userPaused.current) enterRef.current(i + 1);
        });
    },
    [play, narrator, scenes, ambience],
  );

  /** Shows scene `i` from its start: camera, captions and narration. Past the last scene: back to the page. */
  const enter = useCallback(
    (i: number) => {
      if (leaving.current) return;
      if (i >= scenes.length) {
        if (tour) return enterRef.current(0);
        exit('done');
        return;
      }
      const s = scenes[i]!;
      current.current = i;
      narrator?.cancel();
      if (i > 0 && play) ambience?.cue();
      frame(s);
      clock.seek(startOf(timeline, i));
      if (!userPaused.current) clock.play();
      setState((st) => ({ ...st, index: i, offset: 0, line: 0 }));
      speak(s, i);
    },
    [scenes, tour, play, narrator, ambience, frame, clock, timeline, speak, exit],
  );
  useEffect(() => {
    enterRef.current = enter;
  }, [enter]);

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

  // Starts at once: narration (or the reading clock) begins immediately; the camera joins when the map has loaded.
  useEffect(() => {
    const t = window.setTimeout(() => enterRef.current(0), 0);
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 90 || play || leaving.current) return;
      last = now;
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
        setState((st) => ({ ...st, mapReady: true }));
        clearInterval(t);
      } else if (tries > 40) {
        setState((st) => ({ ...st, mapReady: true }));
        clearInterval(t);
      }
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

  // Keyboard: Esc leaves; Space pauses (an accessibility control, not a visible transport). In Comfort Mode any key exits.
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
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour, exit, togglePause]);

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
      setTimeout(() => window.removeEventListener('click', swallow, true), 1200);
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
  const live = !state.leaving && (play ? state.spoken : true);
  const target: MapTarget | null = useMemo(() => {
    if (!scene || !live || scene.id === 'opening') return null;
    const label = scene.title.replace(/^M\s?\d+(\.\d)?\s*-\s*/, '').slice(0, 40);
    if (scene.lat != null && scene.lon != null) {
      const precise = scene.kind === 'event' && scene.id.startsWith('ev:usgs-');
      return { lon: scene.lon, lat: scene.lat, label, precise, kind: precise ? 'point' : 'area' };
    }
    // A story known only at country level: the country outline, never an invented point.
    return scene.iso3 ? { lon: 0, lat: 0, label, precise: false, kind: 'country', iso3: scene.iso3 } : null;
  }, [scene, live]);
  // Which line is on screen: the narrator says so when speaking; the silent modes follow reading time.
  let lineIdx = state.line;
  if (!play && scene) {
    let t = state.offset - CAMERA_LEAD_MS;
    lineIdx = -1;
    for (const [i, d] of (lineTimes[state.index] ?? []).entries()) {
      if (t < 0) break;
      lineIdx = i;
      t -= d;
    }
  }
  const line: Line | undefined = live && lineIdx >= 0 ? scene?.lines[Math.min(lineIdx, scene.lines.length - 1)] : undefined;
  const label = tour ? 'Comfort Mode' : play ? 'Operations Briefing' : 'Situation Report';
  const loading = !state.leaving && (!state.mapReady || (play && !state.spoken));

  return (
    <div
      className={`av-present fixed inset-0 z-[100] overflow-hidden bg-ink-950 text-platinum transition-opacity ${state.leaving ? 'pointer-events-none opacity-0' : 'opacity-100'} ${state.paused ? 'av-paused' : ''}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      role="dialog"
      aria-modal="true"
      aria-label={tour ? 'Comfort Mode. Press any key or click to exit.' : label}
    >
      <div className="absolute inset-0">
        {gl ? (
          <Suspense fallback={null}>
            {mapboxToken ? (
              <MapboxGlobe ref={map} token={mapboxToken} events={events} selectedEventId={selectedId} interactive={false} target={target} />
            ) : (
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
            )}
          </Suspense>
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-dim">The globe needs WebGL 2, which this browser does not offer.</div>
        )}
      </div>
      <div className="av-vignette pointer-events-none absolute inset-0" aria-hidden />
      {state.acquire > 0 && <div key={state.acquire} className="av-acquire" aria-hidden />}

      {/* Real readiness only: shown while the map or the first audio is still loading, never as a timed intro. */}
      {loading && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex flex-col items-center gap-2 text-center" role="status">
          <span className="av-load-dot h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
          <span className="text-[11px] uppercase tracking-[0.3em] text-mist">Initializing {tour ? 'Comfort Mode' : 'briefing'}</span>
        </div>
      )}

      {/* The edition or mode label appears briefly at the start, then fades. */}
      {!tour && !loading && (
        <div className="av-fade-label pointer-events-none absolute bottom-5 left-5 z-10 text-[11px] text-mist">
          <div className="eyebrow !text-[10px]">{label}</div>
          {subtitle && <div className="mt-0.5">{subtitle}</div>}
        </div>
      )}

      {/* The current turn, shown whole in a stable upper column (readable before or as it is spoken). */}
      {line && (
        <div
          key={`${scene?.id}-${lineIdx}`}
          className={`av-turn pointer-events-none absolute z-10 ${desktop ? 'left-10 top-12 w-[min(680px,calc(100%-160px))]' : 'inset-x-4 top-14'}`}
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: SPEAKER_COLOR[line.speaker] }}>
            <RoleBadge role={line.speaker} />
            {ANALYSTS[line.speaker].name}
          </div>
          <p className={`mt-1.5 border-l-2 pl-3 leading-snug text-platinum [text-shadow:0_1px_8px_rgba(0,0,0,0.95)] ${tour || desktop ? 'text-[22px]' : 'text-lg'}`} style={{ borderColor: SPEAKER_COLOR[line.speaker] }}>
            {line.text}
          </p>
        </div>
      )}

      {/* Where the camera is: place and time, shown when a story begins and then faded out. */}
      {scene && live && !tour && scene.title && (
        <div key={`place-${scene.id}`} className={`av-fade-label pointer-events-none absolute z-10 text-xs text-mist [text-shadow:0_1px_6px_rgba(0,0,0,0.9)] ${desktop ? 'bottom-5 right-6 text-right' : 'bottom-5 right-4 text-right'}`}>
          <div className="text-platinum/90">{scene.title}</div>
          <div className="num text-[11px] text-slate-dim">{fmtDate(scene.date)}</div>
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
        play && note && !state.leaving && <p className="absolute bottom-12 left-5 z-20 max-w-md text-[11px] text-slate-dim">{note}</p>
      )}

      {/* One discreet, accessible way out (Esc does the same). */}
      {!tour && !state.leaving && (
        <button className="absolute right-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-full text-mist/60 hover:bg-ink-900/60 hover:text-platinum" onClick={() => exit('user')} aria-label="Close briefing">
          <X className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
