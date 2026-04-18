import { create } from 'zustand';
import { WEAPONS } from '@/game/weapons/weapons';
import type { GameStoreSnapshot, WeaponId } from '@/save/schema';

const PLAYER_START_POS: [number, number, number] = [0, 1, 0];
const STARTING_MONEY = 1500;
const STARTING_HEALTH = 100;

type GameState = GameStoreSnapshot & {
  reset: () => void;
  snapshot: () => GameStoreSnapshot;
  load: (snap: GameStoreSnapshot) => void;
  setPlayerTransform: (position: [number, number, number], rotationY: number) => void;
  damagePlayer: (amount: number) => void;
  addMoney: (delta: number) => void;
  addWeapon: (id: WeaponId) => void;
  setEquipped: (id: WeaponId | null) => void;
  consumeAmmo: (id: WeaponId, n: number) => void;
  reloadWeapon: (id: WeaponId) => void;
  recordTargetHit: (targetId: string) => void;
  tickPlaytime: (deltaMs: number) => void;
};

function initialSnapshot(): GameStoreSnapshot {
  return {
    player: {
      position: [...PLAYER_START_POS] as [number, number, number],
      rotationY: 0,
      health: STARTING_HEALTH,
      money: STARTING_MONEY,
    },
    inventory: {
      weapons: [],
      equipped: null,
      ammo: {},
    },
    world: { destroyedTargets: [] },
    meta: { startedAt: Date.now(), playtimeMs: 0 },
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialSnapshot(),
  reset: () => set(initialSnapshot()),
  snapshot: () => {
    const s = get();
    return {
      player: { ...s.player, position: [...s.player.position] as [number, number, number] },
      inventory: {
        weapons: [...s.inventory.weapons],
        equipped: s.inventory.equipped,
        ammo: Object.fromEntries(
          Object.entries(s.inventory.ammo).map(([k, v]) => [k, { ...(v as any) }]),
        ) as GameStoreSnapshot['inventory']['ammo'],
      },
      world: { destroyedTargets: [...s.world.destroyedTargets] },
      meta: { ...s.meta },
    };
  },
  load: (snap) => set({ ...snap }),
  setPlayerTransform: (position, rotationY) =>
    set((s) => ({ player: { ...s.player, position, rotationY } })),
  damagePlayer: (amount) =>
    set((s) => ({ player: { ...s.player, health: Math.max(0, s.player.health - amount) } })),
  addMoney: (delta) => set((s) => ({ player: { ...s.player, money: s.player.money + delta } })),
  addWeapon: (id) =>
    set((s) => {
      if (s.inventory.weapons.includes(id)) return {};
      const def = WEAPONS[id];
      const ammo = {
        ...s.inventory.ammo,
        [id]: { magazine: def.magazine, reserve: def.magazine * 2 },
      };
      return {
        inventory: {
          weapons: [...s.inventory.weapons, id],
          equipped: s.inventory.equipped ?? id,
          ammo,
        },
      };
    }),
  setEquipped: (id) => set((s) => ({ inventory: { ...s.inventory, equipped: id } })),
  consumeAmmo: (id, n) =>
    set((s) => {
      const cur = s.inventory.ammo[id];
      if (!cur) return {};
      return {
        inventory: {
          ...s.inventory,
          ammo: { ...s.inventory.ammo, [id]: { ...cur, magazine: Math.max(0, cur.magazine - n) } },
        },
      };
    }),
  reloadWeapon: (id) =>
    set((s) => {
      const cur = s.inventory.ammo[id];
      if (!cur) return {};
      const def = WEAPONS[id];
      const need = def.magazine - cur.magazine;
      const take = Math.min(need, cur.reserve);
      if (take <= 0) return {};
      return {
        inventory: {
          ...s.inventory,
          ammo: {
            ...s.inventory.ammo,
            [id]: { magazine: cur.magazine + take, reserve: cur.reserve - take },
          },
        },
      };
    }),
  recordTargetHit: (targetId) =>
    set((s) =>
      s.world.destroyedTargets.includes(targetId)
        ? {}
        : { world: { ...s.world, destroyedTargets: [...s.world.destroyedTargets, targetId] } },
    ),
  tickPlaytime: (deltaMs) => set((s) => ({ meta: { ...s.meta, playtimeMs: s.meta.playtimeMs + deltaMs } })),
}));
