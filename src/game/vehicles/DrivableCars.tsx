import { useMemo } from 'react';
import DrivableCar from './DrivableCar';
import { PARKING_SLOTS } from '@/game/world/cityLayout';
import { pickCarVariantBySeed } from '@/game/world/cityAssets';

const COLORS = ['#b04a3f', '#3f6cb0', '#3fa362', '#c9a23a', '#7a4ab0', '#444c5e'];

export default function DrivableCars({ paused }: { paused: boolean }) {
  const cars = useMemo(
    () =>
      PARKING_SLOTS.map((slot, i) => ({
        id: `car_${i}`,
        pos: slot.pos,
        rotY: slot.rotationY,
        color: COLORS[i % COLORS.length],
        variant: pickCarVariantBySeed(i),
      })),
    [],
  );

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
