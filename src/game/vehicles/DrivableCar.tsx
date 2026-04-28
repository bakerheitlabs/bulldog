import { useRef } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import type { CarVariant } from './vehicleIdentity';
import Car from './Car';

type Props = {
  id: string;
  initialPos: [number, number, number];
  initialRotY: number;
  color: string;
  variant: CarVariant;
  paused: boolean;
};

export default function DrivableCar({
  id,
  initialPos,
  initialRotY,
  color,
  variant,
  paused,
}: Props) {
  const rigid = useRef<RapierRigidBody | null>(null);
  return (
    <Car
      id={id}
      rigidRef={rigid}
      initialPos={initialPos}
      initialRotY={initialRotY}
      variant={variant}
      fallbackColor={color}
      paused={paused}
    />
  );
}
