export const SAVE_VERSION = 1;

export type WeaponId = 'handgun' | 'shotgun';

export type AmmoState = { magazine: number; reserve: number };

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
