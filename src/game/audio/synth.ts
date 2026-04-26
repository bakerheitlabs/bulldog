import { getAudioContext, getSfxNode, getAmbientNode, resumeIfSuspended } from './soundEngine';

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function brownNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export function playGunshot(kind: 'handgun' | 'shotgun' | 'smg') {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return;

  const t0 = ctx.currentTime;
  const duration = kind === 'shotgun' ? 0.32 : kind === 'smg' ? 0.1 : 0.18;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, duration);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = kind === 'shotgun' ? 900 : kind === 'smg' ? 2400 : 1800;
  bandpass.Q.value = 0.6;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(kind === 'shotgun' ? 4000 : kind === 'smg' ? 7000 : 6000, t0);
  lowpass.frequency.exponentialRampToValueAtTime(
    kind === 'shotgun' ? 180 : kind === 'smg' ? 500 : 400,
    t0 + duration,
  );

  const noiseGain = ctx.createGain();
  const peak = kind === 'shotgun' ? 0.9 : kind === 'smg' ? 0.5 : 0.65;
  noiseGain.gain.setValueAtTime(0.0001, t0);
  noiseGain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  noise.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(t0);
  noise.stop(t0 + duration);

  const thumpOsc = ctx.createOscillator();
  thumpOsc.type = 'sine';
  thumpOsc.frequency.setValueAtTime(
    kind === 'shotgun' ? 120 : kind === 'smg' ? 220 : 180,
    t0,
  );
  thumpOsc.frequency.exponentialRampToValueAtTime(40, t0 + duration * 0.7);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t0);
  thumpGain.gain.exponentialRampToValueAtTime(
    kind === 'shotgun' ? 0.7 : kind === 'smg' ? 0.3 : 0.45,
    t0 + 0.008,
  );
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.8);
  thumpOsc.connect(thumpGain);
  thumpGain.connect(dest);
  thumpOsc.start(t0);
  thumpOsc.stop(t0 + duration);
}

export function playReload() {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return;

  const now = ctx.currentTime;
  const clickAt = (offset: number, freq: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now + offset);
    g.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(now + offset);
    src.stop(now + offset + 0.05);
  };
  clickAt(0, 2200);
  clickAt(0.12, 1600);
}

export function playFootstep() {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return;

  const t0 = ctx.currentTime;
  const duration = 0.12;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900 + Math.random() * 500;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 180;

  const g = ctx.createGain();
  const peak = 0.12 + Math.random() * 0.05;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + duration);
}

export type AmbientHandle = { stop: () => void };

export function startCityAmbient(): AmbientHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getAmbientNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(dest);

  const bed = ctx.createBufferSource();
  bed.buffer = brownNoiseBuffer(ctx, 4);
  bed.loop = true;
  const bedLp = ctx.createBiquadFilter();
  bedLp.type = 'lowpass';
  bedLp.frequency.value = 420;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.55;
  bed.connect(bedLp);
  bedLp.connect(bedGain);
  bedGain.connect(out);
  bed.start();

  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 58;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.04;
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 220;
  hum.connect(humLp);
  humLp.connect(humGain);
  humGain.connect(out);
  hum.start();

  const hum2 = ctx.createOscillator();
  hum2.type = 'sine';
  hum2.frequency.value = 92;
  const hum2Gain = ctx.createGain();
  hum2Gain.gain.value = 0.025;
  hum2.connect(hum2Gain);
  hum2Gain.connect(out);
  hum2.start();

  let honkTimer: number | null = null;
  const scheduleHonk = () => {
    const delayMs = 6000 + Math.random() * 10000;
    honkTimer = window.setTimeout(() => {
      playDistantHonk(out);
      scheduleHonk();
    }, delayMs);
  };
  scheduleHonk();

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (honkTimer != null) window.clearTimeout(honkTimer);
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.2);
      window.setTimeout(() => {
        try {
          bed.stop();
          hum.stop();
          hum2.stop();
          out.disconnect();
        } catch {
          // nodes may already be stopped
        }
      }, 600);
    },
  };
}

export type RainHandle = {
  // 0..1 ramps the rain bus gain. Used to push rain louder during a storm.
  setIntensity: (level: number) => void;
  stop: () => void;
};

