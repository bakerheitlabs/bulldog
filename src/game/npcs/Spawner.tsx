import { useMemo } from 'react';
import DrivenCar from './DrivenCar';
import Pedestrian from './Pedestrian';

const PED_COUNT = 18;
const CAR_COUNT = 6;

export default function Spawner() {
  const peds = useMemo(() => Array.from({ length: PED_COUNT }, (_, i) => i), []);
  const cars = useMemo(() => Array.from({ length: CAR_COUNT }, (_, i) => i), []);
  return (
    <group>
      {peds.map((i) => (
        <Pedestrian key={`ped_${i}`} seed={i} />
      ))}
      {cars.map((i) => (
        <DrivenCar key={`car_${i}`} seed={i + 100} />
      ))}
    </group>
  );
}
