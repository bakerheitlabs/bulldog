import {
  CuboidCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import { Detailed } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import type { CarVariant } from '@/game/world/cityAssets';
import GltfBoundary from '@/game/world/GltfBoundary';
import CarModel from './CarModel';
import CarSmoke, { isCarDestroyed, smokeColorForDamage } from './CarSmoke';
import CarFire from './CarFire';
import Headlights from './Headlights';
import { useIsNight } from '@/game/world/DayNightLighting';
import {
  CAR_ANGULAR_DAMPING,
  CAR_COLLIDER_HALF,
  CAR_HOOD_FORWARD,
  CAR_HOOD_UP,
  CAR_IMPACT_THRESHOLD,
  CAR_LINEAR_DAMPING,
  CAR_MASS,
} from './drivingConstants';
import { useCarDriver } from './useCarDriver';
import { registerVehicle } from './vehicleRegistry';
import { useVehicleStore } from './vehicleState';
import { useRemoteCarPose } from '@/multiplayer/useRemoteCarPose';

export type CarVariantKey = CarVariant | 'carPolice';

const ENABLED_ROTATIONS: [boolean, boolean, boolean] = [false, true, false];

type Props = {
  id: string;
  rigidRef: MutableRefObject<RapierRigidBody | null>;
  initialPos: [number, number, number];
  initialRotY?: number;
  variant: CarVariantKey;
  // Color for the primitive fallback when the GLB isn't available.
  fallbackColor?: string;
  paused: boolean;
  // Rendered alongside the rigid body — used by DrivenCar / PoliceCruiser for
  // ejected drivers, police lights, etc. Not a DOM child of the rigid body.
  children?: React.ReactNode;
  // Called when this car is hit by another vehicle above the impact threshold.
  // Used by AI cars to switch from kinematic-on-rails into dynamic "disturbed"
  // mode so the player's car can shove them around like physical debris.
  onImpact?: (otherBody: RapierRigidBody | null, closingSpeed: number) => void;
};

// Far-LOD silhouette: body + roof + four wheel stubs. Lambert + no shadows
// keeps the fragment cost trivial. At ≥100m the player sees a 5-10px tall
// silhouette, so single-mesh wheels are plenty — they just need to be there
// so the car reads as a car instead of a floating brick.
const LOW_LOD_WHEEL_POSITIONS: Array<[number, number, number]> = [
  [0.85, -0.2, 1.35],
  [-0.85, -0.2, 1.35],
  [0.85, -0.2, -1.35],
  [-0.85, -0.2, -1.35],
];
const LOW_LOD_WHEEL_COLOR = '#1a1a1a';

function LowDetailCar({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[1.8, 0.9, 4]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.55, -0.2]}>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshLambertMaterial color={color} />
      </mesh>
      {LOW_LOD_WHEEL_POSITIONS.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[0.35, 0.45, 0.55]} />
          <meshLambertMaterial color={LOW_LOD_WHEEL_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

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

// Generic car: rigid body, collider, visual model, damage effects, collision
// damage, and the player-driving hook. AI variants attach waypoint behavior
// via a separate hook that shares the same rigidRef.
export default function Car({
  id,
  rigidRef,
  initialPos,
  initialRotY = 0,
  variant,
  fallbackColor = '#888',
  paused,
  children,
  onImpact,
}: Props) {
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const storeColor = useVehicleStore((s) => s.carColors[id]);
  const damage = useVehicleStore((s) => s.carDamage[id] ?? 0);
  const sirenOn = useVehicleStore((s) => !!s.sirenActive[id]);
  const headlightsManual = useVehicleStore((s) => s.headlightsManual);
  const isDriven = drivenCarId === id;
  const isPolice = variant === 'carPolice';
  const isNight = useIsNight();
  const tmpPos = useRef(new THREE.Vector3());

  useEffect(() => {
    return registerVehicle({
      id,
      getPosition: () => {
        const r = rigidRef.current;
        if (!r) return tmpPos.current.set(initialPos[0], initialPos[1], initialPos[2]);
        const t = r.translation();
        tmpPos.current.set(t.x, t.y, t.z);
        return tmpPos.current;
      },
    });
    // tmpPos ref is stable per-mount; initialPos only changes on remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useCarDriver({ id, rigidRef, paused, variant });
  // Multiplayer: when a peer is driving this car, follow snapshot pose. The
  // hook is a no-op when no remote driver is registered for this id (i.e.
  // single-player or this car is locally driven / parked).
  useRemoteCarPose({ id, rigidRef });

  const onHit = useCallback(
    (payload: CollisionEnterPayload) => {
      const self = rigidRef.current;
      if (!self) return;
      const v = self.linvel();
      const carSpeed = Math.hypot(v.x, v.z);
      const other = payload.other.rigidBody;
      const otherType = (other?.userData as { type?: string } | undefined)?.type;
      if (otherType === 'player' && carSpeed >= CAR_IMPACT_THRESHOLD) {
        const pdmg = Math.min(80, carSpeed * 5);
        useGameStore.getState().damagePlayer(pdmg);
      }
      // Vehicle-vs-vehicle: notify the wrapper using *closing* speed so an
      // AI car that gets rammed by a stopped player at speed reacts the same
      // as the player rear-ending stationary traffic. Both kinematic and
      // dynamic bodies report linvel() (kinematic derives it from the next
      // position delta), so this works regardless of body type.
      if (otherType === 'vehicle' && onImpact) {
        const ov = other?.linvel() ?? { x: 0, z: 0 };
        const closing = Math.hypot(v.x - ov.x, v.z - ov.z);
        if (closing >= CAR_IMPACT_THRESHOLD) onImpact(other ?? null, closing);
      }
      // Only damage the car if IT was moving fast — walking into a parked car
      // shouldn't dent it.
      if (carSpeed < CAR_IMPACT_THRESHOLD) return;
      const dmg = Math.min(35, (carSpeed - CAR_IMPACT_THRESHOLD) * 4);
      useVehicleStore.getState().damageCarBy(id, dmg);
    },
    [id, rigidRef, onImpact],
  );

  const getSmokePos = useCallback(() => {
    const r = rigidRef.current;
    if (!r) return null;
    const t = r.translation();
    const q = r.rotation();
    // Car model's +Z is forward; hood sits CAR_HOOD_FORWARD ahead of center.
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    tmpPos.current.set(
      t.x + fx * CAR_HOOD_FORWARD,
      t.y + CAR_HOOD_UP,
      t.z + fz * CAR_HOOD_FORWARD,
    );
    return tmpPos.current;
  }, [rigidRef]);

  const getForwardSpeed = useCallback(() => {
    const r = rigidRef.current;
    if (!r) return 0;
    const v = r.linvel();
    const q = r.rotation();
    // Project linear velocity onto the car's local +Z (forward) axis so
    // wheels spin proportional to actual heading-aligned travel, signed
    // for reverse and zero when sliding sideways.
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    return v.x * fx + v.z * fz;
  }, [rigidRef]);

  const activeColor = storeColor ?? fallbackColor;
  const smokeColor = smokeColorForDamage(damage);
  // @react-three/rapier re-applies EVERY mutable prop (including `type` and
  // `position`) whenever any of them changes by reference. Inline arrays/
  // objects in JSX would re-fire that effect on every Car re-render —
  // teleporting the body back to spawn while we're driving Kinematic, so
  // the integrator's setNextKinematicTranslation gets undone and the car
  // looks frozen while the camera (which follows _drivenPos) glides off.
  // Memoize everything so the ref-equality check passes.
  const userData = useMemo(() => ({ type: 'vehicle', id }), [id]);
  const initialBodyPos = useMemo<[number, number, number]>(
    () => [initialPos[0], initialPos[1] + 0.6, initialPos[2]],
    [initialPos],
  );
  const initialBodyRot = useMemo<[number, number, number]>(
    () => [0, initialRotY, 0],
    [initialRotY],
  );

  return (
    <>
      <RigidBody
        ref={rigidRef}
        colliders={false}
        type="dynamic"
        position={initialBodyPos}
        rotation={initialBodyRot}
        enabledRotations={ENABLED_ROTATIONS}
        mass={CAR_MASS}
        linearDamping={CAR_LINEAR_DAMPING}
        angularDamping={CAR_ANGULAR_DAMPING}
        userData={userData}
        onCollisionEnter={onHit}
      >
        {/* Rapier's DEFAULT active collision types omit kinematic↔kinematic
            pair generation, so when the player car (kinematic-while-driven)
            contacts an AI car (also kinematic) no contact pairs are created
            and onCollisionEnter never fires. ALL enables every combination
            (dynamic, kinematic, fixed) so we get events regardless of which
            body types are in play. K↔K still doesn't *resolve* contacts —
            disturb logic in DrivenCar handles that by switching the rammed
            car to dynamic on the first event. */}
        <CuboidCollider
          args={CAR_COLLIDER_HALF}
          activeCollisionTypes={ActiveCollisionTypes.ALL}
        />
        <GltfBoundary
          fallback={<PrimitiveCar color={activeColor} isDriven={isDriven} />}
        >
          {/* Drei's <Detailed> wraps THREE.LOD: it shows child[0] within
              100m of the camera and child[1] beyond. `hysteresis` is a
              FRACTION of the level distance (NOT meters) — 0.1 means the
              transition back to high-detail happens at 90m, suppressing
              flicker when the player oscillates around the threshold. The
              upper bound is high enough that police siren caps and tail
              lights stay legible at the distances they actually matter — a
              cop chase reads as cop colors well before the LOD swap. */}
          <Detailed distances={[0, 100]} hysteresis={0.1}>
            <group>
              <CarModel
                variant={variant}
                tint={storeColor}
                getSpeed={getForwardSpeed}
                siren={isPolice && sirenOn}
              />
            </group>
            <group>
              <LowDetailCar color={activeColor} />
            </group>
          </Detailed>
        </GltfBoundary>
        <Headlights enabled={isNight || headlightsManual} castBeams={isDriven} />
      </RigidBody>
      {smokeColor && <CarSmoke getPos={getSmokePos} color={smokeColor} />}
      {isCarDestroyed(damage) && <CarFire getPos={getSmokePos} />}
      {children}
    </>
  );
}
