import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { meleeHit } from '@/game/npcs/npcRegistry';

const PUNCH_RANGE = 2.2;
const PUNCH_CONE_DEG = 35;
const PUNCH_DAMAGE = 15;
const PUNCH_COOLDOWN_MS = 450;

export function useMeleeController({ paused }: { paused: boolean }) {
  const camera = useThree((s) => s.camera);
  const lastPunchRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF') return;
      const now = performance.now();
      if (now - lastPunchRef.current < PUNCH_COOLDOWN_MS) return;
      lastPunchRef.current = now;

      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      // punch from torso, not eyes
      origin.y -= 0.6;
      meleeHit(origin, fwd, PUNCH_RANGE, (PUNCH_CONE_DEG * Math.PI) / 180, PUNCH_DAMAGE);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, camera]);
}
