import { useMemo } from 'react';
import DrivenCar from './DrivenCar';
import Pedestrian from './Pedestrian';
import Cop from './Cop';
import PoliceCruiser from './PoliceCruiser';
import { starsFromHeat, useGameStore } from '@/state/gameStore';

const PED_COUNT = 18;
const CAR_COUNT = 6;
const PATROL_COP_COUNT = 3;
const PATROL_CRUISER_COUNT = 2;

// Additional response foot-cops spawned near the player per wanted star.
// At 2+ stars, response cruisers stack on top of the patrol cruisers.
const RESPONSE_COP_COUNTS = [0, 2, 1, 2, 3, 4];
const RESPONSE_CRUISER_COUNTS = [0, 0, 1, 2, 3, 4];

export default function Spawner() {
  const peds = useMemo(() => Array.from({ length: PED_COUNT }, (_, i) => i), []);
  const cars = useMemo(() => Array.from({ length: CAR_COUNT }, (_, i) => i), []);
  const patrolCops = useMemo(
    () => Array.from({ length: PATROL_COP_COUNT }, (_, i) => i),
    [],
  );
  const patrolCruisers = useMemo(
    () => Array.from({ length: PATROL_CRUISER_COUNT }, (_, i) => i),
    [],
  );
  const heat = useGameStore((s) => s.wanted.heat);
  const stars = starsFromHeat(heat);
  const responseCount = RESPONSE_COP_COUNTS[stars] ?? 0;
  const responseCruiserCount = RESPONSE_CRUISER_COUNTS[stars] ?? 0;
  const responseCops = useMemo(
    () => Array.from({ length: responseCount }, (_, i) => i),
    [responseCount],
  );
  const responseCruisers = useMemo(
    () => Array.from({ length: responseCruiserCount }, (_, i) => i),
    [responseCruiserCount],
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
      {patrolCruisers.map((i) => (
        <PoliceCruiser key={`patrol_cruiser_${i}`} seed={i + 700} mode="patrol" />
      ))}
      {responseCops.map((i) => (
        <Cop key={`resp_${stars}_${i}`} seed={i + 500 + stars * 20} />
      ))}
      {responseCruisers.map((i) => (
        <PoliceCruiser
          key={`resp_cruiser_${stars}_${i}`}
          seed={i + 800 + stars * 30}
          mode="response"
        />
      ))}
    </group>
  );
}
