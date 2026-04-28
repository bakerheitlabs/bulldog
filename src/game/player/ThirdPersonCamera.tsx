import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useRapier } from '@react-three/rapier';
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
const tmpDir = new THREE.Vector3();
// Inset the camera this far from any wall it would clip into so the near plane
// doesn't poke through the surface.
const WALL_CAMERA_INSET = 0.25;
// Don't shove the camera closer to the player than this — keeps the player
// readable even when wedged in a corner.
const MIN_CAMERA_DIST = 0.6;

export default function ThirdPersonCamera({ target }: { target: CameraTarget }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const fov = useSettingsStore((s) => s.fov);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const { world, rapier } = useRapier();

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  useFrame((_, rawDt) => {
    const pos = target.getPosition();
    if (!pos) return;
    // Clamp dt so a frame hitch (chunk re-mount, GLB instancing) can't make
    // the exponential lerp jump most of the way to the target in one frame —
    // that "snap" is what reads as jitter when entering a new chunk at speed.
    const dt = Math.min(rawDt, 1 / 30);
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

    // Pull the camera in if a wall is between the player and its desired spot,
    // otherwise the camera ends up on the far side and renders the room
    // through-the-wall. EXCLUDE_DYNAMIC skips the player/vehicles; EXCLUDE_SENSORS
    // skips trigger volumes so they don't shove the camera around.
    tmpDir.copy(tmpDesired).sub(tmpTarget);
    const desiredDist = tmpDir.length();
    if (desiredDist > 0.001) {
      tmpDir.divideScalar(desiredDist);
      const ray = new rapier.Ray(tmpTarget, tmpDir);
      const hit = world.castRay(
        ray,
        desiredDist,
        true,
        rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      );
      if (hit) {
        const clamped = Math.max(MIN_CAMERA_DIST, hit.timeOfImpact - WALL_CAMERA_INSET);
        tmpDesired.copy(tmpTarget).addScaledVector(tmpDir, clamped);
      }
    }

    const lerp = 1 - Math.exp(-dt * 12);
    camera.position.lerp(tmpDesired, lerp);
    camera.lookAt(tmpTarget);
  });

  return null;
}
