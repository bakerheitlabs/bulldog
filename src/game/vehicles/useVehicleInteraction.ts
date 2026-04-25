import { useEffect } from 'react';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from './vehicleState';
import { findNearestVehicle } from './vehicleRegistry';

const ENTER_RANGE = 3.5;

// Vehicles deliberately don't surface an interaction prompt — entering and
// exiting is invisible muscle memory once the player knows the key. Instead
// of plugging into `interactionState`, we own the E keypress directly so we
// don't conflict with the shared prompt slot used by shops/hospitals.
export function useVehicleInteraction(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const { drivenCarId, enterCar, exitCar } = useVehicleStore.getState();
      if (drivenCarId) {
        exitCar();
        return;
      }
      const player = useGameStore.getState().player.position;
      const nearest = findNearestVehicle(
        { x: player[0], z: player[2] },
        ENTER_RANGE,
      );
      if (nearest) enterCar(nearest.entry.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