// Procedural rainfall loop. Three layers fed by long noise buffers:
// (1) low brown-noise rumble — the broad "wet street" body,
// (2) bandpass white noise around 2.4 kHz — high-frequency hiss,
// (3) a slow filter-cutoff LFO on a fourth noise source for swells.
// Routed through the ambient bus so it ducks with the master volume slider.
export function startRain(initialIntensity = 0.5): RainHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getAmbientNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  // (1) Low-end rumble.
  const body = ctx.createBufferSource();
  body.buffer = brownNoiseBuffer(ctx, 4);
  body.loop = true;
  const bodyLp = ctx.createBiquadFilter();
  bodyLp.type = 'lowpass';
  bodyLp.frequency.value = 320;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.55;
  body.connect(bodyLp);
  bodyLp.connect(bodyGain);
  bodyGain.connect(out);
  body.start();

  // (2) Hiss.
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuffer(ctx, 4);
  hiss.loop = true;
  const hissBp = ctx.createBiquadFilter();
  hissBp.type = 'bandpass';
  hissBp.frequency.value = 2400;
  hissBp.Q.value = 0.7;
  const hissHp = ctx.createBiquadFilter();
  hissHp.type = 'highpass';
  hissHp.frequency.value = 1200;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.32;
  hiss.connect(hissBp);
  hissBp.connect(hissHp);
  hissHp.connect(hissGain);
  hissGain.connect(out);
  hiss.start();

  // (3) Swells — a slow LFO opens/closes a lowpass on a third noise layer so
  // the texture isn't a static wash. LFO at 0.3 Hz, depth ~600 Hz.
  const swell = ctx.createBufferSource();
  swell.buffer = noiseBuffer(ctx, 4);
  swell.loop = true;
  const swellLp = ctx.createBiquadFilter();
  swellLp.type = 'lowpass';
  swellLp.frequency.value = 1400;
  const swellGain = ctx.createGain();
  swellGain.gain.value = 0.22;
  const swellLfo = ctx.createOscillator();
  swellLfo.type = 'sine';
  swellLfo.frequency.value = 0.3;
  const swellLfoGain = ctx.createGain();
  swellLfoGain.gain.value = 600;
  swellLfo.connect(swellLfoGain);
  swellLfoGain.connect(swellLp.frequency);
  swell.connect(swellLp);
  swellLp.connect(swellGain);
  swellGain.connect(out);
  swell.start();
  swellLfo.start();

  // Soft fade in so the rain doesn't punch in suddenly when toggled.
  const setIntensity = (level: number) => {
    const clamped = Math.max(0, Math.min(1, level));
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0.18 + clamped * 0.32, ctx.currentTime, 0.4);
  };
  setIntensity(initialIntensity);

  let stopped = false;
  return {
    setIntensity,
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.25);
      window.setTimeout(() => {
        try {
          body.stop();
          hiss.stop();
          swell.stop();
          swellLfo.stop();
          out.disconnect();
        } catch {
          // already stopped
        }
      }, 700);
    },
  };
}

// Linear interpolate. Local helper so the thunder synth doesn't reach into
// THREE.MathUtils (which would pull three into the audio module).
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export type ThunderOpts = {
  // 0 = directly overhead (sharp crackle, short rumble),
  // 1 = far horizon (no crackle, long rolling rumble fading off).
  distance?: number;
  // Master loudness multiplier on top of distance attenuation. Useful for
  // making the rare close strike feel disproportionately loud, or muting an
  // off-screen strike further. Defaults to 1.
  intensity?: number;
  // Force a specific character variant. Mostly for debugging — production
  // calls let it auto-pick weighted by distance.
  variant?: ThunderVariant;
};

// Three rough archetypes of real thunder:
//   - 'roll'  : multi-stroke distant rumble, slow swell, lots of echo
//   - 'crack' : sharp cloud-to-ground snap with a short rumble tail
//   - 'boom'  : low-frequency shockwave dominated by sub-bass body
// Variants overlap in parameter space; the labels just bias the distributions
// so back-to-back claps don't sound identical.
export type ThunderVariant = 'roll' | 'crack' | 'boom';

function pickThunderVariant(distance: number): ThunderVariant {
  const r = Math.random();
  if (distance > 0.55) {
    // Far storms are mostly rolling thunder; the occasional booming peal
    // sneaks through, but a crisp crack at this distance is rare (the highs
    // got absorbed before reaching the listener).
    if (r < 0.7) return 'roll';
    if (r < 0.92) return 'boom';
    return 'crack';
  }
  if (distance < 0.25) {
    // Close strikes lean snap-then-boom. A long lazy roll feels weird when
    // the lightning was practically overhead.
    if (r < 0.5) return 'crack';
    if (r < 0.85) return 'boom';
    return 'roll';
  }
  // Mid-range: balanced distribution.
  if (r < 0.45) return 'roll';
  if (r < 0.78) return 'boom';
  return 'crack';
}

