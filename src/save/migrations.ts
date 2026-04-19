import { SAVE_VERSION, type SaveData } from './schema';

type Migration = (raw: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  1: (raw) => ({
    ...raw,
    version: 2,
    game: {
      ...raw.game,
      wanted: { heat: 0, lastCrimeAt: 0 },
    },
  }),
};

export function migrate(raw: any): SaveData {
  let current = raw;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) {
      throw new Error(`No migration registered from save version ${current.version}`);
    }
    current = step(current);
  }
  if (current.version !== SAVE_VERSION) {
    throw new Error(`Save version ${current.version} is newer than supported ${SAVE_VERSION}`);
  }
  return current as SaveData;
}
