import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { clearPrompt, setPrompt } from './interactionState';
import { getLightSwitchPosition } from '@/game/world/churchLighting';

// Tight radius — switch is wall-mounted, so the player should be standing
// right in front of it before the prompt appears. Same range as the podium.
const RANGE = 2.5;
const PROMPT_ID = 'church-lightswitch';

export default function ChurchLightSwitch({ onOpen }: { onOpen: () => void }) {
  useFrame(() => {
    const pos = getLightSwitchPosition();
    if (!pos) {
      clearPrompt(PROMPT_ID);
      return;
    }
    if (useVehicleStore.getState().drivenCarId) {
      clearPrompt(PROMPT_ID);
      return;
    }
    const player = useGameStore.getState().player.position;
    const dx = player[0] - pos.x;
    const dz = player[2] - pos.z;
    if (dx * dx + dz * dz < RANGE * RANGE) {
      setPrompt({
        id: PROMPT_ID,
        label: 'Press E for lights',
        onActivate: onOpen,
      });
    } else {
      clearPrompt(PROMPT_ID);
    }
  });

  return null;
}
