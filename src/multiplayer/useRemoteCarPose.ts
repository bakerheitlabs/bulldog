// Drives a car's pose from snapshot interpolation when it's being driven by a
// remote peer (not by us). Mirror of useCarDriver's body-type lifecycle:
// flip to KinematicPositionBased while the remote is driving, restore Dynamic
// when they leave.

import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useVehicleOwnershipStore } from './vehicleOwnership';
import { readInterpolatedVehicle, vehicleRenderTime } from './vehicleInterp';

const BODY_DYNAMIC = 0;
const BODY_KINEMATIC_POSITION = 2;

export function useRemoteCarPose({
  id,
  rigidRef,
}: {
  id: string;
  rigidRef: MutableRefObject<RapierRigidBody | null>;
}): void {
  const driverId = useVehicleOwnershipStore((s) => s.remoteDrivers[id]);
  const isRemoteDriven = !!driverId;
  const tmpQuat = useRef(new THREE.Quaternion());
  const _Y_AXIS = useRef(new THREE.Vector3(0, 1, 0));

  useEffect(() => {
    const r = rigidRef.current;
    if (!r) return;
    if (isRemoteDriven) {
      r.setBodyType(BODY_KINEMATIC_POSITION, true);
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      r.setBodyType(BODY_DYNAMIC, true);
    }
  }, [isRemoteDriven, rigidRef]);

  useFrame(() => {
    if (!isRemoteDriven) return;
    const r = rigidRef.current;
    if (!r) return;
    if (r.bodyType() !== BODY_KINEMATIC_POSITION) {
      r.setBodyType(BODY_KINEMATIC_POSITION, true);
    }
    if (r.isSleeping()) r.wakeUp();
    const pose = readInterpolatedVehicle(id, vehicleRenderTime());
    if (!pose) return;
    r.setNextKinematicTranslation({ x: pose.pos[0], y: pose.pos[1], z: pose.pos[2] });
    tmpQuat.current.setFromAxisAngle(_Y_AXIS.current, pose.yaw);
    r.setNextKinematicRotation({
      x: tmpQuat.current.x,
      y: tmpQuat.current.y,
      z: tmpQuat.current.z,
      w: tmpQuat.current.w,
    });
  });
}
