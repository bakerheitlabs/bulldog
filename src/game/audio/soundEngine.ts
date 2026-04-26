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

// Update the AudioListener position in world space. Spatial sound sources
// (PannerNode) pan and attenuate relative to this. Caller is expected to
// drive this from the player's world position each frame so a moving
// listener (player walking / driving) tracks correctly.
export function setAudioListenerPosition(x: number, y: number, z: number) {
  const c = getAudioContext();
  if (!c) return;
  const l = c.listener;
  // Modern API uses AudioParams (positionX/Y/Z) so values can ramp; older
  // Safari fell back to the deprecated setPosition(). Prefer the AudioParam
  // path with a short smoothing constant so per-frame updates don't zipper.
  if ((l as unknown as { positionX?: AudioParam }).positionX) {
    const now = c.currentTime;
    (l.positionX as AudioParam).setTargetAtTime(x, now, 0.05);
    (l.positionY as AudioParam).setTargetAtTime(y, now, 0.05);
    (l.positionZ as AudioParam).setTargetAtTime(z, now, 0.05);
  } else if ((l as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition) {
    (l as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
  }
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
