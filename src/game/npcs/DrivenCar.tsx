import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ROAD_WAYPOINTS, type Waypoint } from '@/game/world/cityLayout';

const SPEED = 7;

const COLORS = ['#b04a3f', '#3f6cb0', '#3fa362', '#c9a23a', '#7a4ab0', '#444c5e', '#d9d2c3'];

function randomRoadWpId(): string {
  const ids = Object.keys(ROAD_WAYPOINTS);
  return ids[Math.floor(Math.random() * ids.length)];
}

export default function DrivenCar({ seed }: { seed: number }) {
  const startId = useMemo(() => randomRoadWpId(), []);
  const start = ROAD_WAYPOINTS[startId];
  const groupRef = useRef<THREE.Group>(null);
  const stateRef = useRef({
    pos: new THREE.Vector3(...start.pos).setY(0.6),
    prevId: null as string | null,
    targetId: startId,
    target: new THREE.Vector3(...start.pos).setY(0.6),
    color: COLORS[seed % COLORS.length],
  });

  function pickNext(currentId: string, prevId: string | null): Waypoint {
    const cur = ROAD_WAYPOINTS[currentId];
    const choices = cur.neighbors.filter((n) => n !== prevId);
    const list = choices.length ? choices : cur.neighbors;
    return ROAD_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
  }

  useFrame((_, dt) => {
    const s = stateRef.current;
    const dir = s.target.clone().sub(s.pos);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.6) {
      const next = pickNext(s.targetId, s.prevId);
      s.prevId = s.targetId;
      s.targetId = next.id;
      s.target.set(next.pos[0], 0.6, next.pos[2]);
    } else {
      dir.normalize();
      const step = Math.min(SPEED * dt, dist);
      s.pos.addScaledVector(dir, step);
      if (groupRef.current) {
        groupRef.current.position.copy(s.pos);
        groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <boxGeometry args={[1.8, 0.9, 4]} />
        <meshStandardMaterial color={stateRef.current.color} />
      </mesh>
      <mesh position={[0, 0.55, -0.2]} castShadow>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshStandardMaterial color={stateRef.current.color} />
      </mesh>
      <mesh position={[0, 0.55, -0.2]}>
        <boxGeometry args={[1.61, 0.4, 2.21]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.85} />
      </mesh>
      {/* headlights */}
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
}
