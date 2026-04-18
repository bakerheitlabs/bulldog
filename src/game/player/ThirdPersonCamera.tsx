import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '@/state/settingsStore';
import { cameraState } from './cameraState';

const CAM_DIST = 5;
const CAM_HEIGHT = 1.6;
const TARGET_HEIGHT = 1.2;

export type CameraTarget = {
  getPosition: () => THREE.Vector3 | null;
};

const tmpTarget = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();

export default function ThirdPersonCamera({ target }: { target: CameraTarget }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const fov = useSettingsStore((s) => s.fov);

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  useFrame((_, dt) => {
    const pos = target.getPosition();
    if (!pos) return;
    tmpTarget.set(pos.x, pos.y + TARGET_HEIGHT, pos.z);
    const yaw = cameraState.yaw;
    const pitch = cameraState.pitch;
    const offsetX = Math.sin(yaw) * Math.cos(pitch) * CAM_DIST;
    const offsetZ = Math.cos(yaw) * Math.cos(pitch) * CAM_DIST;
    const offsetY = -Math.sin(pitch) * CAM_DIST + CAM_HEIGHT;
    tmpDesired.set(tmpTarget.x + offsetX, tmpTarget.y + offsetY, tmpTarget.z + offsetZ);
    // smooth follow
    const lerp = 1 - Math.exp(-dt * 12);
    camera.position.lerp(tmpDesired, lerp);
    camera.lookAt(tmpTarget);
  });

  return null;
}
