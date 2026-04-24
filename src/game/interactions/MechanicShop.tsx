import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { findCellByTag, SIDEWALK_WIDTH, cellBounds } from '@/game/world/cityLayout';
import { readDrivenCarPos, useVehicleStore } from '@/game/vehicles/vehicleState';
import { COLORS } from '@/game/vehicles/DrivableCars';

function initialColorFor(id: string): string {
  // Mirror DrivableCars: `car_N` → COLORS[N % COLORS.length].
  const n = Number.parseInt(id.split('_')[1] ?? '0', 10);
  return COLORS[(Number.isFinite(n) ? n : 0) % COLORS.length];
}

function pickDifferentColor(current: string): string {
  const options = COLORS.filter((c) => c !== current);
  const pool = options.length > 0 ? options : COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function MechanicShop() {
  const cell = findCellByTag('mechanic');

  const bay = useMemo(() => {
    if (!cell) return null;
    const b = cellBounds(cell.col, cell.row);
    return {
      minX: b.minX + SIDEWALK_WIDTH,
      maxX: b.maxX - SIDEWALK_WIDTH,
      minZ: b.minZ + SIDEWALK_WIDTH,
      maxZ: b.maxZ - SIDEWALK_WIDTH,
    };
  }, [cell]);

  // Shared with the keydown handler — updated each frame so P only fires
  // when the driven car is currently inside the bay.
  const carInBayRef = useRef(false);

  useFrame(() => {
    if (!bay) {
      carInBayRef.current = false;
      return;
    }
    const drivenId = useVehicleStore.getState().drivenCarId;
    if (!drivenId) {
      carInBayRef.current = false;
      return;
    }
    const pos = readDrivenCarPos();
    if (!pos) {
      carInBayRef.current = false;
      return;
    }
    carInBayRef.current =
      pos.x >= bay.minX && pos.x <= bay.maxX && pos.z >= bay.minZ && pos.z <= bay.maxZ;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP') return;
      const state = useVehicleStore.getState();
      const id = state.drivenCarId;
      console.log('[mechanic] P pressed', {
        drivenId: id,
        inBay: carInBayRef.current,
        bay,
        carPos: readDrivenCarPos()?.toArray(),
      });
      if (!carInBayRef.current) return;
      if (!id) return;
      const current = state.carColors[id] ?? initialColorFor(id);
      const next = pickDifferentColor(current);
      console.log('[mechanic] repaint', id, current, '->', next);
      state.setCarColor(id, next);
      state.resetCarDamage(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bay]);

  return null;
}
