import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  BLOCK_SIZE,
  LANE_WAYPOINTS,
  getIntersection,
  type LaneWaypoint,
} from '@/game/world/cityLayout';
import { mustStopAtLight } from '@/game/world/trafficLightState';
import { pickCarVariantBySeed } from '@/game/world/cityAssets';
import CarModel from '@/game/vehicles/CarModel';
import GltfBoundary from '@/game/world/GltfBoundary';

const SPEED = 7;
const STOP_BACKOFF = BLOCK_SIZE / 2 + 1;

const COLORS = ['#b04a3f', '#3f6cb0', '#3fa362', '#c9a23a', '#7a4ab0', '#444c5e', '#d9d2c3'];

function randomLaneWpId(): string {
  const ids = Object.keys(LANE_WAYPOINTS);
  return ids[Math.floor(Math.random() * ids.length)];
}

function pickNextLane(currentId: string, prevId: string | null): LaneWaypoint {
  const cur = LANE_WAYPOINTS[currentId];
  const choices = cur.neighbors.filter((n) => n !== prevId);
  const list = choices.length ? choices : cur.neighbors;
  if (list.length === 0) return cur;
  return LANE_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
}

// Stop line = target node pushed back by half a block along the reverse of
// the lane's flow direction. Keeps the car clear of the intersection itself.
function stopLineFor(target: LaneWaypoint): [number, number, number] {
  const [tx, , tz] = target.pos;
  switch (target.dir) {
    case 'N':
      return [tx, 0, tz + STOP_BACKOFF];
    case 'S':
      return [tx, 0, tz - STOP_BACKOFF];
    case 'E':
      return [tx - STOP_BACKOFF, 0, tz];
    case 'W':
      return [tx + STOP_BACKOFF, 0, tz];
  }
}

export default function DrivenCar({ seed }: { seed: number }) {
  const startId = useMemo(() => randomLaneWpId(), []);
  const start = LANE_WAYPOINTS[startId];
  const groupRef = useRef<THREE.Group>(null);
  const stateRef = useRef({
    pos: new THREE.Vector3(...start.pos).setY(0.6),
    prevId: null as string | null,
    targetId: startId,
    target: new THREE.Vector3(...start.pos).setY(0.6),
    color: COLORS[seed % COLORS.length],
  });

  useFrame((_, dt) => {
    const s = stateRef.current;
    const targetWp = LANE_WAYPOINTS[s.targetId];
    if (!targetWp) return;

    // If approaching an intersection with a red/yellow light, aim at the stop
    // line instead of the intersection itself.
    let aim: [number, number, number] = [targetWp.pos[0], 0.6, targetWp.pos[2]];
    let holding = false;
    if (targetWp.isIntersection) {
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
        // Sit at the stop line; don't advance.
        if (groupRef.current) {
          groupRef.current.position.copy(s.pos);
        }
        return;
      }
      const next = pickNextLane(s.targetId, s.prevId);
      s.prevId = s.targetId;
      s.targetId = next.id;
      return;
    }
    dir.normalize();
    const step = Math.min(SPEED * dt, dist);
    s.pos.addScaledVector(dir, step);
    if (groupRef.current) {
      groupRef.current.position.copy(s.pos);
      groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
    }
  });

  const variant = useMemo(() => pickCarVariantBySeed(seed), [seed]);
  const color = stateRef.current.color;

  const primitiveFallback = (
    <group>
      <mesh castShadow>
        <boxGeometry args={[1.8, 0.9, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.55, -0.2]} castShadow>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.55, -0.2]}>
        <boxGeometry args={[1.61, 0.4, 2.21]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.5, 0.2, 2.0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#fff7c2" emissive="#fff7c2" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.5, 0.2, 2.0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#fff7c2" emissive="#fff7c2" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      <GltfBoundary fallback={primitiveFallback}>
        <CarModel variant={variant} />
      </GltfBoundary>
    </group>
  );
}
