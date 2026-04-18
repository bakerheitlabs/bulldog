// Shared yaw/pitch state for the third-person camera and player movement.
// Lives outside React so high-frequency mouse moves don't trigger re-renders.

export const cameraState = {
  yaw: 0,
  pitch: -0.15,
};

export const PITCH_MIN = -1.2;
export const PITCH_MAX = 0.6;
