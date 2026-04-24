import { create } from 'zustand';
import { WEAPONS } from '@/game/weapons/weapons';
import type { GameStoreSnapshot, WeaponId } from '@/save/schema';

const PLAYER_START_POS: [number, number, number] = [0, 1, 0];
const STARTING_MONEY = 1500;
const STARTING_HEALTH = 100;

type GameState = GameStoreSnapshot & {
  godMode: boolean;
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
  bumpHeat: (amount: number) => void;
  clearWanted: () => void;
  tickWanted: (deltaMs: number) => void;
  setGodMode: (on: boolean) => void;
  setHealth: (hp: number) => void;
  setAmmoReserve: (id: WeaponId, reserve: number) => void;
  setWantedStars: (stars: number) => void;
};

export const HEAT_MAX = 100;
export const HEAT_PER_STAR = HEAT_MAX / 5;
const HEAT_DECAY_PER_SEC = 3;
const HEAT_COOLDOWN_MS = 4000;

export function starsFromHeat(heat: number): number {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / HEAT_PER_STAR));
}

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
    wanted: { heat: 0, lastCrimeAt: 0 },
    meta: { startedAt: Date.now(), playtimeMs: 0 },
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialSnapshot(),
  godMode: false,
  reset: () => set({ ...initialSnapshot(), godMode: false }),
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
      wanted: { ...s.wanted },
      meta: { ...s.meta },
    };
  },
  load: (snap) => set({ ...snap }),
  setPlayerTransform: (position, rotationY) =>
    set((s) => ({ player: { ...s.player, position, rotationY } })),
  damagePlayer: (amount) =>
    set((s) => {
      if (s.godMode) return {};
      return { player: { ...s.player, health: Math.max(0, s.player.health - amount) } };
    }),
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
      if (s.godMode) return {};
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
  bumpHeat: (amount) =>
    set((s) => ({
      wanted: {
        heat: Math.min(HEAT_MAX, s.wanted.heat + amount),
        lastCrimeAt: Date.now(),
      },
    })),
  clearWanted: () => set({ wanted: { heat: 0, lastCrimeAt: 0 } }),
  tickWanted: (deltaMs) =>
    set((s) => {
      if (s.wanted.heat <= 0) return {};
      const sinceCrime = Date.now() - s.wanted.lastCrimeAt;
      if (sinceCrime < HEAT_COOLDOWN_MS) return {};
      const next = Math.max(0, s.wanted.heat - (HEAT_DECAY_PER_SEC * deltaMs) / 1000);
      if (next === s.wanted.heat) return {};
      return { wanted: { ...s.wanted, heat: next } };
    }),
  setGodMode: (on) => set({ godMode: on }),
  setHealth: (hp) =>
    set((s) => ({ player: { ...s.player, health: Math.max(0, Math.min(100, Math.round(hp))) } })),
  setAmmoReserve: (id, reserve) =>
    set((s) => {
      const def = WEAPONS[id];
      const r = Math.max(0, Math.round(reserve));
      const hasWeapon = s.inventory.weapons.includes(id);
      const cur = s.inventory.ammo[id];
      const nextEntry = cur
        ? { magazine: def.magazine, reserve: r }
        : { magazine: def.magazine, reserve: r };
      return {
        inventory: {
          weapons: hasWeapon ? s.inventory.weapons : [...s.inventory.weapons, id],
          equipped: s.inventory.equipped ?? id,
          ammo: { ...s.inventory.ammo, [id]: nextEntry },
        },
      };
    }),
  setWantedStars: (stars) =>
    set(() => {
      const n = Math.max(0, Math.min(5, Math.round(stars)));
      if (n === 0) return { wanted: { heat: 0, lastCrimeAt: 0 } };
      return { wanted: { heat: n * HEAT_PER_STAR, lastCrimeAt: Date.now() } };
    }),
}));
