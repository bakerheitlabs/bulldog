import { useCityModel, useFitLength, type CarVariant } from '@/game/world/cityAssets';

const TARGET_LENGTH = 4;

export default function CarModel({ variant }: { variant: CarVariant }) {
  const scene = useCityModel(variant);
  const { scale, yOffset } = useFitLength(scene, TARGET_LENGTH);
  return <primitive object={scene} position={[0, yOffset - 0.45, 0]} scale={scale} />;
}