// One-shot thunder. Realism comes from three knobs: `distance` warps every
// frequency/timing parameter (HF absorption, travel-time spread); `intensity`
// scales loudness; `variant` reshapes the envelope and ratio of sub-bass to
// crackle. The whole signal also runs through a damped feedback delay so the
// tail bounces between cloud layers — without it, the rumble is too clean
// and reads more like a passing truck than thunder.
export function playThunder(opts: ThunderOpts = {}) {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getAmbientNode();
  if (!ctx || !dest) return;

  const distance = Math.max(0, Math.min(1, opts.distance ?? Math.random()));
  const intensity = Math.max(0, Math.min(1.5, opts.intensity ?? 1));
  const variant = opts.variant ?? pickThunderVariant(distance);

  // Per-variant biases. Each entry says "when this variant fires, push the
  // distance-driven defaults this much in some direction." Kept as plain
  // multipliers so the distance-based math below stays the single source of
  // truth for the absolute values.
  const variantBias = {
    roll:  { duration: 1.25, sub: 0.8,  attack: 1.6, crackle: 0.55, echoWet: 1.35, fb: 1.15 },
    crack: { duration: 0.7,  sub: 0.6,  attack: 0.45, crackle: 1.7,  echoWet: 0.7,  fb: 0.7  },
    boom:  { duration: 1.0,  sub: 1.55, attack: 0.85, crackle: 0.85, echoWet: 1.0,  fb: 1.0  },
  }[variant];

  // Distant claps roll for several seconds; nearby ones snap and decay fast.
  const totalDuration = mix(2.4, 6.8, distance) * variantBias.duration;
  const crackleMix = Math.pow(1 - distance, 1.8) * variantBias.crackle;
  const numCrackles = Math.max(1, Math.round(mix(4.0, 0.6, distance) * variantBias.crackle));
  const rumbleAttackS = mix(0.03, 0.4, distance) * variantBias.attack;
  // Pulled the lowpass band lower across the board so the tail is genuinely
  // chesty rather than the slightly hissy "crowd noise" it used to read as.
  const rumbleLpStart = mix(1100, 380, distance);
  const rumbleLpEnd = mix(55, 28, distance);
  const distanceGain = mix(1.0, 0.36, distance);
  const masterGain = 0.6 * distanceGain * intensity;

  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = masterGain;
  out.connect(dest);

  // ---- Echo bus -----------------------------------------------------------
  // Damped feedback delay simulating the sound bouncing between cloud decks
  // and the ground. Damping LP in the feedback path means each echo is
  // darker than the last, which is the audible signature of "echoey" thunder.
  // Sources route to `bus`, which fans out to a dry tap and an echo tap.
  const bus = ctx.createGain();
  bus.gain.value = 1.0;

  const dry = ctx.createGain();
  dry.gain.value = 1.0;
  bus.connect(dry);
  dry.connect(out);

  const echoDelayTime = mix(0.18, 0.46, distance) + (Math.random() - 0.5) * 0.06;
  const echoFb = mix(0.4, 0.62, distance) * variantBias.fb;
  const echoWet = mix(0.32, 0.62, distance) * variantBias.echoWet;

  const delay = ctx.createDelay(2.5);
  delay.delayTime.value = echoDelayTime;
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.78, echoFb);
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  // Each pass through the feedback loop loses high end. Setting the damping
  // cutoff just above the rumble band keeps echoes audible without letting
  // any HF sneak around the loop and sound like ringing.
  damp.frequency.value = mix(900, 380, distance);
  damp.Q.value = 0.5;
  const wet = ctx.createGain();
  wet.gain.value = echoWet;
  bus.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(out);

  // ---- Sub-bass body ------------------------------------------------------
  // Heavily lowpassed brown noise that gives the strike physical weight.
  // Without this layer the rumble alone feels "thin" — the sub fills out the
  // 30–80 Hz region where real thunder lives. Variant biases scale its peak
  // so 'boom' hits hard and 'crack' barely registers below 100 Hz.
  const subPeak = mix(2.2, 1.1, distance) * variantBias.sub;
  if (subPeak > 0.05) {
    const sub = ctx.createBufferSource();
    sub.buffer = brownNoiseBuffer(ctx, totalDuration);
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.setValueAtTime(mix(150, 80, distance), t0);
    subLp.frequency.exponentialRampToValueAtTime(35, t0 + totalDuration);
    subLp.Q.value = 0.7;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, t0);
    subG.gain.exponentialRampToValueAtTime(subPeak, t0 + rumbleAttackS * 1.4);
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + totalDuration);
    sub.connect(subLp);
    subLp.connect(subG);
    subG.connect(bus);
    sub.start(t0);
    sub.stop(t0 + totalDuration);
  }

  // ---- Mid rumble layers --------------------------------------------------
  // Stack 1–4 brown-noise rumbles with small offsets. Each is a separate
  // stroke or echo. Far/'roll' strikes layer more, spread wider; close
  // 'crack' strikes use one tight layer.
  const rumbleLayerBase = mix(1.2, 3.4, distance);
  const layerJitter = (Math.random() - 0.5) * 0.8;
  const rumbleLayers = Math.max(
    1,
    Math.round(rumbleLayerBase * (variant === 'crack' ? 0.6 : variant === 'roll' ? 1.2 : 1) + layerJitter),
  );
  for (let i = 0; i < rumbleLayers; i++) {
    const layerOffset = i === 0 ? 0 : Math.random() * mix(0.15, 1.6, distance);
    const layerDur = totalDuration - layerOffset;
    if (layerDur < 0.4) continue;
    const layerStart = t0 + layerOffset;
    const rumble = ctx.createBufferSource();
    rumble.buffer = brownNoiseBuffer(ctx, layerDur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const lpJitter = 0.8 + Math.random() * 0.35;
    lp.frequency.setValueAtTime(rumbleLpStart * lpJitter, layerStart);
    lp.frequency.exponentialRampToValueAtTime(
      rumbleLpEnd * lpJitter,
      layerStart + layerDur,
    );
    const g = ctx.createGain();
    const peak = mix(1.65, 0.85, distance) * (i === 0 ? 1 : 0.55 + Math.random() * 0.4);
    g.gain.setValueAtTime(0.0001, layerStart);
    g.gain.exponentialRampToValueAtTime(peak, layerStart + rumbleAttackS);
    const midT = layerStart + rumbleAttackS + (layerDur - rumbleAttackS) * 0.4;
    g.gain.exponentialRampToValueAtTime(peak * mix(0.18, 0.5, distance), midT);
    g.gain.exponentialRampToValueAtTime(0.0001, layerStart + layerDur);
    rumble.connect(lp);
    lp.connect(g);
    g.connect(bus);
    rumble.start(layerStart);
    rumble.stop(layerStart + layerDur);
  }

  // ---- Crackles -----------------------------------------------------------
  // Short bandpassed noise bursts: the HF snap of nearby return strokes.
  // Routed straight to `out` (skipping the echo bus) — a delayed crackle
  // sounds metallic, whereas the rumble it triggers gets the echo for free
  // by reflecting the sub/rumble layers.
  if (crackleMix > 0.01) {
    for (let i = 0; i < numCrackles; i++) {
      const offset = i === 0 ? 0 : 0.06 + Math.random() * 0.35 * (1 - distance * 0.5);
      const dur = 0.08 + Math.random() * 0.18;
      const t = t0 + offset;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = mix(1500, 3800, 1 - distance) + Math.random() * 600;
      bp.Q.value = 0.6 + Math.random() * 0.8;
      const g = ctx.createGain();
      const cracklePeak = mix(0.35, 1.1, 1 - distance) * (i === 0 ? 1 : 0.45 + Math.random() * 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(cracklePeak * crackleMix, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
      src.start(t);
      src.stop(t + dur);
    }
  }

  // Disconnect the entire graph after the tail (including a generous pad for
  // the echo's exponential ringdown) to free nodes back to the GC.
  const ringdownMs = totalDuration * 1000 + (echoDelayTime * 1000) / Math.max(0.01, 1 - fb.gain.value) + 600;
  window.setTimeout(() => {
    try {
      out.disconnect();
      bus.disconnect();
      delay.disconnect();
      damp.disconnect();
      fb.disconnect();
      wet.disconnect();
      dry.disconnect();
    } catch {
      // already gone
    }
  }, Math.min(12000, ringdownMs));
}

export type EngineHandle = {
  setThrottle: (t: number) => void;
  setSpeed: (s: number) => void;
  // Optional 3D position update — only present when the engine was started
  // with spatial routing. Lets callers track a moving sound source so the
  // listener hears it pan + fade with distance.
  setPosition?: (x: number, y: number, z: number) => void;
  stop: () => void;
};

// Per-vehicle tuning for the layered engine synth. Adjust to give different
// car models distinct sonic character without changing the architecture.
export type EngineProfile = {
  bassFreq: number;          // base bass-osc Hz; lower = deeper rumble
  rpmRange: number;          // pitch climb factor (multiplier = 1 + s * rpmRange)
  masterIdle: number;        // out gain at idle
  masterPeak: number;        // additional gain at full throttle
  highGainMax: number;       // intake/whine gain at full throttle
  noiseGainMax: number;      // mechanical-roar gain at full throttle
  filterBaseHz: number;      // master LP cutoff at idle
  filterOpenRange: number;   // additional cutoff Hz at full throttle
  filterQPeak: number;       // additional Q at full throttle (base Q = 1.0)
  lfoBaseHz: number;         // tremolo (firing-pulse) rate at idle
  lfoSpeedRange: number;     // additional tremolo Hz at top speed
  lfoDepth: number;          // tremolo modulation depth
};

export const DEFAULT_ENGINE: EngineProfile = {
  bassFreq: 38,
  rpmRange: 0.9,
  masterIdle: 0.07,
  masterPeak: 0.10,
  highGainMax: 0.22,
  noiseGainMax: 0.18,
  filterBaseHz: 380,
  filterOpenRange: 1300,
  filterQPeak: 1.4,
  lfoBaseHz: 9,
  lfoSpeedRange: 16,
  lfoDepth: 0.22,
};

// Lazily build a tanh soft-clip curve. Reused across all engine instances so
// we're not allocating a 2k-sample Float32Array per car. Tanh gives a smooth
// asymptotic clip — pushing harder into it produces more harmonics rather
// than a hard fold, which is what makes it sound like an overdriven amp /
// real exhaust note instead of a mathematical wave.
let _saturationCurve: Float32Array | null = null;
function saturationCurve(): Float32Array {
  if (_saturationCurve) return _saturationCurve;
  const n = 2048;
  const k = 2.5; // shape factor — higher = more aggressive clipping
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / norm;
  }
  _saturationCurve = curve;
  return _saturationCurve;
}

export function startEngine(profile: EngineProfile = DEFAULT_ENGINE): EngineHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  // Layered model — intentionally avoids buzzy waveforms (saw/square) that
  // make synth engines sound electronic. Tone is built from triangles, then
  // pushed through a soft-clip waveshaper that adds harmonics organically
  // (the way a real exhaust does) and a generous broadband noise body for
  // mechanical character.
  //
  //   bass    — triangle at profile.bassFreq, the soft fundamental
  //   mid     — triangle at 2× bass, body warmth
  //   high    — triangle at 4× bass, intake "whine" that comes in with throttle
  //   noise   — broadband filtered brown noise, the always-on mechanical body
  //   shaper  — tanh soft-clip; drive scales with throttle for "growl"
  //   lfo     — tremolo at firing-rhythm rate; uneven combustion feel
  //   lp      — lowpass that opens with throttle (throttle plate)

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);

  // All triangles. Triangle has soft odd harmonics that fall off faster than
  // saw/square — clean, woody fundamental rather than buzzy. The waveshaper
  // downstream re-adds richness in a non-mathematical way.
  const bass = ctx.createOscillator();
  bass.type = 'triangle';
  bass.frequency.value = profile.bassFreq;
  const mid = ctx.createOscillator();
  mid.type = 'triangle';
  mid.frequency.value = profile.bassFreq * 2;
  const high = ctx.createOscillator();
  high.type = 'triangle';
  high.frequency.value = profile.bassFreq * 4;

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.5;
  const midGain = ctx.createGain();
  midGain.gain.value = 0.32;
  const highGain = ctx.createGain();
  highGain.gain.value = 0.0; // off at idle, comes in with throttle

  // Noise body. Wider band (lower Q) plus a small lowpass shaping so it
  // reads as broadband mechanical wash rather than a narrow tonal hum.
  // Idle gain is non-zero so the engine has audible texture even at rest —
  // the missing ingredient that made the old version sound like pure tone.
  const noise = ctx.createBufferSource();
  noise.buffer = brownNoiseBuffer(ctx, 4);
  noise.loop = true;
  const noiseBp = ctx.createBiquadFilter();
  noiseBp.type = 'bandpass';
  noiseBp.frequency.value = 260;
  noiseBp.Q.value = 0.45;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.18; // audible at idle

  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  bass.connect(bassGain).connect(sum);
  mid.connect(midGain).connect(sum);
  high.connect(highGain).connect(sum);
  noise.connect(noiseBp).connect(noiseGain).connect(sum);

  // Soft-clip stage. `drive` scales the input into the shaper — clean at
  // idle, more harmonic distortion as throttle rises. This is what gives
  // the engine an organic exhaust voice instead of a synth-y tone.
  const drive = ctx.createGain();
  drive.gain.value = 1.0;
  const shaper = ctx.createWaveShaper();
  // Cast: TS infers Float32Array<ArrayBufferLike> from the constructor but
  // the WaveShaper API wants the narrower ArrayBuffer-backed view.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shaper.curve = saturationCurve() as any;
  shaper.oversample = '4x';
  // Compensate for the gain the shaper adds back so total loudness stays
  // close to the un-saturated path.
  const postShaper = ctx.createGain();
  postShaper.gain.value = 0.7;

  sum.connect(drive).connect(shaper).connect(postShaper);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = profile.filterBaseHz;
  lp.Q.value = 1.2;
  postShaper.connect(lp);

  // Tremolo: LFO modulates pulseGain.gain. AudioParam value is summed with
  // any connected source's signal, so pulseGain swings around 1.0 by ±depth.
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 1.0;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = profile.lfoBaseHz;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = profile.lfoDepth;
  lfo.connect(lfoDepth).connect(pulseGain.gain);
  lp.connect(pulseGain).connect(out);

  bass.start();
  mid.start();
  high.start();
  noise.start();
  lfo.start();

  // fade in
  out.gain.setTargetAtTime(profile.masterIdle + 0.01, ctx.currentTime, 0.15);

  let stopped = false;
  return {
    setThrottle: (t: number) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      // Master output swings noticeably with throttle so flooring it
      // actually feels louder, not just brighter.
      out.gain.setTargetAtTime(profile.masterIdle + t * profile.masterPeak, now, 0.07);
      // Intake whine and mechanical roar both fade in with throttle.
      highGain.gain.setTargetAtTime(t * profile.highGainMax, now, 0.06);
      // Idle noise is already audible; throttle stacks more on top.
      noiseGain.gain.setTargetAtTime(0.18 + t * profile.noiseGainMax, now, 0.07);
      // Drive into the soft-clipper grows with throttle — gives the engine
      // a "growl" when floored that's harmonic, not just louder.
      drive.gain.setTargetAtTime(1.0 + t * 1.8, now, 0.08);
      // Throttle plate: filter opens, resonance climbs.
      lp.frequency.setTargetAtTime(profile.filterBaseHz + t * profile.filterOpenRange, now, 0.08);
      lp.Q.setTargetAtTime(1.0 + t * profile.filterQPeak, now, 0.08);
    },
    setSpeed: (s: number) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      // RPM proxy: pitch scales 1× → 1+rpmRange across the speed range so the
      // engine genuinely climbs as you go faster.
      const rpm = 1 + s * profile.rpmRange;
      bass.frequency.setTargetAtTime(profile.bassFreq * rpm, now, 0.1);
      mid.frequency.setTargetAtTime(profile.bassFreq * 2 * rpm, now, 0.1);
      high.frequency.setTargetAtTime(profile.bassFreq * 4 * rpm, now, 0.1);
      // Firing rhythm tracks RPM — the per-cylinder pulse you feel in a
      // real car climbing gears.
      lfo.frequency.setTargetAtTime(profile.lfoBaseHz + s * profile.lfoSpeedRange, now, 0.15);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.12);
      window.setTimeout(() => {
        try {
          bass.stop();
          mid.stop();
          high.stop();
          noise.stop();
          lfo.stop();
          out.disconnect();
        } catch {
          // already stopped
        }
      }, 350);
    },
  };
}

