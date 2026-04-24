import type { WeaponId } from '@/save/schema';

export type WeaponDef = {
  name: string;
  price: number;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  magazine: number;
  projectileCount: number;
  spreadDeg: number;
  reloadMs: number;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  handgun: {
    name: 'Handgun',
    price: 250,
    damage: 20,
    range: 60,
    fireRate: 3,
    magazine: 12,
    projectileCount: 1,
    spreadDeg: 1.5,
    reloadMs: 1200,
  },
  shotgun: {
    name: 'Shotgun',
    price: 900,
    damage: 14,
    range: 25,
    fireRate: 1,
    magazine: 6,
    projectileCount: 8,
    spreadDeg: 8,
    reloadMs: 1800,
  },
  smg: {
    name: 'Submachine Gun',
    price: 1500,
    damage: 11,
    range: 45,
    fireRate: 10,
    magazine: 30,
    projectileCount: 1,
    spreadDeg: 3,
    reloadMs: 1600,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['handgun', 'shotgun', 'smg'];
export const WEAPON_HOTKEYS: Record<string, WeaponId> = {
  '1': 'handgun',
  '2': 'shotgun',
  '3': 'smg',
};
