export const SAVE_VERSION = 3;

export type WeaponId = 'handgun' | 'shotgun' | 'smg';

export type AmmoState = { magazine: number; reserve: number };

export type WantedState = {
  heat: number;
  lastCrimeAt: number;
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
