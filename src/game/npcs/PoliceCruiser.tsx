import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  LANE_WAYPOINTS,
  getIntersection,
  stopBackoff,
  type LaneWaypoint,
} from '@/game/world/cityLayout';
import { mustStopAtLight } from '@/game/world/trafficLightState';
import CarModel from '@/game/vehicles/CarModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import Cop from './Cop';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';

const PATROL_SPEED = 7;
const PURSUIT_SPEED = 11;
const DEPLOY_RANGE = 10;
const PURSUIT_SPAWN_MIN_DIST = 60;
const DEPLOY_ROLL_INTERVAL_S = 2;
const DEPLOY_PROB_ON_FOOT = 0.7;
const DEPLOY_PROB_DRIVING = 0.3;
const DEPLOY_OFFSETS: ReadonlyArray<[number, number]> = [
  [2.2, 0.5],
  [-2.2, 0.5],
];

function pickRandomLaneWp(): LaneWaypoint {
  const ids = Object.keys(LANE_WAYPOINTS);
  return LANE_WAYPOINTS[ids[Math.floor(Math.random() * ids.length)]];
}

function pickFarLaneWp(playerX: number, playerZ: number): LaneWaypoint {
  const ids = Object.keys(LANE_WAYPOINTS);
  const far = ids.filter((id) => {
    const [x, , z] = LANE_WAYPOINTS[id].pos;
    return Math.hypot(x - playerX, z - playerZ) >= PURSUIT_SPAWN_MIN_DIST;
  });
  const pool = far.length ? far : ids;
  return LANE_WAYPOINTS[pool[Math.floor(Math.random() * pool.length)]];
}

function pickRandomNeighbor(currentId: string, prevId: string | null): LaneWaypoint {
  const cur = LANE_WAYPOINTS[currentId];
  const choices = cur.neighbors.filter((n) => n !== prevId);
  const list = choices.length ? choices : cur.neighbors;
  if (list.length === 0) return cur;
  return LANE_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
}

function pickNeighborTowardPlayer(
  currentId: string,
  prevId: string | null,
  playerX: number,
  playerZ: number,
): LaneWaypoint {
  const cur = LANE_WAYPOINTS[currentId];
  const choices = cur.neighbors.filter((n) => n !== prevId);
  const list = choices.length ? choices : cur.neighbors;
  if (list.length === 0) return cur;
  let best = list[0];
  let bestDist = Infinity;
  for (const n of list) {
    const [nx, , nz] = LANE_WAYPOINTS[n].pos;
    const d = Math.hypot(nx - playerX, nz - playerZ);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return LANE_WAYPOINTS[best];
}

function stopLineFor(target: LaneWaypoint): [number, number, number] {
  const [tx, , tz] = target.pos;
  const it = getIntersection(target.col, target.row);
  const back = it ? stopBackoff(it, target.dir) : 0;
  switch (target.dir) {
    case 'N':
      return [tx, 0, tz + back];
    case 'S':
      return [tx, 0, tz - back];
    case 'E':
      return [tx - back, 0, tz];
    case 'W':
      return [tx + back, 0, tz];
  }
}

export default function PoliceCruiser({
  seed,
  mode = 'patrol',
}: {
  seed: number;
  mode?: 'patrol' | 'response';
}) {
  const start = useMemo(() => {
    if (mode === 'response') {
      const [px, , pz] = useGameStore.getState().player.position;
      return pickFarLaneWp(px, pz);
    }
    return pickRandomLaneWp();
  }, [mode]);
  const groupRef = useRef<THREE.Group>(null);
  const [deployed, setDeployed] = useState(false);
  const [deployPos, setDeployPos] = useState<[number, number, number] | null>(null);

  const stateRef = useRef({
    pos: new THREE.Vector3(...start.pos).setY(0.6),
    prevId: null as string | null,
    targetId: start.id,
    target: new THREE.Vector3(...start.pos).setY(0.6),
    rollCd: 0,
    facing: 0,
    initialized: false,
  });

  useFrame((_, dt) => {
    const s = stateRef.current;
    if (deployed) return;

    if (!s.initialized && groupRef.current) {
      groupRef.current.position.copy(s.pos);
      s.initialized = true;
    }

    const heat = useGameStore.getState().wanted.heat;
    const playerHp = useGameStore.getState().player.health;
    const hostile = heat > 0 && playerHp > 0;
    const [px, , pz] = useGameStore.getState().player.position;

    if (hostile) {
      const distToPlayer = Math.hypot(s.pos.x - px, s.pos.z - pz);
      if (distToPlayer <= DEPLOY_RANGE) {
        s.rollCd -= dt;
        if (s.rollCd <= 0) {
          s.rollCd = DEPLOY_ROLL_INTERVAL_S;
          const driving = useVehicleStore.getState().drivenCarId != null;
          const prob = driving ? DEPLOY_PROB_DRIVING : DEPLOY_PROB_ON_FOOT;
          if (Math.random() < prob) {
            setDeployed(true);
            setDeployPos([s.pos.x, 0, s.pos.z]);
            return;
          }
        }
        return;
      }
    }

    const targetWp = LANE_WAYPOINTS[s.targetId];
    if (!targetWp) return;

    // Aim at stop line if a light is red — unless in hostile pursuit.
    let aim: [number, number, number] = [targetWp.pos[0], 0.6, targetWp.pos[2]];
    let holding = false;
    if (!hostile && targetWp.isIntersection) {
      const it = getIntersection(targetWp.col, targetWp.row);
      if (it && mustStopAtLight(targetWp.dir, it.phaseOffset)) {
        const sl = stopLineFor(targetWp);
        aim = [sl[0], 0.6, sl[2]];
        holding = true;
      }
    }
    s.target.set(...aim);

    const dir = s.target.clone().sub(s.pos);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.6) {
      if (holding) {
        if (groupRef.current) groupRef.current.position.copy(s.pos);
        return;
      }
      const next = hostile
        ? pickNeighborTowardPlayer(s.targetId, s.prevId, px, pz)
        : pickRandomNeighbor(s.targetId, s.prevId);
      s.prevId = s.targetId;
      s.targetId = next.id;
      return;
    }
    dir.normalize();
    const speed = hostile ? PURSUIT_SPEED : PATROL_SPEED;
    const step = Math.min(speed * dt, dist);
    s.pos.addScaledVector(dir, step);
    s.facing = Math.atan2(dir.x, dir.z);
    if (groupRef.current) {
      groupRef.current.position.copy(s.pos);
      groupRef.current.rotation.y = s.facing;
    }
  });

  const primitiveFallback = (
    <group>
      <mesh castShadow>
        <boxGeometry args={[1.8, 0.9, 4]} />
        <meshStandardMaterial color="#1f3a8a" />
      </mesh>
      <mesh position={[0, 0.55, -0.2]} castShadow>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.8, 0.12, 0.3]} />
        <meshStandardMaterial color="#b04a3f" emissive="#b04a3f" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );

  return (
    <>
      <group ref={groupRef}>
        <GltfBoundary fallback={primitiveFallback}>
          <CarModel variant="carPolice" />
        </GltfBoundary>
      </group>
      {deployed && deployPos &&
        DEPLOY_OFFSETS.map(([dx, dz], i) => (
          <Cop
            key={`cruiser_${seed}_cop_${i}`}
            seed={seed * 37 + i * 101}
            startPos={[deployPos[0] + dx, 0, deployPos[2] + dz]}
          />
        ))}
    </>
  );
}
