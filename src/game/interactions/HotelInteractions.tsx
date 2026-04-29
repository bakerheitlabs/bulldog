import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { useGameStore, hotelRoomActive } from '@/state/gameStore';
import {
  getHotelLayout,
  HOTEL_TIERS,
  suiteFloorY,
} from '@/game/world/buildings/hotelTiers';
import HotelFrontDesk from './HotelFrontDesk';
import HotelSuite from '@/game/world/buildings/HotelSuite';
import { startElevator } from '@/game/world/buildings/elevatorState';

export default function HotelInteractions({
  onOpenRent,
  onOpenSleep,
  onOpenStash,
  onSave,
}: {
  onOpenRent: () => void;
  onOpenSleep: () => void;
  onOpenStash: () => void;
  onSave: () => void;
}) {
  const layout = useMemo(() => getHotelLayout(), []);
  const room = useGameStore((s) => s.properties.hotelRoom);
  const isActive = useGameStore(hotelRoomActive);

  if (!layout) return null;

  const activeRoomTier = isActive && room ? room.roomId : null;
  const activeY = activeRoomTier
    ? suiteFloorY(HOTEL_TIERS[activeRoomTier].floor)
    : null;

  // Suite arrival position: center of the suite, slightly south of the
  // elevator door so the player walks out into the room rather than back
  // into the elevator sensor.
  const suiteArrival: [number, number, number] | null =
    activeRoomTier && activeY != null
      ? [layout.center.x, activeY + 1, layout.center.z - HOTEL_TIERS[activeRoomTier].size.d / 2 + 2.5]
      : null;

  return (
    <group>
      <HotelFrontDesk
        deskX={layout.desk.x}
        deskZ={layout.desk.z}
        onOpenRent={onOpenRent}
      />

      {/* Lobby elevator-up sensors. The two pads are decorative meshes in
          Hotel.tsx; here we add an invisible sensor in front of each so the
          player can walk into either to ride up. Locked when no rental. */}
      {layout.lobbyElevators.map((pad, i) => (
        <RigidBody key={`lobby_elev_${i}`} type="fixed" colliders={false}>
          <CuboidCollider
            args={[0.5, 1, 0.5]}
            position={[pad.x, 1, pad.z + 0.7]}
            sensor
            onIntersectionEnter={(payload) => {
              if (!payload.rigidBody || payload.rigidBody.bodyType() !== 0) return;
              if (suiteArrival) {
                startElevator({
                  targetPos: suiteArrival,
                  label: `Floor ${HOTEL_TIERS[activeRoomTier!].floor}`,
                });
              }
              // No active rental → silently ignore. The front desk prompt
              // tells the player they need to check in first; we don't
              // want a "wrong floor" buzzer effect on a casual lobby walk.
            }}
          />
        </RigidBody>
      ))}

      {activeRoomTier && activeY != null && (
        <HotelSuite
          centerX={layout.center.x}
          centerZ={layout.center.z}
          y={activeY}
          tier={activeRoomTier}
          lobbyEntryPos={layout.lobbyEntry}
          onOpenSleep={onOpenSleep}
          onOpenStash={onOpenStash}
          onSave={onSave}
        />
      )}
    </group>
  );
}
