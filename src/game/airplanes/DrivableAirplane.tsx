import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import GltfBoundary from '@/game/world/GltfBoundary';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import AirplaneModel from './AirplaneModel';
import { GROUND_Y } from './airplaneConstants';
import { registerAirplane } from './airplaneRegistry';
import { useAirplaneController } from './useAirplaneController';

type Props = {
  id: string;
  initialPos: [number, number, number]; // (x, _, z) — y is overridden to GROUND_Y
  initialYaw: number;
  paused: boolean;
};

// Fallback for when the airplane GLB is unavailable: a small dim placeholder
// box so the scene doesn't blank out at the parking spot.
function PrimitiveAirplane() {
  return (
    <mesh>
      <boxGeometry args={[6, 3, 30]} />
      <meshStandardMaterial color="#cfd2d6" />
    </mesh>
  );
}

// A parked-and-flyable airliner. Mirrors DrivableCar/Car: rigid body wraps the
// model, controller hook owns input + integration, registry exposes position
// for proximity-based "press E to enter".
export default function DrivableAirplane({ id, initialPos, initialYaw, paused }: Props) {
  const rigidRef = useRef<RapierRigidBody | null>(null);
  const tmpPos = useRef(new THREE.Vector3());
  // Per-plane gear state: only the player-flown plane reads the toggle.
  // Parked / not-driven planes always show their gear out, so a parked plane
  // doesn't suddenly hide its wheels when the player retracts gear in a
  // different plane.
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const landingGearOut = useVehicleStore((s) => s.landingGearOut);
  const gearOut = drivenPlaneId === id ? landingGearOut : true;

  useEffect(() => {
    return registerAirplane({
      id,
      getPosition: () => {
        const r = rigidRef.current;
        if (!r) return tmpPos.current.set(initialPos[0], GROUND_Y, initialPos[2]);
        const t = r.translation();
        tmpPos.current.set(t.x, t.y, t.z);
        return tmpPos.current;
      },
    });
    // initialPos only changes on remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useAirplaneController({ id, rigidRef, paused, initialYaw });

  // Memoize unstable props so @react-three/rapier doesn't re-fire its
  // body-creation effect every render and teleport the plane back to spawn
  // mid-flight (same trap as Car.tsx).
  const initialBodyPos = useMemo<[number, number, number]>(
    () => [initialPos[0], GROUND_Y, initialPos[2]],
    [initialPos],
  );
  const initialBodyRot = useMemo<[number, number, number]>(
    () => [0, initialYaw, 0],
    [initialYaw],
  );
  const userData = useMemo(() => ({ type: 'airplane', id }), [id]);

  // Half-extents for a single boxy collider that wraps the fuselage. Coarse
  // — wings clip through buildings — but enough to keep cars from driving
  // through the body when parked, mirroring the v1 ParkedPlane collider.
  // Position y = half-extent y so the collider's bottom is at body-frame y=0,
  // matching the visual's bottom (which `useFitLength`'s yOffset places at
  // body-frame y=0). Without this, a dynamic parked plane settles with its
  // collider bottom on the ground but its visual floating above it.
  const colliderArgs = useMemo<[number, number, number]>(() => [3, 3, 16], []);
  const colliderPos = useMemo<[number, number, number]>(() => [0, 3, 0], []);

  return (
    <RigidBody
      ref={rigidRef}
      colliders={false}
      type="dynamic"
      position={initialBodyPos}
      rotation={initialBodyRot}
      // Lock all rotations on the dynamic side — orientation is fully driven
      // by the kinematic controller while flown, and a parked plane should
      // stay pointed where it was placed (no random spin from collisions).
      enabledRotations={[false, false, false]}
      mass={5000}
      linearDamping={0.4}
      angularDamping={1.0}
      userData={userData}
    >
      <CuboidCollider args={colliderArgs} position={colliderPos} />
      <GltfBoundary fallback={<PrimitiveAirplane />}>
        <AirplaneModel gearOut={gearOut} />
      </GltfBoundary>
    </RigidBody>
  );
}
