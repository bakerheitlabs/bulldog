import { useMemo } from 'react';
import DrivenCar from './DrivenCar';
import Pedestrian from './Pedestrian';
import Cop from './Cop';
import { starsFromHeat, useGameStore } from '@/state/gameStore';

const PED_COUNT = 18;
const CAR_COUNT = 6;
const PATROL_COP_COUNT = 3;

// Additional response cops spawned near the player per wanted star.
const RESPONSE_COP_COUNTS = [0, 2, 3, 5, 7, 9];

export default function Spawner() {
  const peds = useMemo(() => Array.from({ length: PED_COUNT }, (_, i) => i), []);
  const cars = useMemo(() => Array.from({ length: CAR_COUNT }, (_, i) => i), []);
  const patrolCops = useMemo(
    () => Array.from({ length: PATROL_COP_COUNT }, (_, i) => i),
    [],
  );
  const heat = useGameStore((s) => s.wanted.heat);
  const stars = starsFromHeat(heat);
  const responseCount = RESPONSE_COP_COUNTS[stars] ?? 0;
  const responseCops = useMemo(
    () => Array.from({ length: responseCount }, (_, i) => i),
    [responseCount],
  );

  return (
    <group>
      {peds.map((i) => (
        <Pedestrian key={`ped_${i}`} seed={i} />
      ))}
      {cars.map((i) => (
        <DrivenCar key={`car_${i}`} seed={i + 100} />
      ))}
      {patrolCops.map((i) => (
        <Cop key={`patrol_${i}`} seed={i + 400} patrol />
      ))}
      {responseCops.map((i) => (
        <Cop key={`resp_${stars}_${i}`} seed={i + 500 + stars * 20} />
      ))}
    </group>
  );
}
