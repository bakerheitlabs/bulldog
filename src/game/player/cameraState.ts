// Shared yaw/pitch state for the third-person camera and player movement.
// Lives outside React so high-frequency mouse moves don't trigger re-renders.

export const cameraState = {
  yaw: 0,
  pitch: -0.15,
  // Camera-only offsets applied while the player holds the orbit key (C).
  // Do NOT feed back into player heading so the character keeps facing their
  // travel direction while you peek at their front.
  orbitYaw: 0,
  orbitPitch: 0,
  orbiting: false,
};

export const PITCH_MIN = -1.2;
export const PITCH_MAX = 0.6;
export const ORBIT_PITCH_MIN = -1.0;
export const ORBIT_PITCH_MAX = 0.8;

// Car-forward uses +Z; the camera is placed at (sin yaw, cos yaw) * dist from
// the target and looks back at it, so setting yaw = carYaw + π puts the camera
// behind the hood without flipping the free-look that happens afterwards.
export function snapCameraYawBehind(carYaw: number) {
  cameraState.yaw = carYaw + Math.PI;
  cameraState.orbitYaw = 0;
  cameraState.orbitPitch = 0;
}
