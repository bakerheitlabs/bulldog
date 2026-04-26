import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '@/state/settingsStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { cameraState } from './cameraState';

// On-foot / in-car defaults — tight follow over the player or car hood.
const CAM_DIST = 5;
const CAM_HEIGHT = 1.6;
const TARGET_HEIGHT = 1.2;

// In-plane: pulled way back and lifted so the ~30m fuselage and wingspan all
// fit in frame. Lower target height pivots the look slightly above the plane
// so the horizon stays visible during normal cruise pitch.
const PLANE_CAM_DIST = 32;
const PLANE_CAM_HEIGHT = 10;
const PLANE_TARGET_HEIGHT = 3;

export type CameraTarget = {
  getPosition: () => THREE.Vector3 | null;
};

const tmpTarget = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();

export default function ThirdPersonCamera({ target }: { target: CameraTarget }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const fov = useSettingsStore((s) => s.fov);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  useFrame((_, dt) => {
    const pos = target.getPosition();
    if (!pos) return;
    if (!cameraState.orbiting) {
      const decay = 1 - Math.exp(-dt * 8);
      cameraState.orbitYaw += (0 - cameraState.orbitYaw) * decay;
      cameraState.orbitPitch += (0 - cameraState.orbitPitch) * decay;
    }
    // Pull the camera much further back when piloting an airplane — the
    // plane's ~30m fuselage + 30m wingspan is unreadable from car distance.
    // The desired-position lerp below smooths the transition automatically.
    const dist = drivenPlaneId ? PLANE_CAM_DIST : CAM_DIST;
    const camHeight = drivenPlaneId ? PLANE_CAM_HEIGHT : CAM_HEIGHT;
    const targetHeight = drivenPlaneId ? PLANE_TARGET_HEIGHT : TARGET_HEIGHT;
    tmpTarget.set(pos.x, pos.y + targetHeight, pos.z);
    const yaw = cameraState.yaw + cameraState.orbitYaw;
    const pitch = cameraState.pitch + cameraState.orbitPitch;
    const offsetX = Math.sin(yaw) * Math.cos(pitch) * dist;
    const offsetZ = Math.cos(yaw) * Math.cos(pitch) * dist;
    const offsetY = -Math.sin(pitch) * dist + camHeight;
    tmpDesired.set(tmpTarget.x + offsetX, tmpTarget.y + offsetY, tmpTarget.z + offsetZ);
    const lerp = 1 - Math.exp(-dt * 12);
    camera.position.lerp(tmpDesired, lerp);
    camera.lookAt(tmpTarget);
  });

  return null;
}
