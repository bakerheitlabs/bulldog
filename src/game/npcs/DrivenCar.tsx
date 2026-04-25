import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import { LANE_WAYPOINTS, yawForLaneDir } from '@/game/world/cityLayout';
import { pickCarVariantBySeed, VEHICLE_IDENTITY } from '@/game/world/cityAssets';
import Car from '@/game/vehicles/Car';
import EjectedDriver from '@/game/vehicles/EjectedDriver';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import {
  pickRandomNeighbor,
  useAiWaypointDriver,
} from '@/game/vehicles/useAiWaypointDriver';

// Ambient traffic moves slower than the player can. We sample each variant's
// top speed and clamp into a tight band so a sports car still cruises a
// touch faster than a van without shredding intersection turns.
const AI_SPEED_MIN = 6;
const AI_SPEED_MAX = 9;
const AI_SPEED_FRACTION = 0.32;

function aiSpeedFor(topSpeed: number): number {
  return Math.min(AI_SPEED_MAX, Math.max(AI_SPEED_MIN, topSpeed * AI_SPEED_FRACTION));
}

const COLORS = ['#b04a3f', '#3f6cb0', '#3fa362', '#c9a23a', '#7a4ab0', '#444c5e', '#d9d2c3'];

function randomLaneWpId(): string {
  const ids = Object.keys(LANE_WAYPOINTS);
  return ids[Math.floor(Math.random() * ids.length)];
}

export default function DrivenCar({
  seed,
  paused = false,
  startId: startIdProp,
  debug = false,
  idOverride,
}: {
  seed: number;
  paused?: boolean;
  // Optional explicit spawn waypoint. Defaults to a random one.
  startId?: string;
  // When true, AI waypoint transitions and "stuck" warnings are logged
  // to the browser console.
  debug?: boolean;
  // Optional id override — used by debug spawning so debug cars don't
  // collide with the regular `npc_car_<seed>` namespace.
  idOverride?: string;
}) {
  const id = idOverride ?? `npc_car_${seed}`;
  const startId = useMemo(() => startIdProp ?? randomLaneWpId(), [startIdProp]);
  const start = LANE_WAYPOINTS[startId];
  const rigid = useRef<RapierRigidBody | null>(null);
  const variant = useMemo(() => pickCarVariantBySeed(seed), [seed]);
  const color = COLORS[seed % COLORS.length];
  const aiSpeed = useMemo(() => aiSpeedFor(VEHICLE_IDENTITY[variant].topSpeed), [variant]);

  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const isDriven = drivenCarId === id;
  const [stolen, setStolen] = useState(false);
  const [ejectPos, setEjectPos] = useState<[number, number, number] | null>(null);

  useAiWaypointDriver({
    id,
    rigidRef: rigid,
    startId,
    disabled: isDriven || stolen || paused,
    debug,
    getConfig: () => ({
      speed: aiSpeed,
      pickNext: pickRandomNeighbor,
      obeyLights: true,
    }),
  });

  // First time the player takes this car, eject the driver alongside.
  useEffect(() => {
    if (!isDriven || stolen) return;
    const r = rigid.current;
    const t = r?.translation();
    const basePos: [number, number, number] = t
      ? [t.x, 0, t.z]
      : [start.pos[0], 0, start.pos[2]];
    const q = r?.rotation();
    let side: [number, number] = [1.5, 0];
    if (q) {
      const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      const right = new THREE.Vector3(Math.cos(euler.y), 0, -Math.sin(euler.y));
      side = [right.x * 1.8, right.z * 1.8];
    }
    setEjectPos([basePos[0] + side[0], basePos[1], basePos[2] + side[1]]);
    setStolen(true);
  }, [isDriven, stolen, start.pos]);

  return (
    <Car
      id={id}
      rigidRef={rigid}
      initialPos={[start.pos[0], 0, start.pos[2]]}
      initialRotY={yawForLaneDir(start.dir)}
      variant={variant}
      fallbackColor={color}
      paused={paused}
    >
      {ejectPos && <EjectedDriver seed={seed * 53 + 7} startPos={ejectPos} />}
    </Car>
  );
}
