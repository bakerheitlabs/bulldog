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

export type EngineHandle = {
  setThrottle: (t: number) => void;
  setSpeed: (s: number) => void;
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
  bassFreq: 50,
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

export function startEngine(profile: EngineProfile = DEFAULT_ENGINE): EngineHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  // Layered model:
  //   bass   — sawtooth at profile.bassFreq, the deep block-rumble
  //   mid    — square at 2× bass, gives the engine its body
  //   high   — sawtooth at 4× bass, intake/whine that comes in under throttle
  //   noise  — band-passed brown noise, mechanical roar that scales with throttle
  //   lfo    — tremolo on the master gain at firing-rhythm rate, scales with RPM
  //   lp     — resonant low-pass that opens up under throttle (throttle plate)

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);

  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.value = profile.bassFreq;
  const mid = ctx.createOscillator();
  mid.type = 'square';
  mid.frequency.value = profile.bassFreq * 2;
  const high = ctx.createOscillator();
  high.type = 'sawtooth';
  high.frequency.value = profile.bassFreq * 4;

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.45;
  const midGain = ctx.createGain();
  midGain.gain.value = 0.28;
  const highGain = ctx.createGain();
  highGain.gain.value = 0.0; // off at idle, comes in with throttle

  const noise = ctx.createBufferSource();
  noise.buffer = brownNoiseBuffer(ctx, 4);
  noise.loop = true;
  const noiseBp = ctx.createBiquadFilter();
  noiseBp.type = 'bandpass';
  noiseBp.frequency.value = 220;
  noiseBp.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.0;

  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  bass.connect(bassGain).connect(sum);
  mid.connect(midGain).connect(sum);
  high.connect(highGain).connect(sum);
  noise.connect(noiseBp).connect(noiseGain).connect(sum);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = profile.filterBaseHz;
  lp.Q.value = 1.2;
  sum.connect(lp);

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
      noiseGain.gain.setTargetAtTime(t * profile.noiseGainMax, now, 0.07);
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
