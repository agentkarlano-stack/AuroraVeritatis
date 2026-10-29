/**
 * Operations-room ambience for the Operations Briefing, generated in the browser (no recorded assets, so no licence
 * questions): a low filtered room tone with a faint equipment hum, ducked while a presenter speaks, and a soft two-tone
 * comms cue at story handovers. Voices stay in front; nothing here imitates intercepted communications. Created only
 * from the user's click (browsers require it) and never during Comfort Mode or Idle Mode.
 */
export interface Ambience {
  /** Lower the bed while someone speaks; raise it gently in gaps (so there is never dead silence). */
  duck(speaking: boolean): void;
  /** Short, quiet comms cue for a handover between stories. */
  cue(): void;
  pause(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  stop(): void;
}

const BED = 0.05;
const BED_DUCKED = 0.022;

/** Call synchronously inside the click that starts the briefing. Returns null when Web Audio is unavailable. */
export function startAmbience(): Ambience | null {
  const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Room tone: two seconds of brown noise, looped, low-passed.
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  noise.connect(lp).connect(master);

  // Faint equipment hum.
  const hum = ctx.createOscillator();
  hum.frequency.value = 100;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.05;
  hum.connect(humGain).connect(master);

  noise.start();
  hum.start();
  master.gain.setTargetAtTime(BED, ctx.currentTime, 0.8);

  let muted = false;
  let level = BED;
  const apply = () => master.gain.setTargetAtTime(muted ? 0 : level, ctx.currentTime, 0.25);

  return {
    duck(speaking) {
      level = speaking ? BED_DUCKED : BED;
      apply();
    },
    cue() {
      if (muted) return;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      g.connect(bp).connect(ctx.destination);
      for (const [f, at] of [
        [1250, 0],
        [1650, 0.09],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(g);
        o.start(t + at);
        o.stop(t + at + 0.08);
      }
    },
    pause: () => void ctx.suspend().catch(() => undefined),
    resume: () => void ctx.resume().catch(() => undefined),
    setMuted(m) {
      muted = m;
      apply();
    },
    get muted() {
      return muted;
    },
    stop() {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => void ctx.close().catch(() => undefined), 1200);
    },
  };
}
