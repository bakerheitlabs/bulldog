// Hand-authored airport region. Sits ~700m west of the city grid and is
// reached by a long highway that hooks into the row-13 arterial at the city's
// west edge. Pure data — no Three.js imports. Renderer lives in Airport.tsx.
//
// The airport's access highway is exposed as a Suburb so the existing
// SuburbRoads renderer (and CityMap minimap) handle it without duplication.
// Airport-specific structures (runway, taxiway, apron, terminal, tower,
// hangars, parked planes) are rendered by Airport.tsx directly.

import { cellCenter, cellSize, type Vec3 } from './cityLayout';
import type { GridHandoff, Junction, SplineRoad, Suburb } from './suburbs';

// --- Highway / access road (Suburb-shaped so SuburbRoads renders it) ---

// Anchor at the west face of cell [0, 13] — the row-13 arterial at the
// western edge of the grid. The highway emerges directly from the arterial
// asphalt and runs west to the airport.
const [_ax, , _az] = cellCenter(0, 13);
const { width: _cellW } = cellSize(0, 13);
const HWY_ENTRY_X = _ax - _cellW / 2; // west face of the edge cell
const HWY_ENTRY_Z = _az;

// Airport entrance: where the highway dies into the terminal parking lot
// approach. Roughly 420m west of the city.
const HWY_END_X = -800;
const HWY_END_Z = HWY_ENTRY_Z;

const HIGHWAY_WIDTH = 12; // wider than city streets — reads as a highway

// Gentle curve mid-highway so the road reads as a real route, not a stripe.
const _midA: Vec3 = [HWY_ENTRY_X - 120, 0, HWY_ENTRY_Z - 8];
const _midB: Vec3 = [HWY_ENTRY_X - 280, 0, HWY_ENTRY_Z + 8];

// Junction at the airport entrance — a small disc reads as the place where
// the highway terminates into the parking apron.
const ENTRANCE_JUNCTION: Junction = {
  id: 'apt_entry',
  pos: [HWY_END_X, 0, HWY_END_Z],
  kind: 'T',
  radius: 9,
};

const HIGHWAY_HANDOFF: GridHandoff = {
  id: 'apt_west_entry',
  pos: [HWY_ENTRY_X, 0, HWY_ENTRY_Z],
};

const HIGHWAY_SPLINE: SplineRoad = {
  id: 'apt_highway',
  controls: [
    [HWY_ENTRY_X, 0, HWY_ENTRY_Z],
    [HWY_ENTRY_X - 30, 0, HWY_ENTRY_Z],
    _midA,
    _midB,
    [HWY_END_X + 40, 0, HWY_END_Z],
    [HWY_END_X, 0, HWY_END_Z],
  ],
  width: HIGHWAY_WIDTH,
  start: { kind: 'gridHandoff', id: 'apt_west_entry' },
  end: { kind: 'junction', id: 'apt_entry' },
};

export const AIRPORT_SUBURB: Suburb = {
  id: 'airport_access',
  junctions: [ENTRANCE_JUNCTION],
  handoffs: [HIGHWAY_HANDOFF],
  splines: [HIGHWAY_SPLINE],
};

// --- Airport structures (rendered by Airport.tsx) ---

// All coordinates in world space (meters).
export const AIRPORT = {
  // Flat ground covering the whole airport footprint. Painted asphalt-grey so
  // the airport reads as one developed parcel rather than buildings on grass.
  pad: {
    minX: -1140,
    maxX: -780,
    minZ: -340,
    maxZ: +340,
  },
  parkingLot: {
    centerX: -820,
    centerZ: 0,
    width: 50, // x extent
    depth: 80, // z extent
  },
  // Terminal building — long, low, parallel to runway.
  terminal: {
    centerX: -870,
    centerZ: 0,
    width: 30, // x extent (depth, away from runway)
    depth: 80, // z extent (along runway)
    height: 12,
    color: '#cfd2d6',
  },
  // Air traffic control tower south of the terminal.
  tower: {
    centerX: -870,
    centerZ: -110,
    width: 10,
    depth: 10,
    shaftHeight: 22,
    cabinHeight: 6,
    cabinWidth: 16,
    color: '#bfc1c5',
    cabinColor: '#1d2530',
  },
  hangars: [
    { centerX: -870, centerZ: 110, width: 40, depth: 50, height: 14 },
    { centerX: -870, centerZ: 180, width: 40, depth: 50, height: 14 },
  ],
  // Apron between terminal and taxiway — flat asphalt where planes park.
  apron: {
    centerX: -940,
    centerZ: 0,
    width: 60,
    depth: 280,
  },
  taxiway: {
    centerX: -1000,
    centerZ: 0,
    width: 20,
    depth: 360,
  },
  runway: {
    centerX: -1080,
    centerZ: 0,
    width: 60,
    depth: 600,
  },
  // Static parked planes facing east toward the terminal.
  planes: [
    { x: -940, z: -100, headingY: -Math.PI / 2 },
    { x: -940, z: 0, headingY: -Math.PI / 2 },
    { x: -940, z: +100, headingY: -Math.PI / 2 },
  ],
} as const;

export function getAirportBounds(): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  // Pad plus a margin so the minimap viewport doesn't clip runway edges.
  // The highway from city edge to pad's east face fits inside the city's own
  // bounds aggregation, so we only need to cover the airport pad here.
  const m = 30;
  return {
    minX: AIRPORT.pad.minX - m,
    maxX: AIRPORT.pad.maxX + m,
    minZ: AIRPORT.pad.minZ - m,
    maxZ: AIRPORT.pad.maxZ + m,
  };
}
