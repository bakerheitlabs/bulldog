import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  LANE_WAYPOINTS,
  getIntersection,
  stopBackoff,
  type LaneWaypoint,
} from '@/game/world/cityLayout';
import { mustStopAtLight } from '@/game/world/trafficLightState';
import { pickCarVariantBySeed } from '@/game/world/cityAssets';
import CarModel from '@/game/vehicles/CarModel';
import CarSmoke, { smokeColorForDamage } from '@/game/vehicles/CarSmoke';
import GltfBoundary from '@/game/world/GltfBoundary';
import { useVehicleStore, writeDrivenCarPose } from '@/game/vehicles/vehicleState';
import { registerVehicle } from '@/game/vehicles/vehicleRegistry';
import { useKeyboard } from '@/game/player/useKeyboard';
import { startEngine, type EngineHandle } from '@/game/audio/synth';
import EjectedDriver from '@/game/vehicles/EjectedDriver';

const AI_SPEED = 7;

// Player-driving tuning — mirrors DrivableCar.
const MAX_SPEED = 16;
const REVERSE_SPEED = 6;
const ACCEL = 10;
const BRAKE = 16;
const COAST_DRAG = 2.2;
const MAX_YAW_RATE = 1.6;

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

export default function DrivenCar({ seed, paused = false }: { seed: number; paused?: boolean }) {
  const id = `npc_car_${seed}`;
  const startId = useMemo(() => randomLaneWpId(), []);
  const start = LANE_WAYPOINTS[startId];
  const rigid = useRef<RapierRigidBody | null>(null);
  const tmpPos = useRef(new THREE.Vector3());
  const stateRef = useRef({
    prevId: null as string | null,
    targetId: startId,
    target: new THREE.Vector3(...start.pos).setY(0.6),
    color: COLORS[seed % COLORS.length],
    speed: 0,
    yaw: 0,
  });
  const damage = useVehicleStore((s) => s.carDamage[id] ?? 0);
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const isDriven = drivenCarId === id;
  const [stolen, setStolen] = useState(false);
  const [ejectPos, setEjectPos] = useState<[number, number, number] | null>(null);
  const keys = useKeyboard();
  const engineRef = useRef<EngineHandle | null>(null);

  useEffect(() => {
    return registerVehicle({
      id,
      getPosition: () => {
        const r = rigid.current;
        if (!r) return tmpPos.current.set(start.pos[0], 0.6, start.pos[2]);
        const t = r.translation();
        tmpPos.current.set(t.x, t.y, t.z);
        return tmpPos.current;
      },
    });
  }, [id, start.pos]);

  // First time the player takes this car, eject the driver.
  useEffect(() => {
    if (!isDriven || stolen) return;
    const r = rigid.current;
    const t = r?.translation();
    const pos: [number, number, number] = t
      ? [t.x, 0, t.z]
      : [start.pos[0], 0, start.pos[2]];
    // Drop the ejected driver slightly to the side so they aren't clipped by
    // the car's collider.
    const q = r?.rotation();
    let side: [number, number] = [1.5, 0];
    if (q) {
      const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      const right = new THREE.Vector3(Math.cos(euler.y), 0, -Math.sin(euler.y));
      side = [right.x * 1.8, right.z * 1.8];
    }
    setEjectPos([pos[0] + side[0], pos[1], pos[2] + side[1]]);
    setStolen(true);
  }, [isDriven, stolen, start.pos]);

  // Engine audio while player is driving.
  useEffect(() => {
    if (!isDriven) {
      engineRef.current?.stop();
      engineRef.current = null;
      return;
    }
    const r = rigid.current;
    if (r) {
      const q = r.rotation();
      const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      stateRef.current.yaw = euler.y;
      const v = r.linvel();
      const forward = new THREE.Vector3(Math.sin(euler.y), 0, Math.cos(euler.y));
      stateRef.current.speed = v.x * forward.x + v.z * forward.z;
    }
    engineRef.current = startEngine();
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [isDriven]);

  useFrame((_, dt) => {
    const r = rigid.current;
    if (!r) return;
    const s = stateRef.current;

    if (isDriven) {
      if (paused) return;
      const throttle = keys.current['KeyW'] ? 1 : 0;
      const brake = keys.current['KeyS'] ? 1 : 0;
      const steerLeft = keys.current['KeyA'] ? 1 : 0;
      const steerRight = keys.current['KeyD'] ? 1 : 0;
      const steer = steerRight - steerLeft;

      let sp = s.speed;
      if (throttle > 0) sp += ACCEL * dt;
      else if (brake > 0) {
        if (sp > 0) sp -= BRAKE * dt;
        else sp -= ACCEL * 0.6 * dt;
      } else {
        if (sp > 0) sp = Math.max(0, sp - COAST_DRAG * dt);
        else if (sp < 0) sp = Math.min(0, sp + COAST_DRAG * dt);
      }
      sp = Math.max(-REVERSE_SPEED, Math.min(MAX_SPEED, sp));
      s.speed = sp;

      const speedFactor = Math.min(1, Math.abs(sp) / 4);
      s.yaw += -steer * MAX_YAW_RATE * speedFactor * Math.sign(sp || 1) * dt;

      const forward = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      const cur = r.linvel();
      r.setLinvel({ x: forward.x * sp, y: cur.y, z: forward.z * sp }, true);
      r.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      r.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

      const t = r.translation();
      tmpPos.current.set(t.x, t.y, t.z);
      writeDrivenCarPose(tmpPos.current, s.yaw);
      engineRef.current?.setThrottle(throttle);
      engineRef.current?.setSpeed(Math.abs(sp) / MAX_SPEED);
      return;
    }

    // Once stolen, the AI never resumes — leave the car wherever the player
    // left it so they can come back to it.
    if (stolen) {
      const cur = r.linvel();
      r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
      return;
    }

    const targetWp = LANE_WAYPOINTS[s.targetId];
    if (!targetWp) return;

    const t = r.translation();

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

    const dx = s.target.x - t.x;
    const dz = s.target.z - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      if (holding) {
        const cur = r.linvel();
        r.setLinvel({ x: 0, y: cur.y, z: 0 }, true);
        return;
      }
      const next = pickNextLane(s.targetId, s.prevId);
      s.prevId = s.targetId;
      s.targetId = next.id;
      return;
    }
    const inv = 1 / dist;
    const dirX = dx * inv;
    const dirZ = dz * inv;
    const cur = r.linvel();
    r.setLinvel({ x: dirX * AI_SPEED, y: cur.y, z: dirZ * AI_SPEED }, true);
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

  const variant = useMemo(() => pickCarVariantBySeed(seed), [seed]);
  const color = stateRef.current.color;
  const smokeColor = smokeColorForDamage(damage);

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
          <CarModel variant={variant} />
        </GltfBoundary>
      </RigidBody>
      {smokeColor && <CarSmoke getPos={getSmokePos} color={smokeColor} />}
      {ejectPos && <EjectedDriver seed={seed * 53 + 7} startPos={ejectPos} />}
    </>
  );
}
