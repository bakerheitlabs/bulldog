import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from './vehicleState';
import { findNearestVehicle } from './vehicleRegistry';
import { clearPrompt, setPrompt } from '@/game/interactions/interactionState';

const ENTER_RANGE = 3.5;
const PROMPT_ID = 'vehicle_enter';

export function useVehicleInteraction(enabled: boolean) {
  useFrame(() => {
    if (!enabled) {
      clearPrompt(PROMPT_ID);
      return;
    }
    const { drivenCarId, enterCar, exitCar } = useVehicleStore.getState();
    if (drivenCarId) {
      setPrompt({
        id: PROMPT_ID,
        label: 'Press E to exit',
        onActivate: () => exitCar(),
      });
      return;
    }
    const player = useGameStore.getState().player.position;
    const nearest = findNearestVehicle({ x: player[0], z: player[2] }, ENTER_RANGE);
    if (nearest) {
      setPrompt({
        id: PROMPT_ID,
        label: 'Press E to drive',
        onActivate: () => enterCar(nearest.entry.id),
      });
    } else {
      clearPrompt(PROMPT_ID);
    }
  });
}