// Turbofan / jet engine. Same EngineHandle shape as the car so callers can
// swap drivers without restructuring, but the layered model is different.
//
// Real jets are dominated by *broadband noise* (exhaust shear, bypass air,
// combustion roar) with a piercing tonal *turbine whine* sitting on top
// whose pitch sweeps with N1 fan speed. There is NO sawtooth bass drone —
// that reads as a piston engine. The iconic "jet spooling up" sound is the
// whine pitch climbing from a few hundred Hz to a couple kHz as the fan
// spins up.
//
// Layers (all routed into a master lowpass that opens with airspeed):
//   sub      — low brown-noise rumble, always-on body of the engine
//   roar     — bandpassed brown noise around the combustion frequencies
//              (~400 Hz), throttle-emphasized — the "fire in the can"
//   bypass   — high-bandpass white noise (~4 kHz), throttle-driven —
//              bypass-fan exhaust shear
//   whine    — sawtooth at the N1 fundamental, sweeps from ~350 → ~2000 Hz
//              with throttle. THIS is what makes it sound like a jet.
//   buzzsaw  — second sawtooth at ~1.5× whine, slightly detuned, gives the
//              chorused turbine character of a multi-stage compressor.
export function startAirplaneEngine(opts?: { spatial?: boolean }): EngineHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  // Optional 3D positional routing: insert a PannerNode between the engine
  // graph and the SFX bus so the engine fades + pans by world position.
  // Tuned for an airliner overhead — refDistance is loose so the engine is
  // still audible when the plane is a few hundred metres away, with an
  // inverse rolloff that drops naturally past that.
  let panner: PannerNode | null = null;
  if (opts?.spatial) {
    panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 90;
    panner.maxDistance = 2000;
    panner.rolloffFactor = 1.2;
    out.connect(panner);
    panner.connect(dest);
  } else {
    out.connect(dest);
  }

  // Master lowpass — opens up with speed so the jet brightens at cruise.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  lp.Q.value = 0.5;
  lp.connect(out);

  const sum = ctx.createGain();
  sum.gain.value = 0.6;
  sum.connect(lp);

  // (1) Sub rumble — low-passed brown noise. Always on, gives the engine mass.
  const sub = ctx.createBufferSource();
  sub.buffer = brownNoiseBuffer(ctx, 6);
  sub.loop = true;
  const subLp = ctx.createBiquadFilter();
  subLp.type = 'lowpass';
  subLp.frequency.value = 140;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.7;
  sub.connect(subLp).connect(subGain).connect(sum);

  // (2) Combustion roar — bandpassed brown noise around 400 Hz. Idle-on but
  // gets noticeably louder with throttle (more fuel = more roar).
  const roar = ctx.createBufferSource();
  roar.buffer = brownNoiseBuffer(ctx, 6);
  roar.loop = true;
  const roarBp = ctx.createBiquadFilter();
  roarBp.type = 'bandpass';
  roarBp.frequency.value = 420;
  roarBp.Q.value = 0.8;
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0.45; // idle level
  roar.connect(roarBp).connect(roarGain).connect(sum);

  // (3) Bypass / exhaust hiss — high-bandpassed white noise. Throttle-driven.
  const bypass = ctx.createBufferSource();
  bypass.buffer = noiseBuffer(ctx, 6);
  bypass.loop = true;
  const bypassHp = ctx.createBiquadFilter();
  bypassHp.type = 'highpass';
  bypassHp.frequency.value = 2200;
  const bypassBp = ctx.createBiquadFilter();
  bypassBp.type = 'bandpass';
  bypassBp.frequency.value = 4200;
  bypassBp.Q.value = 0.7;
  const bypassGain = ctx.createGain();
  bypassGain.gain.value = 0.05; // faintly audible at idle, ramps with throttle
  bypass.connect(bypassHp).connect(bypassBp).connect(bypassGain).connect(sum);

  // (4) Turbine whine — the iconic tonal layer. Sawtooth, narrow bandpass to
  // get a "singing" quality rather than a buzz. Pitch is set by setThrottle:
  // we slew the oscillator frequency from idle (~350 Hz) to peak (~2000 Hz)
  // so the player hears a clear spool-up when they push W.
  const whineIdleHz = 350;
  const whinePeakHz = 2000;
  const whine = ctx.createOscillator();
  whine.type = 'sawtooth';
  whine.frequency.value = whineIdleHz;
  const whineBp = ctx.createBiquadFilter();
  whineBp.type = 'bandpass';
  whineBp.frequency.value = whineIdleHz;
  whineBp.Q.value = 6;
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.04; // audible-but-quiet whistle at idle
  whine.connect(whineBp).connect(whineGain).connect(sum);

  // (5) Buzzsaw harmonic — second sawtooth at 1.5× the whine, slightly
  // detuned. Two compressor stages don't perfectly track each other; this is
  // what makes it sound like a real multi-stage turbofan rather than a
  // single sine.
  const buzzRatio = 1.51; // intentionally not 1.5 exactly
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = whineIdleHz * buzzRatio;
  const buzzBp = ctx.createBiquadFilter();
  buzzBp.type = 'bandpass';
  buzzBp.frequency.value = whineIdleHz * buzzRatio;
  buzzBp.Q.value = 5;
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.025;
  buzz.connect(buzzBp).connect(buzzGain).connect(sum);

  sub.start();
  roar.start();
  bypass.start();
  whine.start();
  buzz.start();

  // Fade in to idle so the engine doesn't punch in.
  const idleLevel = 0.10;
  const peakBoost = 0.18;
  out.gain.setTargetAtTime(idleLevel, ctx.currentTime, 0.3);

  // Track current throttle so setSpeed can apply a small extra pitch nudge
  // on top of the throttle-driven sweep without fighting it.
  let curThrottle = 0;
  let curSpeed = 0;
  const applyWhinePitch = () => {
    if (!ctx) return;
    // Throttle does most of the work (the spool-up). Speed adds a small
    // additional climb so cruise vs. spool-at-idle still sound different.
    const t = curThrottle;
    const s = curSpeed;
    const hz = whineIdleHz + (whinePeakHz - whineIdleHz) * t * (1 + s * 0.18);
    const now = ctx.currentTime;
    // Slew slowly enough that you hear the sweep, not a step.
    whine.frequency.setTargetAtTime(hz, now, 0.35);
    whineBp.frequency.setTargetAtTime(hz, now, 0.35);
    buzz.frequency.setTargetAtTime(hz * buzzRatio, now, 0.35);
    buzzBp.frequency.setTargetAtTime(hz * buzzRatio, now, 0.35);
  };

  let stopped = false;
  return {
    setThrottle: (t: number) => {
      if (stopped || !ctx) return;
      curThrottle = t;
      const now = ctx.currentTime;
      // Master swells with throttle so full power is genuinely louder.
      out.gain.setTargetAtTime(idleLevel + t * peakBoost, now, 0.3);
      // Combustion roar gets stronger.
      roarGain.gain.setTargetAtTime(0.45 + t * 0.55, now, 0.3);
      // Bypass shear is the main "whoosh" you hear from the wing — climbs
      // hard with throttle so the acceleration is audible.
      bypassGain.gain.setTargetAtTime(0.05 + t * 0.5, now, 0.3);
      // Whine + buzzsaw level grow with throttle on top of the pitch sweep.
      whineGain.gain.setTargetAtTime(0.04 + t * 0.10, now, 0.3);
      buzzGain.gain.setTargetAtTime(0.025 + t * 0.06, now, 0.3);
      applyWhinePitch();
    },
    setSpeed: (s: number) => {
      if (stopped || !ctx) return;
      curSpeed = s;
      const now = ctx.currentTime;
      // Lowpass opens with airspeed so the jet brightens at cruise.
      lp.frequency.setTargetAtTime(2800 + s * 3500, now, 0.4);
      applyWhinePitch();
    },
    setPosition: panner
      ? (x: number, y: number, z: number) => {
          if (stopped || !ctx) return;
          const now = ctx.currentTime;
          // Smooth ramp so per-frame position updates don't zipper-noise.
          panner!.positionX.setTargetAtTime(x, now, 0.08);
          panner!.positionY.setTargetAtTime(y, now, 0.08);
          panner!.positionZ.setTargetAtTime(z, now, 0.08);
        }
      : undefined,
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.2);
      window.setTimeout(() => {
        try {
          sub.stop();
          roar.stop();
          bypass.stop();
          whine.stop();
          buzz.stop();
          out.disconnect();
          panner?.disconnect();
        } catch {
          // already stopped
        }
      }, 600);
    },
  };
}

