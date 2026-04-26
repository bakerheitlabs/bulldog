import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { playThunder } from '@/game/audio/synth';

// Storm-only ambient flash. Inter-flash gap is randomized 6–22 s so it stays
// surprising but not spammy. Uses a separate ambientLight (additive) rather
// than poking at the day/night ambient so the two systems stay decoupled.
const FLASH_GAP_MIN_S = 6;
const FLASH_GAP_MAX_S = 22;
// Visual flash bounds. Close strikes ramp to ~5 over ~120 ms; distant ones
// to ~1.2 over ~320 ms (more of a soft sky-glow than a sharp strike).
const FLASH_PEAK_CLOSE = 5.2;
const FLASH_PEAK_FAR = 1.1;
const FLASH_DURATION_CLOSE_S = 0.13;
const FLASH_DURATION_FAR_S = 0.34;
// Sound travel between flash and thunder, scaled by distance. Real thunder
// can take ~15 s at 5 km; we compress so the player still associates the
// flash with the boom — but distant claps clearly trail their flash.
const THUNDER_DELAY_CLOSE_MS = 80;
const THUNDER_DELAY_FAR_MS = 4200;

// Each draw picks a weighted distance bucket. Most strikes in a real storm
// are not directly overhead — biasing toward "medium-far" makes the rare
// close strike feel impactful.
function pickDistance(): number {
  const r = Math.random();
  if (r < 0.12) return Math.random() * 0.18;          // 12% close
  if (r < 0.45) return 0.2 + Math.random() * 0.3;     // 33% medium
  return 0.5 + Math.random() * 0.5;                   // 55% far
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function Lightning({ active }: { active: boolean }) {
  const lightRef = useRef<THREE.AmbientLight>(null);
  const nextFlashAt = useRef<number | null>(null);
  const flashStartedAt = useRef(0);
  const flashDuration = useRef(FLASH_DURATION_CLOSE_S);
  const flashPeak = useRef(0);
  const pendingThunder = useRef<Set<number>>(new Set());

  const cancelPendingThunder = () => {
    for (const id of pendingThunder.current) window.clearTimeout(id);
    pendingThunder.current.clear();
  };

  useEffect(() => {
    if (!active) cancelPendingThunder();
    return cancelPendingThunder;
  }, [active]);

  useFrame(({ clock }) => {
    const light = lightRef.current;
    if (!light) return;
    if (!active) {
      light.intensity = 0;
      nextFlashAt.current = null;
      return;
    }
    const t = clock.getElapsedTime();
    if (nextFlashAt.current == null) {
      nextFlashAt.current = t + FLASH_GAP_MIN_S + Math.random() * (FLASH_GAP_MAX_S - FLASH_GAP_MIN_S);
    }
    const flashEnd = flashStartedAt.current + flashDuration.current;
    if (t >= nextFlashAt.current && t >= flashEnd) {
      const distance = pickDistance();
      // Small per-strike intensity wobble layered on top of distance — not
      // every close strike is the same loudness.
      const intensity = 0.75 + Math.random() * 0.5;
      flashStartedAt.current = t;
      flashDuration.current = lerp(FLASH_DURATION_CLOSE_S, FLASH_DURATION_FAR_S, distance);
      flashPeak.current =
        lerp(FLASH_PEAK_CLOSE, FLASH_PEAK_FAR, distance) * Math.min(1, intensity);
      nextFlashAt.current = t + FLASH_GAP_MIN_S + Math.random() * (FLASH_GAP_MAX_S - FLASH_GAP_MIN_S);
      const thunderDelayMs = lerp(THUNDER_DELAY_CLOSE_MS, THUNDER_DELAY_FAR_MS, distance);
      const id = window.setTimeout(() => {
        pendingThunder.current.delete(id);
        playThunder({ distance, intensity });
      }, thunderDelayMs);
      pendingThunder.current.add(id);
    }
    if (t < flashEnd) {
      // Linear ramp from peak → 0 across the flash duration. Reads as a
      // sharp strike for close flashes; a brief sky-glow for distant ones.
      const remaining = flashEnd - t;
      light.intensity = (remaining / flashDuration.current) * flashPeak.current;
    } else {
      light.intensity = 0;
    }
  });

  return <ambientLight ref={lightRef} color="#dde6ff" intensity={0} />;
}
