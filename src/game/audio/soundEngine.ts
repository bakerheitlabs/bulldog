import { useSettingsStore } from '@/state/settingsStore';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let unsubVolume: (() => void) | null = null;

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);
  ambientGain = ctx.createGain();
  ambientGain.connect(masterGain);
  applyVolume(useSettingsStore.getState().masterVolume);
  unsubVolume = useSettingsStore.subscribe((s) => applyVolume(s.masterVolume));
  return ctx;
}

function applyVolume(v: number) {
  if (!masterGain || !ctx) return;
  masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export function getSfxNode(): GainNode | null {
  getAudioContext();
  return sfxGain;
}

export function getAmbientNode(): GainNode | null {
  getAudioContext();
  return ambientGain;
}

export function resumeIfSuspended() {
  const c = getAudioContext();
  if (c && c.state === 'suspended') void c.resume();
}

export function disposeAudio() {
  unsubVolume?.();
  unsubVolume = null;
  void ctx?.close();
  ctx = null;
  masterGain = null;
  sfxGain = null;
  ambientGain = null;
}
