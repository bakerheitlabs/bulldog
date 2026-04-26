import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import { yawForLaneDir, type LaneWaypoint } from '@/game/world/cityLayout';
import { LANE_WAYPOINTS } from '@/game/world/worldWaypoints';
import Car from '@/game/vehicles/Car';
import EjectedDriver from '@/game/vehicles/EjectedDriver';
import Cop from './Cop';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import {
  pickRandomNeighbor,
  useAiWaypointDriver,
} from '@/game/vehicles/useAiWaypointDriver';

const PATROL_SPEED = 8;
const PURSUIT_SPEED = 14;
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

export default function PoliceCruiser({
  seed,
  mode = 'patrol',
  paused = false,
}: {
  seed: number;
  mode?: 'patrol' | 'response';
  paused?: boolean;
}) {
  const id = `npc_cruiser_${seed}`;
  const start = useMemo(() => {
    if (mode === 'response') {
      const [px, , pz] = useGameStore.getState().player.position;
      return pickFarLaneWp(px, pz);
    }
    return pickRandomLaneWp();
  }, [mode]);
  const rigid = useRef<RapierRigidBody | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [deployPos, setDeployPos] = useState<[number, number, number] | null>(null);
  const [stolen, setStolen] = useState(false);
  const [ejectPos, setEjectPos] = useState<[number, number, number] | null>(null);
  const rollRef = useRef(0);

  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const isDriven = drivenCarId === id;

  useAiWaypointDriver({
    id,
    rigidRef: rigid,
    startId: start.id,
    disabled: isDriven || stolen || paused,
    getConfig: (ctx) => {
      if (deployed) return 'hold';
      const heat = useGameStore.getState().wanted.heat;
      const playerHp = useGameStore.getState().player.health;
      const hostile = heat > 0 && playerHp > 0;
      const [px, , pz] = useGameStore.getState().player.position;

      // Lights flash whenever this cruiser is actively pursuing. Audio is
      // intentionally not started here — the player-driven path owns sound.
      useVehicleStore.getState().setSiren(id, hostile);

      if (hostile) {
        const distToPlayer = Math.hypot(ctx.pos.x - px, ctx.pos.z - pz);
        if (distToPlayer <= DEPLOY_RANGE) {
          // Once per driver-frame budget for a deploy roll.
          rollRef.current -= 1 / 60;
          if (rollRef.current <= 0) {
            rollRef.current = DEPLOY_ROLL_INTERVAL_S;
            const driving = useVehicleStore.getState().drivenCarId != null;
            const prob = driving ? DEPLOY_PROB_DRIVING : DEPLOY_PROB_ON_FOOT;
            if (Math.random() < prob) {
              setDeployed(true);
              setDeployPos([ctx.pos.x, 0, ctx.pos.z]);
            }
          }
          return 'hold';
        }
      }

      return {
        speed: hostile ? PURSUIT_SPEED : PATROL_SPEED,
        pickNext: hostile
          ? (cur, prev) => pickNeighborTowardPlayer(cur, prev, px, pz)
          : pickRandomNeighbor,
        obeyLights: !hostile,
      };
    },
  });

  // Eject the cop driver when the player first steals the cruiser.
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
      variant="carPolice"
      fallbackColor="#1f3a8a"
      paused={paused}
    >
      {ejectPos && <EjectedDriver seed={seed * 71 + 13} startPos={ejectPos} />}
      {deployed && deployPos &&
        DEPLOY_OFFSETS.map(([dx, dz], i) => (
          <Cop
            key={`cruiser_${seed}_cop_${i}`}
            seed={seed * 37 + i * 101}
            startPos={[deployPos[0] + dx, 0, deployPos[2] + dz]}
          />
        ))}
    </Car>
  );
}
