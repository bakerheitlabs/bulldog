// Module-level mirror of the local player's animation action and yaw,
// updated by Player.tsx each frame and read by the multiplayer pose emitter.
//
// Why not gameStore: the action enum changes most frames the player moves,
// and routing it through zustand triggers re-renders across every subscriber.
// The mirror is read by useFrame consumers that only need the current value.
//
// Yaw lives here too because gameStore's player.rotationY updates are a
// React-store write — fine for HUD, wasteful for per-frame net emission.

import type { CharacterAction } from '@/game/characters/CharacterModel';

let _action: CharacterAction = 'idle';
let _yaw = 0;

export function setLocalAction(a: CharacterAction): void {
  _action = a;
}

export function readLocalAction(): CharacterAction {
  return _action;
}

export function setLocalYaw(y: number): void {
  _yaw = y;
}

export function readLocalYaw(): number {
  return _yaw;
}
