import { SAVE_VERSION, type SaveData } from './schema';
import { STOCKS } from '@/game/world/stocks';

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
  4: (raw) => ({
    ...raw,
    version: 5,
    game: {
      ...raw.game,
      time: {
        seconds: raw.game?.time?.seconds ?? 8 * 3600,
        // Halloween 2020 (Saturday) — game start date introduced with v5.
        year: 2020,
        month: 10,
        day: 31,
      },
    },
  }),
  5: (raw) => {
    const prices: Record<string, { price: number; history: number[] }> = {};
    for (const s of STOCKS) {
      prices[s.symbol] = { price: s.basePrice, history: [s.basePrice] };
    }
    return {
      ...raw,
      version: 6,
      game: {
        ...raw.game,
        stocks: {
          prices,
          holdings: {},
          elapsedSinceLastTick: 0,
          // Each save gets its own price walk. Same range as the weather
          // schedule's seed (`(Math.random() * 0x7fffffff) >>> 0`).
          rngState: (Math.random() * 0x7fffffff) >>> 0,
        },
      },
    };
  },
  6: (raw) => ({
    ...raw,
    version: 7,
    game: {
      ...raw.game,
      // Hotel rentals introduced in v7. Existing slots come back to no
      // active rental — the player must visit the front desk to check in.
      properties: { hotelRoom: null },
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
