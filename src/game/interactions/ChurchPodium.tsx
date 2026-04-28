import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { clearPrompt, setPrompt } from './interactionState';
import { getPodiumPosition } from '@/game/world/podiumPosition';

// Tight radius — the trigger is at the exact pulpit position now (published
// from Church.tsx once the GLB is mounted), so the player just needs to
// stand in front of the lectern.
const RANGE = 2.5;
const PROMPT_ID = 'church-podium';

export default function ChurchPodium({
  onOpenBibleReader,
}: {
  onOpenBibleReader: () => void;
}) {
  useFrame(() => {
    const pos = getPodiumPosition();
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
        label: 'Press E to read Bible',
        onActivate: onOpenBibleReader,
      });
    } else {
      clearPrompt(PROMPT_ID);
    }
  });

  return null;
}
