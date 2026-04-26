import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import { yawForLaneDir } from '@/game/world/cityLayout';
import { LANE_WAYPOINTS } from '@/game/world/worldWaypoints';
import { pickCarVariantBySeed, VEHICLE_IDENTITY } from '@/game/world/cityAssets';
import Car from '@/game/vehicles/Car';
import EjectedDriver from '@/game/vehicles/EjectedDriver';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import {
  pickRandomNeighbor,
  useAiWaypointDriver,
} from '@/game/vehicles/useAiWaypointDriver';

// Rapier body types. 0 = Dynamic.
const BODY_DYNAMIC = 0;

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
  // Once an ambient AI car gets rammed by another vehicle, the waypoint
  // follower steps aside and the body becomes Dynamic so it can be shoved
  // around by physics. No re-merge into traffic in v1 — disturbed cars stay
  // disturbed.
  const [disturbed, setDisturbed] = useState(false);

  useAiWaypointDriver({
    id,
    rigidRef: rigid,
    startId,
    disabled: isDriven || stolen || paused || disturbed,
    debug,
    getConfig: () => ({
      speed: aiSpeed,
      pickNext: pickRandomNeighbor,
      obeyLights: true,
    }),
  });

  const handleImpact = useCallback(
    (other: RapierRigidBody | null) => {
      if (disturbed) return;
      const r = rigid.current;
      if (!r) return;
      // Switch off the AI's kinematic rails so the player's car (also
      // kinematic while driven) can resolve against us via dynamic-vs-
      // kinematic contact on the next physics step.
      r.setBodyType(BODY_DYNAMIC, true);
      r.wakeUp();
      // Carry over the impactor's velocity so the rammed car visibly slides
      // in the direction it was hit instead of being statue-stiff for one
      // frame before gravity catches it.
      const ov = other?.linvel();
      if (ov) {
        r.setLinvel({ x: ov.x * 0.6, y: 0, z: ov.z * 0.6 }, true);
      }
      setDisturbed(true);
    },
    [disturbed],
  );

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
      onImpact={handleImpact}
    >
      {ejectPos && <EjectedDriver seed={seed * 53 + 7} startPos={ejectPos} />}
    </Car>
  );
}
