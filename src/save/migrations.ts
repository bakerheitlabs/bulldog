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
  2: (raw) => ({
    ...raw,
    version: 3,
    game: {
      ...raw.game,
      // Default loaded saves to 8:00 AM in-game so old slots come back to a
      // bright morning rather than midnight darkness.
      time: { seconds: 8 * 3600 },
    },
  }),
  3: (raw) => ({
    ...raw,
    version: 4,
    game: {
      ...raw.game,
      // Default loaded saves to clear weather; players can switch via the
      // dev console or future weather-control UI.
      weather: { type: 'sunny' },
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
