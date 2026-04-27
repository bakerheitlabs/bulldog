import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Waypoint } from '@/game/world/cityLayout';
import { PED_WAYPOINTS } from '@/game/world/worldWaypoints';
import {
  PEDESTRIAN_VARIANTS,
  pickPedestrianVariantBySeed,
} from '@/game/world/cityAssets';
import { registerNpc, type NpcAction } from './npcRegistry';
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

export default function Pedestrian({
  seed,
  startId: startIdProp,
}: {
  seed: number;
  // Optional explicit spawn waypoint. When omitted (most peds), defaults to a
  // random waypoint from PED_WAYPOINTS — fine for the 1000s of city ped WPs
  // but gives ~0 island 2 coverage, so the spawner overrides with island IDs.
  startId?: string;
}) {
  // Stable id (no random suffix) so multiplayer snapshots can address the
  // same pedestrian across hosts/clients. The `seed` is unique per spawned
  // instance (assigned by Spawner).
  const id = useMemo(() => `ped_${seed}`, [seed]);
  const startId = useMemo(() => startIdProp ?? randomWaypointId(), [startIdProp]);
  const start = PED_WAYPOINTS[startId];
  const groupRef = useRef<THREE.Group>(null);
  const yawRef = useRef(0);
  const hpRef = useRef(MAX_HP);
  const actionRef = useRef<NpcAction>('idle');
  const [hp, setHp] = useState(MAX_HP);
  const [flash, setFlash] = useState(0);
  const dead = hp <= 0;
  const variantIdx = useMemo(
    () => Math.abs(Math.floor(seed)) % PEDESTRIAN_VARIANTS.length,
    [seed],
  );
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
      kind: 'ped',
      variantIdx,
      getPosition: () => stateRef.current.pos,
      getYaw: () => yawRef.current,
      getHp: () => hpRef.current,
      getAction: () => actionRef.current,
      radius: 0.55,
      height: 1.8,
      alive: !dead,
      takeHit: (damage: number) => {
        setHp((h) => {
          const next = Math.max(0, h - damage);
          hpRef.current = next;
          if (h > 0 && next === 0) useGameStore.getState().bumpHeat(22);
          return next;
        });
        setFlash(1);
      },
    });
    return cleanup;
  }, [id, dead, variantIdx]);

  useEffect(() => {
    if (flash <= 0) return;
    const t = window.setTimeout(() => setFlash(0), 90);
    return () => window.clearTimeout(t);
  }, [flash]);

  useFrame((_, dt) => {
    if (dead) {
      actionRef.current = 'die';
      return;
    }
    const s = stateRef.current;
    const dir = s.target.clone().sub(s.pos);
    const dist = dir.length();
    if (dist < 0.2) {
      const next = pickNext(s.targetId, null);
      s.targetId = next.id;
      s.target.set(...next.pos);
      actionRef.current = 'idle';
    } else {
      dir.normalize();
      const step = Math.min(SPEED * dt, dist);
      s.pos.addScaledVector(dir, step);
      const yaw = Math.atan2(dir.x, dir.z);
      yawRef.current = yaw;
      actionRef.current = 'walk';
      if (groupRef.current) {
        groupRef.current.position.set(s.pos.x, 0, s.pos.z);
        groupRef.current.rotation.y = yaw;
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
