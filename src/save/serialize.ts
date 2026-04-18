import { useGameStore } from '@/state/gameStore';
import { SAVE_VERSION, type SaveData } from './schema';

export function serialize(): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    game: useGameStore.getState().snapshot(),
  };
}
