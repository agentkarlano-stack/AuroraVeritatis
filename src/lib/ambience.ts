/**
 * Operations-room ambience for the Operations Briefing, generated in the browser (no recorded assets, so no licence
 * questions): steady ventilation (pink noise, band-limited, without the slow swells that read as wind), a faint mains
 * hum with harmonics, rare quiet equipment ticks, and a soft push-to-talk cue (short squelch and two tones) at story
 * handovers. Ducked while a presenter speaks; voices stay in front. Nothing here imitates intercepted speech, alarms or
 * weapons. Created only from the user's click (browsers require it) and never in Comfort Mode or Idle Mode.
 */
export interface Ambience {
  /** Lower the bed while someone speaks; raise it gently in gaps. */
  duck(speaking: boolean): void;
  /** Short, quiet comms cue for a handover between stories. */
  cue(): void;
  /** Soft console confirmation when a new location is acquired. */
  ack(): void;
  pause(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  stop(): void;
}

const BED = 0.06;
const BED_DUCKED = 0.028;

/** Pink noise (Paul Kellet's filter): even energy per octave, the texture of air moving through vents. */
function pinkNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  // Crossfade the loop seam so the bed never clicks.
  const fade = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    d[i] = d[i]! * t + d[len - fade + i]! * (1 - t);
  }
  return buf;
}

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
  let stopped = false;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Ventilation: steady band-limited pink noise (no low rumble, no slow swells).
  const air = ctx.createBufferSource();
  air.buffer = pinkNoise(ctx, 4);
  air.loop = true;
  air.loopEnd = 4 - 0.25;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 180;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2_400;
  const airGain = ctx.createGain();
  air.connect(hp).connect(lp).connect(airGain).connect(master);

  // Equipment hum: 50 Hz with two quiet harmonics (a room full of electronics).
  const hum = ctx.createGain();
  hum.gain.value = 0.18;
  hum.connect(master);
  const oscs = [
    [50, 0.6],
    [100, 0.3],
    [150, 0.12],
  ].map(([f, g]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f!;
    const og = ctx.createGain();
    og.gain.value = g!;
    o.connect(og).connect(hum);
    o.start();
    return o;
  });

  air.start();
  master.gain.setTargetAtTime(BED, ctx.currentTime, 0.6);

  // Recorded sound design (ElevenLabs Sound Effects, generated once, public/media/sfx/): when the files load, the
  // operations-room bed and radio hiss replace the generated ventilation, and cues use the recorded clicks.
  const samples = new Map<string, AudioBuffer>();
  const load = (name: string) =>
    fetch(`/media/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((b) => void samples.set(name, b))
      .catch(() => undefined);
  void Promise.all(['ops-room', 'radio-hiss', 'ptt-open', 'ptt-close', 'console-ack'].map(load)).then(() => {
    const room = samples.get('ops-room');
    if (!room || stopped) return;
    const loop = (b: AudioBuffer, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
      src.connect(g).connect(master);
      src.start();
      return src;
    };
    // Mix (measured files): room -35 dB RMS -> about -42 dB; hiss -18 dB RMS -> about -46 dB; both ducked under speech.
    loop(room, 0.45 / BED);
    const hiss = samples.get('radio-hiss');
    if (hiss) loop(hiss, 0.04 / BED);
    // The generated ventilation and hum fade out once the recorded room is playing.
    airGain.gain.setTargetAtTime(0, ctx.currentTime, 1.5);
    hum.gain.setTargetAtTime(0, ctx.currentTime, 1.5);
  });
  const play = (name: string, level: number, delay = 0) => {
    const b = samples.get(name);
    if (!b || muted) return false;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + delay);
    return true;
  };

  let muted = false;
  let level = BED;
  const apply = () => master.gain.setTargetAtTime(muted ? 0 : level, ctx.currentTime, 0.25);

  /** A short filtered noise burst at time t (squelch or equipment tick). */
  const burst = (t: number, ms: number, freq: number, q: number, peak: number) => {
    const src = ctx.createBufferSource();
    src.buffer = air.buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t, Math.random() * 3);
    src.stop(t + ms / 1000 + 0.05);
  };

  // Rare, quiet equipment ticks (a relay, a keyboard) at irregular intervals of 9-24 s.
  let tickTimer = 0;
  const scheduleTick = () => {
    tickTimer = window.setTimeout(
      () => {
        if (stopped) return;
        if (!muted && ctx.state === 'running') burst(ctx.currentTime + 0.01, 35, 3_200 + Math.random() * 1_500, 6, 0.012);
        scheduleTick();
      },
      9_000 + Math.random() * 15_000,
    );
  };
  scheduleTick();

  return {
    duck(speaking) {
      level = speaking ? BED_DUCKED : BED;
      apply();
    },
    ack() {
      play('console-ack', 0.22);
    },
    cue() {
      if (muted) return;
      if (play('ptt-open', 0.35)) return;
      const t = ctx.currentTime + 0.02;
      // Push-to-talk: a short soft squelch, then two quiet tones.
      burst(t, 110, 1_800, 1.2, 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      g.connect(ctx.destination);
      for (const [f, at] of [
        [1_250, 0.12],
        [1_650, 0.2],
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
      stopped = true;
      window.clearTimeout(tickTimer);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => {
        oscs.forEach((o) => o.stop());
        void ctx.close().catch(() => undefined);
      }, 1200);
    },
  };
}