export type CockpitWarningHandle = { stop: () => void };

// Continuous cockpit alarm warble. Square-wave carrier whose frequency
// alternates between two pitches every ~140 ms, with no silence between —
// the iconic "EEE-AHH-EEE-AHH" emergency siren you'd hear in a cockpit
// master-warning condition. Routed through a lowpass to take the harshness
// off the square's high harmonics, and a bandpass to give it the cutting
// midrange of a real alarm horn.
//
// Implementation mirrors startSiren: rather than fire a setInterval that
// does setValueAtTime (which would drift relative to the audio clock), we
// schedule a few seconds of frequency switches ahead on the AudioParam and
// top up the schedule on a JS interval.
export function startCockpitWarning(): CockpitWarningHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);

  // Square through a bandpass + lowpass: the bandpass picks out the urgent
  // midrange; the lowpass tames the very-high partials so it cuts without
  // being painful.
  const osc = ctx.createOscillator();
  osc.type = 'square';
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 1.4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  lp.Q.value = 0.7;
  osc.connect(bp).connect(lp).connect(out);

  // Two alternating tones — a perfect-fourth apart for that classic
  // "siren" interval. setValueAtTime steps the frequency cleanly between
  // them with no glide, which is what makes the warble read as an alarm
  // instead of a sweep.
  const FREQ_HI = 1100;
  const FREQ_LO = 825;
  const HALF_PERIOD = 0.14; // seconds per tone — ~3.5 Hz alternation

  const t0 = ctx.currentTime;
  let scheduledTo = t0;
  let nextHigh = true;
  const lookahead = 4;

  const scheduleSteps = () => {
    const target = ctx.currentTime + lookahead;
    while (scheduledTo < target) {
      osc.frequency.setValueAtTime(nextHigh ? FREQ_HI : FREQ_LO, scheduledTo);
      nextHigh = !nextHigh;
      scheduledTo += HALF_PERIOD;
    }
  };
  osc.frequency.setValueAtTime(FREQ_HI, t0);
  scheduleSteps();
  const interval = window.setInterval(scheduleSteps, 1500);

  osc.start(t0);
  out.gain.setTargetAtTime(0.22, t0, 0.03);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(interval);
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.04);
      window.setTimeout(() => {
        try {
          osc.stop();
          out.disconnect();
        } catch { /* already gone */ }
      }, 200);
    },
  };
}

