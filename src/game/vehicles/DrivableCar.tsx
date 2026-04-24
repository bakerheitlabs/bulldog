import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useVehicleStore, writeDrivenCarPose } from './vehicleState';
import { registerVehicle } from './vehicleRegistry';
import { useKeyboard } from '@/game/player/useKeyboard';
import { startEngine, type EngineHandle } from '@/game/audio/synth';
import CarModel from './CarModel';
import CarSmoke, { smokeColorForDamage } from './CarSmoke';
import GltfBoundary from '@/game/world/GltfBoundary';
import type { CarVariant } from '@/game/world/cityAssets';

const MAX_SPEED = 16;
const REVERSE_SPEED = 6;
const ACCEL = 10;
const BRAKE = 16;
const COAST_DRAG = 2.2;
const MAX_YAW_RATE = 1.6;

type Props = {
  id: string;
  initialPos: [number, number, number];
  initialRotY: number;
  color: string;
  variant: CarVariant;
  paused: boolean;
};

function PrimitiveCar({ color, isDriven }: { color: string; isDriven: boolean }) {
  return (
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
        <meshStandardMaterial
          color="#fff7c2"
          emissive="#fff7c2"
          emissiveIntensity={isDriven ? 0.9 : 0.2}
        />
      </mesh>
      <mesh position={[-0.5, 0.2, 2.0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial
          color="#fff7c2"
          emissive="#fff7c2"
          emissiveIntensity={isDriven ? 0.9 : 0.2}
        />
      </mesh>
    </group>
  );
}

export default function DrivableCar({
  id,
  initialPos,
  initialRotY,
  color,
  variant,
  paused,
}: Props) {
  const rigid = useRef<RapierRigidBody | null>(null);
  const meshGroup = useRef<THREE.Group>(null);
  const keys = useKeyboard();
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const storeColor = useVehicleStore((s) => s.carColors[id]);
  const damage = useVehicleStore((s) => s.carDamage[id] ?? 0);
  const isDriven = drivenCarId === id;
  // Primitive uses the store color or initial prop; GLTF keeps its default
  // Kenney paint until the mechanic repaints (storeColor defined).
  const activeColor = storeColor ?? color;
  const speedRef = useRef(0);
  const yawRef = useRef(initialRotY);
  const tmpPos = useRef(new THREE.Vector3());
  const engineRef = useRef<EngineHandle | null>(null);

  useEffect(() => {
    return registerVehicle({
      id,
      getPosition: () => {
        const r = rigid.current;
        if (!r) return tmpPos.current.set(initialPos[0], initialPos[1], initialPos[2]);
        const t = r.translation();
        tmpPos.current.set(t.x, t.y, t.z);
        return tmpPos.current;
      },
    });
  }, [id, initialPos]);

  useEffect(() => {
    if (!isDriven) {
      engineRef.current?.stop();
      engineRef.current = null;
      return;
    }
    // sync yaw + speed to the car's current physical state (it may have been
    // bumped since last drive)
    const r = rigid.current;
    if (r) {
      const q = r.rotation();
      const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      yawRef.current = euler.y;
      const v = r.linvel();
      const forward = new THREE.Vector3(Math.sin(euler.y), 0, Math.cos(euler.y));
      speedRef.current = v.x * forward.x + v.z * forward.z;
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
    if (paused || !isDriven) return;

    const throttle = keys.current['KeyW'] ? 1 : 0;
    const brake = keys.current['KeyS'] ? 1 : 0;
    const steerLeft = keys.current['KeyA'] ? 1 : 0;
    const steerRight = keys.current['KeyD'] ? 1 : 0;
    const steer = steerRight - steerLeft;

    // throttle/brake integration
    let s = speedRef.current;
    if (throttle > 0) {
      s += ACCEL * dt;
    } else if (brake > 0) {
      if (s > 0) s -= BRAKE * dt;
      else s -= ACCEL * 0.6 * dt;
    } else {
      // natural drag
      if (s > 0) s = Math.max(0, s - COAST_DRAG * dt);
      else if (s < 0) s = Math.min(0, s + COAST_DRAG * dt);
    }
    s = Math.max(-REVERSE_SPEED, Math.min(MAX_SPEED, s));
    speedRef.current = s;

    // steering scales with speed sign + magnitude
    const speedFactor = Math.min(1, Math.abs(s) / 4);
    const yawDelta = -steer * MAX_YAW_RATE * speedFactor * Math.sign(s || 1) * dt;
    yawRef.current += yawDelta;

    const yaw = yawRef.current;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const cur = r.linvel();
    r.setLinvel({ x: forward.x * s, y: cur.y, z: forward.z * s }, true);
    r.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    r.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

    const t = r.translation();
    tmpPos.current.set(t.x, t.y, t.z);
    writeDrivenCarPose(tmpPos.current, yaw);
    engineRef.current?.setThrottle(throttle);
    engineRef.current?.setSpeed(Math.abs(s) / MAX_SPEED);
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
      const THRESHOLD = 3;
      if (relSpeed < THRESHOLD) return;
      const dmg = Math.min(35, (relSpeed - THRESHOLD) * 4);
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

  return (
    <>
      <RigidBody
        ref={rigid}
        colliders={false}
        type="dynamic"
        position={[initialPos[0], initialPos[1] + 0.6, initialPos[2]]}
        rotation={[0, initialRotY, 0]}
        enabledRotations={[false, true, false]}
        mass={800}
        linearDamping={0.4}
        angularDamping={4}
        userData={{ type: 'vehicle', id }}
        onCollisionEnter={onHit}
      >
        <CuboidCollider args={[0.9, 0.45, 2]} />
        <group ref={meshGroup}>
          <GltfBoundary fallback={<PrimitiveCar color={activeColor} isDriven={isDriven} />}>
            <CarModel variant={variant} tint={storeColor} />
          </GltfBoundary>
        </group>
      </RigidBody>
      {smokeColor && <CarSmoke getPos={getSmokePos} color={smokeColor} />}
    </>
  );
}
