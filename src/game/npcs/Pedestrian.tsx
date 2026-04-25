import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PED_WAYPOINTS, type Waypoint } from '@/game/world/cityLayout';
import { pickPedestrianVariantBySeed } from '@/game/world/cityAssets';
import { registerNpc } from './npcRegistry';
import CharacterModel from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import BloodPool from './BloodPool';
import { useGameStore } from '@/state/gameStore';

const SPEED = 1.3;
const MAX_HP = 60;

const COLORS = ['#c66', '#6c6', '#66c', '#cc6', '#c6c', '#6cc', '#aaa', '#e9b'];

function randomWaypointId(): string {
  const ids = Object.keys(PED_WAYPOINTS);
  return ids[Math.floor(Math.random() * ids.length)];
}

export default function Pedestrian({ seed }: { seed: number }) {
  const id = useMemo(() => `ped_${seed}_${Math.random().toString(36).slice(2, 7)}`, [seed]);
  const startId = useMemo(() => randomWaypointId(), []);
  const start = PED_WAYPOINTS[startId];
  const groupRef = useRef<THREE.Group>(null);
  const [hp, setHp] = useState(MAX_HP);
  const [flash, setFlash] = useState(0);
  const dead = hp <= 0;
  const stateRef = useRef<{
    pos: THREE.Vector3;
    targetId: string;
    target: THREE.Vector3;
    color: string;
  }>({
    pos: new THREE.Vector3(...start.pos),
    targetId: startId,
    target: new THREE.Vector3(...start.pos),
    color: COLORS[seed % COLORS.length],
  });

  function pickNext(currentId: string, prevId: string | null): Waypoint {
    const cur = PED_WAYPOINTS[currentId];
    const choices = cur.neighbors.filter((n) => n !== prevId);
    const list = choices.length ? choices : cur.neighbors;
    return PED_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
  }

  useEffect(() => {
    const cleanup = registerNpc({
      id,
      getPosition: () => stateRef.current.pos,
      radius: 0.55,
      height: 1.8,
      alive: !dead,
      takeHit: (damage: number) => {
        setHp((h) => {
          const next = Math.max(0, h - damage);
          if (h > 0 && next === 0) useGameStore.getState().bumpHeat(22);
          return next;
        });
        setFlash(1);
      },
    });
    return cleanup;
  }, [id, dead]);

  useEffect(() => {
    if (flash <= 0) return;
    const t = window.setTimeout(() => setFlash(0), 90);
    return () => window.clearTimeout(t);
  }, [flash]);

  useFrame((_, dt) => {
    if (dead) return;
    const s = stateRef.current;
    const dir = s.target.clone().sub(s.pos);
    const dist = dir.length();
    if (dist < 0.2) {
      const next = pickNext(s.targetId, null);
      s.targetId = next.id;
      s.target.set(...next.pos);
    } else {
      dir.normalize();
      const step = Math.min(SPEED * dt, dist);
      s.pos.addScaledVector(dir, step);
      if (groupRef.current) {
        groupRef.current.position.set(s.pos.x, 0, s.pos.z);
        groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }
  });

  const variant = useMemo(() => pickPedestrianVariantBySeed(seed), [seed]);
  const bodyColor = flash ? '#ff4444' : stateRef.current.color;
  const headColor = flash ? '#ff4444' : '#e3b27a';
  const action = dead ? 'die' : 'walk';

  const primitiveFallback = (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.8, 4, 8]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color={headColor} />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      <GltfBoundary fallback={primitiveFallback}>
        <CharacterModel variant={variant} action={action} />
      </GltfBoundary>
      {dead && <BloodPool />}
      {!dead && hp < MAX_HP && (
        <group position={[0, 2.0, 0]}>
          <mesh>
            <planeGeometry args={[0.8, 0.08]} />
            <meshBasicMaterial color="#222" />
          </mesh>
          <mesh position={[-(0.8 * (1 - hp / MAX_HP)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.8 * (hp / MAX_HP), 0.08]} />
            <meshBasicMaterial color={hp > MAX_HP / 2 ? '#3fa362' : '#b04a3f'} />
          </mesh>
        </group>
      )}
    </group>
  );
}