export function playHorn() {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return;

  const t0 = ctx.currentTime;
  const dur = 0.45;
  const fundamental = 330;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.32, t0 + 0.02);
  out.gain.setValueAtTime(0.32, t0 + dur - 0.08);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  lp.Q.value = 0.8;
  lp.connect(out);

  // Two-tone car horn: a square fundamental plus a perfect-fifth above.
  const oscs: OscillatorNode[] = [];
  for (const ratio of [1, 1.5]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = fundamental * ratio;
    const g = ctx.createGain();
    g.gain.value = ratio === 1 ? 0.45 : 0.3;
    osc.connect(g).connect(lp);
    osc.start(t0);
    osc.stop(t0 + dur);
    oscs.push(osc);
  }
}

export type SirenHandle = { stop: () => void };

// Police "yelp" siren: a sine sweeps up 800→1600 Hz over ~0.4 s, then fast
// drops back, looped. The rapid alternation is what makes it read as a
// siren rather than a foghorn.
export function startSiren(): SirenHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);

  const carrier = ctx.createOscillator();
  carrier.type = 'sawtooth';
  carrier.frequency.value = 800;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 1.5;

  const tone = ctx.createGain();
  tone.gain.value = 0.32;

  carrier.connect(bp).connect(tone).connect(out);

  // Schedule a yelp sweep cycle on `freq`, repeating every cycleSec.
  const t0 = ctx.currentTime;
  const cycleSec = 0.55;
  const lookahead = 4; // schedule this far ahead
  let scheduledTo = t0;

  const scheduleCycles = () => {
    const target = ctx.currentTime + lookahead;
    while (scheduledTo < target) {
      const a = scheduledTo;
      const b = a + cycleSec * 0.7;
      const c = a + cycleSec;
      carrier.frequency.setValueAtTime(800, a);
      carrier.frequency.exponentialRampToValueAtTime(1650, b);
      carrier.frequency.exponentialRampToValueAtTime(800, c);
      scheduledTo = c;
    }
  };
  scheduleCycles();
  const interval = window.setInterval(scheduleCycles, 1500);

  carrier.start(t0);
  out.gain.setTargetAtTime(0.6, t0, 0.05);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(interval);
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.06);
      window.setTimeout(() => {
        try {
          carrier.stop();
          out.disconnect();
        } catch {
          // already stopped
        }
      }, 250);
    },
  };
}

function playDistantHonk(dest: AudioNode) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = 0.35 + Math.random() * 0.3;
  const freq = 300 + Math.random() * 200;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = freq * 1.5;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 800;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.04);
  g.gain.setValueAtTime(0.15, t0 + dur - 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(lp);
  osc2.connect(lp);
  lp.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc2.start(t0);
  osc.stop(t0 + dur);
  osc2.stop(t0 + dur);
}
