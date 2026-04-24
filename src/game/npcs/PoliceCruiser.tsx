import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  LANE_WAYPOINTS,
  getIntersection,
  stopBackoff,
  type LaneWaypoint,
} from '@/game/world/cityLayout';
import { mustStopAtLight } from '@/game/world/trafficLightState';
import CarModel from '@/game/vehicles/CarModel';
import CarSmoke, { smokeColorForDamage } from '@/game/vehicles/CarSmoke';
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
  const id = `npc_cruiser_${seed}`;
  const start = useMemo(() => {
    if (mode === 'response') {
      const [px, , pz] = useGameStore.getState().player.position;
      return pickFarLaneWp(px, pz);
    }
    return pickRandomLaneWp();
  }, [mode]);
  const rigid = useRef<RapierRigidBody | null>(null);
  const tmpPos = useRef(new THREE.Vector3());
  const [deployed, setDeployed] = useState(false);
  const [deployPos, setDeployPos] = useState<[number, number, number] | null>(null);
  const damage = useVehicleStore((s) => s.carDamage[id] ?? 0);

  const stateRef = useRef({
    prevId: null as string | null,
    targetId: start.id,
    target: new THREE.Vector3(...start.pos).setY(0.6),
    rollCd: 0,
  });

  useFrame((_, dt) => {
    const r = rigid.current;
    if (!r) return;
    const s = stateRef.current;
    if (deployed) {
      const cur = r.linvel();
      r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
      return;
    }

    const heat = useGameStore.getState().wanted.heat;
    const playerHp = useGameStore.getState().player.health;
    const hostile = heat > 0 && playerHp > 0;
    const [px, , pz] = useGameStore.getState().player.position;

    const t = r.translation();

    if (hostile) {
      const distToPlayer = Math.hypot(t.x - px, t.z - pz);
      if (distToPlayer <= DEPLOY_RANGE) {
        s.rollCd -= dt;
        if (s.rollCd <= 0) {
          s.rollCd = DEPLOY_ROLL_INTERVAL_S;
          const driving = useVehicleStore.getState().drivenCarId != null;
          const prob = driving ? DEPLOY_PROB_DRIVING : DEPLOY_PROB_ON_FOOT;
          if (Math.random() < prob) {
            setDeployed(true);
            setDeployPos([t.x, 0, t.z]);
            const cur = r.linvel();
            r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
            return;
          }
        }
        const cur = r.linvel();
        r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
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

    const dx = s.target.x - t.x;
    const dz = s.target.z - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      if (holding) {
        const cur = r.linvel();
        r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
        return;
      }
      const next = hostile
        ? pickNeighborTowardPlayer(s.targetId, s.prevId, px, pz)
        : pickRandomNeighbor(s.targetId, s.prevId);
      s.prevId = s.targetId;
      s.targetId = next.id;
      return;
    }
    const inv = 1 / dist;
    const dirX = dx * inv;
    const dirZ = dz * inv;
    const speed = hostile ? PURSUIT_SPEED : PATROL_SPEED;
    const cur = r.linvel();
    r.setLinvel({ x: dirX * speed, y: cur.y, z: dirZ * speed }, true);
    const yaw = Math.atan2(dirX, dirZ);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    r.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    r.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });

  const onHit = useCallback(
    (payload: CollisionEnterPayload) => {
      const self = rigid.current;
      if (!self) return;
      const v = self.linvel();
      const other = payload.other.rigidBody;
      let dvx = v.x;
      let dvz = v.z;
      if (other) {
        const ov = other.linvel();
        dvx -= ov.x;
        dvz -= ov.z;
      }
      const relSpeed = Math.hypot(dvx, dvz);
      if (relSpeed < 3) return;
      const dmg = Math.min(35, (relSpeed - 3) * 4);
      useVehicleStore.getState().damageCarBy(id, dmg);
    },
    [id],
  );

  const getSmokePos = useCallback(() => {
    const r = rigid.current;
    if (!r) return null;
    const t = r.translation();
    tmpPos.current.set(t.x, t.y, t.z);
    return tmpPos.current;
  }, []);

  const smokeColor = smokeColorForDamage(damage);

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
      <RigidBody
        ref={rigid}
        type="dynamic"
        colliders={false}
        position={[start.pos[0], 0.6, start.pos[2]]}
        enabledRotations={[false, true, false]}
        mass={800}
        linearDamping={0.4}
        angularDamping={4}
        userData={{ type: 'vehicle', id }}
        onCollisionEnter={onHit}
      >
        <CuboidCollider args={[0.9, 0.45, 2]} />
        <GltfBoundary fallback={primitiveFallback}>
          <CarModel variant="carPolice" />
        </GltfBoundary>
      </RigidBody>
      {smokeColor && <CarSmoke getPos={getSmokePos} color={smokeColor} />}
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
