import { useCityModel, useFitLength } from '@/game/world/cityAssets';
import { AIRPLANE_TARGET_LENGTH } from './airplaneConstants';

// Loads the airplane GLB, scales it to a consistent target length so every
// parked plane reads the same size regardless of the model's authored scale,
// and parents into the rigid body's group so transforms apply correctly. The
// GLB is authored with +Z as nose-forward (matching cars), so no extra
// rotation is applied here — yaw on the rigid body rotates the visible nose
// the same way it rotates the physics velocity vector.
export default function AirplaneModel() {
  const scene = useCityModel('airplane1');
  const { scale, yOffset } = useFitLength(scene, AIRPLANE_TARGET_LENGTH);
  return (
    <primitive object={scene} scale={[scale, scale, scale]} position={[0, yOffset, 0]} />
  );
}
