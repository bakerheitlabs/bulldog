import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { registerTarget } from './targetRegistry';

const MAX_HP = 60;

export default function TargetDummy({ id, position }: { id: string; position: [number, number, number] }) {
  const destroyed = useGameStore((s) => s.world.destroyedTargets.includes(id));
  const recordHit = useGameStore((s) => s.recordTargetHit);
  const [hp, setHp] = useState(MAX_HP);
  const [flash, setFlash] = useState(0);
  const aliveRef = useRef(!destroyed);

  useEffect(() => {
    if (destroyed) return;
    const pos = new THREE.Vector3(position[0], 0, position[2]);
    const cleanup = registerTarget({
      id,
      position: pos,
      radius: 0.6,
      height: 1.8,
      alive: true,
      takeHit: (damage: number) => {
        setHp((h) => {
          const next = Math.max(0, h - damage);
          if (next <= 0) {
            aliveRef.current = false;
            recordHit(id);
          }
          return next;
        });
        setFlash(1);
      },
    });
    return cleanup;
  }, [id, position, recordHit, destroyed]);

  useEffect(() => {
    if (flash <= 0) return;
    const t = window.setTimeout(() => setFlash(0), 90);
    return () => window.clearTimeout(t);
  }, [flash]);

  if (destroyed || hp <= 0) return null;

  const pct = hp / MAX_HP;
  return (
    <group position={[position[0], 0, position[2]]}>
      {/* base */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.1, 16]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* body */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <capsuleGeometry args={[0.45, 1.0, 4, 8]} />
        <meshStandardMaterial color={flash ? '#ff4444' : '#c08056'} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color={flash ? '#ff4444' : '#a0673f'} />
      </mesh>
      {/* hp bar */}
      <group position={[0, 2.4, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#222" />
        </mesh>
        <mesh position={[-(1 - pct) / 2, 0, 0.001]}>
          <planeGeometry args={[pct, 0.1]} />
          <meshBasicMaterial color={pct > 0.5 ? '#3fa362' : pct > 0.2 ? '#c9a23a' : '#b04a3f'} />
        </mesh>
      </group>
    </group>
  );
}
