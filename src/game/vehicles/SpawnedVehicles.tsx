import { useRef } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import Car from './Car';
import type { VehicleIdentityKey } from './vehicleIdentity';
import { useSpawnedVehiclesStore } from './spawnedVehiclesState';

function SpawnedVehicle({
  id,
  variant,
  pos,
  rotY,
  paused,
}: {
  id: string;
  variant: VehicleIdentityKey;
  pos: [number, number, number];
  rotY: number;
  paused: boolean;
}) {
  const rigid = useRef<RapierRigidBody | null>(null);
  return (
    <Car
      id={id}
      rigidRef={rigid}
      initialPos={pos}
      initialRotY={rotY}
      variant={variant}
      paused={paused}
    />
  );
}

export default function SpawnedVehicles({ paused }: { paused: boolean }) {
  const vehicles = useSpawnedVehiclesStore((s) => s.vehicles);
  return (
    <>
      {vehicles.map((v) => (
        <SpawnedVehicle
          key={v.key}
          id={`spawn_car_${v.key}`}
          variant={v.variant}
          pos={v.pos}
          rotY={v.rotY}
          paused={paused}
        />
      ))}
    </>
  );
}
