import { useEffect } from 'react';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from './vehicleState';
import { findNearestVehicle } from './vehicleRegistry';
import { findNearestAirplane } from '@/game/airplanes/airplaneRegistry';
import { ENTER_RANGE as PLANE_ENTER_RANGE } from '@/game/airplanes/airplaneConstants';
import { useNetStore } from '@/multiplayer/netStore';

const CAR_ENTER_RANGE = 3.5;

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
      const { drivenCarId, drivenPlaneId, enterCar, exitCar, enterPlane, exitPlane } =
        useVehicleStore.getState();
      const netState = useNetStore.getState();
      const inMp = netState.inGame;
      if (drivenCarId) {
        if (inMp) netState.requestExitCar();
        else exitCar();
        return;
      }
      if (drivenPlaneId) {
        // Plane MP sync ships in a later phase — exit locally for now.
        exitPlane();
        return;
      }
      const player = useGameStore.getState().player.position;
      const playerXZ = { x: player[0], z: player[2] };
      // Prefer the closer of the two — if you walk between a parked car and
      // an airplane, whichever you're physically nearer to wins. Planes have
      // a wider entry radius (8m vs 3.5m) because their fuselages are huge.
      const nearestCar = findNearestVehicle(playerXZ, CAR_ENTER_RANGE);
      const nearestPlane = findNearestAirplane(playerXZ, PLANE_ENTER_RANGE);
      if (nearestPlane && (!nearestCar || nearestPlane.dist < nearestCar.dist)) {
        // Planes aren't synced over the network in Phase 3; entering one in
        // an MP session is local-only — others won't see it. Still allow it
        // so airport interactions stay functional.
        enterPlane(nearestPlane.entry.id);
        return;
      }
      if (nearestCar) {
        if (inMp) netState.requestEnterCar(nearestCar.entry.id);
        else enterCar(nearestCar.entry.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
