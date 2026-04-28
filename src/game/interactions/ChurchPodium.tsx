import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { clearPrompt, setPrompt } from './interactionState';
import { pickRandomVerse, type Verse } from '@/game/world/bibleVerses';
import { getPodiumPosition } from '@/game/world/podiumPosition';

// Tight radius — the trigger is at the exact pulpit position now (published
// from Church.tsx once the GLB is mounted), so the player just needs to
// stand in front of the lectern.
const RANGE = 2.5;
const PROMPT_ID = 'church-podium';

export default function ChurchPodium({
  onOpen,
}: {
  onOpen: (verse: Verse) => void;
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
        label: 'Press E to read',
        onActivate: () => {
          pickRandomVerse()
            .then(onOpen)
            .catch((err) => {
              console.error('bible verse load failed', err);
            });
        },
      });
    } else {
      clearPrompt(PROMPT_ID);
    }
  });

  return null;
}
