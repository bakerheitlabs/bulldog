import { useFrame } from '@react-three/fiber';
import { useGameStore, hotelRoomActive } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { clearPrompt, setPrompt } from './interactionState';
import { formatDate } from '@/game/world/gameDate';

const RANGE = 3.5;
const PROMPT_ID = 'hotel-desk';

export default function HotelFrontDesk({
  deskX,
  deskZ,
  onOpenRent,
}: {
  deskX: number;
  deskZ: number;
  onOpenRent: () => void;
}) {
  useFrame(() => {
    if (useVehicleStore.getState().drivenCarId) {
      clearPrompt(PROMPT_ID);
      return;
    }
    const s = useGameStore.getState();
    const pp = s.player.position;
    const dx = pp[0] - deskX;
    const dz = pp[2] - deskZ;
    if (dx * dx + dz * dz >= RANGE * RANGE) {
      clearPrompt(PROMPT_ID);
      return;
    }
    if (hotelRoomActive(s)) {
      const room = s.properties.hotelRoom!;
      // Show the rental status when an active room exists. The desk re-opens
      // the rent modal so players can extend or change tier from one prompt.
      setPrompt({
        id: PROMPT_ID,
        label: `Press E — ${tierLabel(room.roomId)}, expires ${formatDate(room.expires)}`,
        onActivate: onOpenRent,
      });
    } else {
      setPrompt({
        id: PROMPT_ID,
        label: 'Press E to check in',
        onActivate: onOpenRent,
      });
    }
  });

  return null;
}

function tierLabel(tier: string): string {
  switch (tier) {
    case 'standard':
      return 'Standard suite';
    case 'deluxe':
      return 'Deluxe suite';
    case 'penthouse':
      return 'Penthouse';
    default:
      return 'Suite';
  }
}
