import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { findCellByTag, SIDEWALK_WIDTH } from '@/game/world/cityLayout';
import { clearPrompt, setPrompt } from './interactionState';
import { useVehicleStore } from '@/game/vehicles/vehicleState';

const RANGE = 4.5;
const PROMPT_ID = 'gunstore';

export default function GunStoreCounter({ onOpen }: { onOpen: () => void }) {
  const cell = findCellByTag('gunstore');

  const counterPos = useMemo(() => {
    if (!cell) return new THREE.Vector3();
    const [x, , z] = cell.center;
    // East face of the gunstore building, on the sidewalk facing the road.
    const buildingHalfW = cell.size.width / 2 - SIDEWALK_WIDTH;
    const faceX = x + buildingHalfW + 1.5;
    return new THREE.Vector3(faceX, 0, z);
  }, [cell]);

  useFrame(() => {
    if (useVehicleStore.getState().drivenCarId) {
      clearPrompt(PROMPT_ID);
      return;
    }
    const player = useGameStore.getState().player.position;
    const dx = player[0] - counterPos.x;
    const dz = player[2] - counterPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < RANGE * RANGE) {
      setPrompt({
        id: PROMPT_ID,
        label: 'Press E to shop',
        onActivate: onOpen,
      });
    } else {
      clearPrompt(PROMPT_ID);
    }
  });

  if (!cell) return null;
  return (
    <group position={[counterPos.x, 0, counterPos.z]}>
      {/* counter base */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.2, 1.1, 3]} />
        <meshStandardMaterial color="#5b3a1a" />
      </mesh>
      {/* counter top */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[1.4, 0.1, 3.2]} />
        <meshStandardMaterial color="#2b1d10" />
      </mesh>
      {/* a couple of guns on display */}
      <mesh position={[0.1, 1.25, -0.6]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.15, 0.6, 0.2]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.1, 1.25, 0.6]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.15, 0.9, 0.18]} />
        <meshStandardMaterial color="#3a2a1a" />
      </mesh>
    </group>
  );
}
