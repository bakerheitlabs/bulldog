import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { playThunder } from '@/game/audio/synth';

// Storm-only ambient flash. We render an extra cool-white ambientLight whose
// intensity ramps from peak to zero across ~150 ms. Inter-flash gap is
// randomized 6–22 s so it stays surprising but not spammy. Uses a separate
// light (additive) rather than poking at the day/night ambient so the two
// systems stay decoupled.
const FLASH_DURATION_S = 0.16;
const FLASH_PEAK_INTENSITY = 4.5;
const FLASH_GAP_MIN_S = 6;
const FLASH_GAP_MAX_S = 22;

export default function Lightning({ active }: { active: boolean }) {
  const lightRef = useRef<THREE.AmbientLight>(null);
  const nextFlashAt = useRef<number | null>(null);
  const flashEndsAt = useRef(0);
  const pendingThunder = useRef<Set<number>>(new Set());

  // Cancel any in-flight thunder timers when the storm ends or the
  // component unmounts — otherwise a thunder clap can fire a few hundred
  // ms after the player switches the weather to sunny.
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
    if (t >= nextFlashAt.current && t >= flashEndsAt.current) {
      flashEndsAt.current = t + FLASH_DURATION_S;
      nextFlashAt.current = t + FLASH_GAP_MIN_S + Math.random() * (FLASH_GAP_MAX_S - FLASH_GAP_MIN_S);
      // Schedule the thunder slightly after the visual flash. Real thunder
      // trails lightning by sound's travel time; a 250–700 ms delay reads
      // as "close to medium-distant" without feeling sluggish.
      const thunderDelayMs = 250 + Math.random() * 450;
      const id = window.setTimeout(() => {
        pendingThunder.current.delete(id);
        playThunder();
      }, thunderDelayMs);
      pendingThunder.current.add(id);
    }
    if (t < flashEndsAt.current) {
      // Linear ramp from peak → 0 across the flash duration. Easy to read,
      // and visually reads as a sharp strike without a custom curve.
      const remaining = flashEndsAt.current - t;
      light.intensity = (remaining / FLASH_DURATION_S) * FLASH_PEAK_INTENSITY;
    } else {
      light.intensity = 0;
    }
  });

  return <ambientLight ref={lightRef} color="#dde6ff" intensity={0} />;
}
