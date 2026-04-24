import { useMemo } from 'react';
import DrivableCar from './DrivableCar';
import { PARKING_SLOTS } from '@/game/world/cityLayout';
import { pickCarVariantBySeed } from '@/game/world/cityAssets';

export const COLORS = ['#b04a3f', '#3f6cb0', '#3fa362', '#c9a23a', '#7a4ab0', '#444c5e'];
// Cap physical drivable cars — every parking slot as a rigid body tanks frame
// time at city-scale. Sample evenly across the slot list so cars spread over
// the whole map instead of clustering in the first few blocks.
const MAX_DRIVABLE_CARS = 32;

export default function DrivableCars({ paused }: { paused: boolean }) {
  const cars = useMemo(() => {
    const stride = Math.max(1, Math.floor(PARKING_SLOTS.length / MAX_DRIVABLE_CARS));
    const sampled: typeof PARKING_SLOTS = [];
    for (let i = 0; i < PARKING_SLOTS.length && sampled.length < MAX_DRIVABLE_CARS; i += stride) {
      sampled.push(PARKING_SLOTS[i]);
    }
    return sampled.map((slot, i) => ({
      id: `car_${i}`,
      pos: slot.pos,
      rotY: slot.rotationY,
      color: COLORS[i % COLORS.length],
      variant: pickCarVariantBySeed(i),
    }));
  }, []);

  return (
    <group>
      {cars.map((c) => (
        <DrivableCar
          key={c.id}
          id={c.id}
          initialPos={c.pos}
          initialRotY={c.rotY}
          color={c.color}
          variant={c.variant}
          paused={paused}
        />
      ))}
    </group>
  );
}
