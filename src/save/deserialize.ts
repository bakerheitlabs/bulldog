import { useGameStore } from '@/state/gameStore';
import { migrate } from './migrations';
import type { SaveData } from './schema';

export function deserialize(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object' || typeof (raw as any).version !== 'number') {
    throw new Error('Invalid save: missing version');
  }
  const data = migrate(raw);
  useGameStore.getState().load(data.game);
  return data;
}
