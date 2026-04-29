import { findCellByTag, SIDEWALK_WIDTH } from '@/game/world/cityLayout';
import type { HotelRoomTier } from '@/save/schema';

export const HOTEL_LOBBY_H = 5;
export const HOTEL_STORY_H = 3;

export type HotelTierDef = {
  id: HotelRoomTier;
  name: string;
  description: string;
  costPerDay: number;
  // Logical "floor number" shown to the player. The hotel's actual upper
  // levels are derived from `lobbyH` + `(floor - 2) * storyH`, kept in
  // hotelLayout() so the value here is a label, not a height.
  floor: number;
  // Footprint of the suite in meters (width along east-west, depth along
  // north-south). Penthouse is the largest.
  size: { w: number; d: number };
  // Carpet color tint — easy at-a-glance differentiator across tiers.
  carpetColor: string;
};

export const HOTEL_TIERS: Record<HotelRoomTier, HotelTierDef> = {
  standard: {
    id: 'standard',
    name: 'Standard Suite',
    description: 'A clean room with the basics. Bed, desk, wardrobe.',
    costPerDay: 150,
    floor: 4,
    size: { w: 8, d: 6 },
    carpetColor: '#5a3a2a',
  },
  deluxe: {
    id: 'deluxe',
    name: 'Deluxe Suite',
    description: 'Larger room with a city view and a king bed.',
    costPerDay: 300,
    floor: 8,
    size: { w: 11, d: 8 },
    carpetColor: '#5a2a3a',
  },
  penthouse: {
    id: 'penthouse',
    name: 'Penthouse',
    description: 'Top of the hotel. Sweeping views, premium furnishings.',
    costPerDay: 800,
    floor: 12,
    size: { w: 14, d: 10 },
    carpetColor: '#3a3a5a',
  },
};

export const HOTEL_TIER_ORDER: HotelRoomTier[] = ['standard', 'deluxe', 'penthouse'];

// Compute the suite floor altitude from its declared floor number plus the
// hotel's lobby height + story height. lobbyH is the lobby ceiling height
// in Hotel.tsx (y=0..lobbyH); each upper story is `storyH`. The first upper
// story is floor 2; floor N (N>=2) sits at y = lobbyH + (N - 2) * storyH.
export function suiteFloorY(
  floor: number,
  lobbyH: number = HOTEL_LOBBY_H,
  storyH: number = HOTEL_STORY_H,
): number {
  return lobbyH + Math.max(0, floor - 2) * storyH;
}

export type HotelLayout = {
  // Hotel center in world space.
  center: { x: number; z: number };
  // Lobby footprint after sidewalk margins (matches Hotel.tsx).
  w: number;
  d: number;
  // Position of the reception desk (north-south face of the west wall).
  desk: { x: number; z: number };
  // Position the player should arrive at when stepping out of an elevator
  // into the lobby — just south of the elevator bank, inside the lobby.
  lobbyEntry: [number, number, number];
  // Sensor footprint for the lobby elevator: stepping onto either elevator
  // pad triggers the up-ride.
  lobbyElevators: Array<{ x: number; z: number }>;
};

// Mirror Hotel.tsx's interior arithmetic so interaction layers can place
// triggers without coupling to Hotel's render tree. Returns null if the
// hotel cell isn't in the city grid (e.g. on Island 3 only the city grids
// that include a 'hotel' tag will resolve here).
export function getHotelLayout(): HotelLayout | null {
  const cell = findCellByTag('hotel');
  if (!cell) return null;
  const x = cell.center[0];
  const z = cell.center[2];
  const w = cell.size.width - SIDEWALK_WIDTH * 2;
  const d = cell.size.depth - SIDEWALK_WIDTH * 2;
  const wallT = 0.5;
  const innerW = -w / 2 + wallT;
  const innerN = -d / 2 + wallT;
  // Reception desk: against the west wall, centered north-south. Mirrors
  // Hotel.tsx's `deskX = innerW + deskD/2 + 0.3`, deskZ = z.
  const deskD = 1.2;
  const desk = { x: x + innerW + deskD / 2 + 0.3, z };
  // Elevator bank: two pads at x ± 1.4, against the north interior wall.
  const elevatorBaseZ = z + innerN + 0.05;
  const lobbyElevators = [
    { x: x - 1.4, z: elevatorBaseZ },
    { x: x + 1.4, z: elevatorBaseZ },
  ];
  // Lobby arrival point: a couple meters south of the elevators so the
  // player doesn't immediately re-trigger the up sensor on descent.
  const lobbyEntry: [number, number, number] = [x, 1, elevatorBaseZ + 2.5];
  return { center: { x, z }, w, d, desk, lobbyEntry, lobbyElevators };
}

