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

export function startEngine(): EngineHandle | null {
  resumeIfSuspended();
  const ctx = getAudioContext();
  const dest = getSfxNode();
  if (!ctx || !dest) return null;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 55;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = 82;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 450;
  lp.Q.value = 0.7;

  const mix = ctx.createGain();
  mix.gain.value = 0.25;

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(mix);
  mix.connect(out);
  osc1.start();
  osc2.start();

  // fade in
  out.gain.setTargetAtTime(0.18, ctx.currentTime, 0.15);

  let stopped = false;
  return {
    setThrottle: (t: number) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      const target = 0.14 + t * 0.28;
      out.gain.setTargetAtTime(target, now, 0.08);
    },
    setSpeed: (s: number) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      const base1 = 55 + s * 14;
      const base2 = 82 + s * 20;
      osc1.frequency.setTargetAtTime(base1, now, 0.1);
      osc2.frequency.setTargetAtTime(base2, now, 0.1);
      lp.frequency.setTargetAtTime(450 + s * 200, now, 0.12);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, 0.12);
      window.setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          out.disconnect();
        } catch {
          // already stopped
        }
      }, 350);
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
