export const SAVE_VERSION = 7;

export type WeaponId = 'handgun' | 'shotgun' | 'smg';

export type AmmoState = { magazine: number; reserve: number };

export type WantedState = {
  heat: number;
  lastCrimeAt: number;
};

export const WEATHER_TYPES = ['sunny', 'cloudy', 'rain', 'storm'] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];

export const HOTEL_ROOM_TIERS = ['standard', 'deluxe', 'penthouse'] as const;
export type HotelRoomTier = (typeof HOTEL_ROOM_TIERS)[number];

export type HotelRoomState = {
  roomId: HotelRoomTier;
  // In-game date AT/AFTER which the rental expires. Cleared when the world
  // clock crosses this date.
  expires: { year: number; month: number; day: number };
  stash: { weapons: WeaponId[]; cash: number };
};

export type GameStoreSnapshot = {
  player: {
    position: [number, number, number];
    rotationY: number;
    health: number;
    money: number;
  };
  inventory: {
    weapons: WeaponId[];
    equipped: WeaponId | null;
    ammo: Partial<Record<WeaponId, AmmoState>>;
  };
  world: {
    destroyedTargets: string[];
  };
  wanted: WantedState;
  time: {
    // Seconds since in-game midnight (0..86400). World time runs at 30× real
    // time (1 in-game hour = 2 real minutes), driven by Game.tsx's tick loop.
    seconds: number;
    // In-world Gregorian date. Day-of-week is derived (see gameDate.ts).
    year: number;
    month: number; // 1..12
    day: number; // 1..31
  };
  weather: {
    type: WeatherType;
  };
  stocks: {
    // Current price + bounded recent history per symbol.
    prices: Record<string, { price: number; history: number[] }>;
    // Player holdings, lazy-created on first buy. Both fields hard-zero
    // when shares hit zero so callers can safely read avgCost.
    holdings: Record<string, { shares: number; avgCost: number }>;
    // Game-seconds accumulated since the last price tick. Drains in
    // `tickStocks` when it reaches TICK_INTERVAL_GAME_SEC.
    elapsedSinceLastTick: number;
    // Persisted mulberry32 state so save→load is deterministic.
    rngState: number;
  };
  properties: {
    hotelRoom: HotelRoomState | null;
  };
  meta: {
    startedAt: number;
    playtimeMs: number;
  };
};

export type SaveData = {
  version: number;
  savedAt: number;
  game: GameStoreSnapshot;
};

export type SaveSlotMeta = {
  id: string;
  name: string;
  savedAt: number;
  playtimeMs: number;
};
