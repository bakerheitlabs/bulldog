import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import CharacterModel from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import { pickPedestrianVariantBySeed } from '@/game/world/cityAssets';

const DOWN_MS = 1800;
const FLEE_MS = 8000;
const FLEE_SPEED = 5;

type Phase = 'down' | 'fleeing' | 'done';

export default function EjectedDriver({
  seed,
  startPos,
  onDone,
}: {
  seed: number;
  startPos: [number, number, number];
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('down');
  const groupRef = useRef<THREE.Group>(null);
  const posRef = useRef(new THREE.Vector3(startPos[0], 0, startPos[2]));
  const fleeDir = useMemo(() => {
    const a = (seed * 12.9898) % (Math.PI * 2);
    return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  }, [seed]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('fleeing'), DOWN_MS);
    const t2 = window.setTimeout(() => {
      setPhase('done');
      onDone?.();
    }, DOWN_MS + FLEE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (phase === 'fleeing') {
      posRef.current.addScaledVector(fleeDir, FLEE_SPEED * dt);
      g.position.set(posRef.current.x, 0, posRef.current.z);
      g.rotation.set(0, Math.atan2(fleeDir.x, fleeDir.z), 0);
    } else if (phase === 'down') {
      // The `die` clip lays the character on the ground on its own — don't
      // rotate the group or the poses double up and it goes feet-up.
      g.position.set(posRef.current.x, 0, posRef.current.z);
      g.rotation.set(0, 0, 0);
    }
  });

  if (phase === 'done') return null;

  const variant = pickPedestrianVariantBySeed(seed);
  const action = phase === 'down' ? 'die' : 'sprint';

  const primitiveFallback = (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.8, 4, 8]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#e3b27a" />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      <GltfBoundary fallback={primitiveFallback}>
        <CharacterModel variant={variant} action={action} />
      </GltfBoundary>
    </group>
  );
}
