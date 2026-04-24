import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { findCellByTag, SIDEWALK_WIDTH } from '@/game/world/cityLayout';
import { clearPrompt, setPrompt } from './interactionState';
import { useVehicleStore } from '@/game/vehicles/vehicleState';

const RANGE = 4.5;
const PROMPT_ID = 'hospital';
export const HEAL_COST = 100;

export default function HospitalCounter() {
  const cell = findCellByTag('hospital');

  // Reception desk sits in the lobby, against the lobby wall on the north
  // side of the corridor opening. Must mirror HospitalInterior's deskX/deskZ.
  const doorPos = useMemo(() => {
    if (!cell) return new THREE.Vector3();
    const [x, , z] = cell.center;
    const interiorW = cell.size.width - SIDEWALK_WIDTH * 2;
    const lobbyWallX = x + interiorW / 2 - 7;
    const deskX = lobbyWallX + 0.8;
    const deskZ = z - 2.5;
    return new THREE.Vector3(deskX, 0, deskZ);
  }, [cell]);

  useFrame(() => {
    if (useVehicleStore.getState().drivenCarId) {
      clearPrompt(PROMPT_ID);
      return;
    }
    const state = useGameStore.getState();
    const player = state.player;
    const dx = player.position[0] - doorPos.x;
    const dz = player.position[2] - doorPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= RANGE * RANGE) {
      clearPrompt(PROMPT_ID);
      return;
    }
    if (player.health >= 100) {
      clearPrompt(PROMPT_ID);
      return;
    }
    setPrompt({
      id: PROMPT_ID,
      label: `Press E to heal — $${HEAL_COST}`,
      onActivate: () => {
        const s = useGameStore.getState();
        if (s.player.money < HEAL_COST) return;
        if (s.player.health >= 100) return;
        s.addMoney(-HEAL_COST);
        s.setHealth(100);
      },
    });
  });

  // The desk itself is drawn by HospitalInterior; this component only owns the
  // interaction prompt, so there's nothing to render here.
  return null;
}
