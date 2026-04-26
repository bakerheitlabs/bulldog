// Hand-authored airport data. The main airport sits ~700m west of the city
// grid and is reached by a long highway that hooks into the row-13 arterial
// at the city's west edge. Pure data — no Three.js imports. Renderer lives
// in AirportRegion.tsx.
//
// The airport's access highway is exposed as a Suburb so the existing
// SuburbRoads renderer (and CityMap minimap) handle it without duplication.
// Airport-specific structures (runway, taxiway, apron, terminal, tower,
// hangars, parked planes) are rendered by AirportRegion.tsx directly.
//
// Multi-airport support: this module owns only the *main* airport. Other
// airports (e.g. island 2's regional strip) live in their own modules and
// the full AIRPORTS list is aggregated in splineRegions.ts.

import { cellCenter, cellSize, type Vec3 } from './cityLayout';
import type { GridHandoff, Junction, SplineRoad, Suburb } from './suburbs';

// --- AirportSpec: the schema every airport conforms to ---

export type FlatRectArea = {
  centerX: number;
  centerZ: number;
  width: number; // x extent
  depth: number; // z extent
};

export type TerminalSpec = FlatRectArea & {
  height: number;
  color: string;
};

export type TowerSpec = {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  shaftHeight: number;
  cabinHeight: number;
  cabinWidth: number;
  color: string;
  cabinColor: string;
};

export type HangarSpec = {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
  // Which side the hangar door faces (apron side). Defaults to '-x' for the
  // main airport (apron is to the west of hangars).
  doorFacing?: '+x' | '-x' | '+z' | '-z';
};

export type ParkedPlaneSpec = {
  x: number;
  z: number;
  headingY: number;
};

// Long-axis direction of the runway (and aligned taxiway/apron). 'z' means
// the runway's `depth` field is its long axis (default — main airport uses
// this); 'x' means `width` is the long axis. Affects how the renderer lays
// out centerline dashes and threshold markings.
export type RunwayAxis = 'x' | 'z';

export type AirportSpec = {
  id: string;
  axis: RunwayAxis;
  pad: { minX: number; maxX: number; minZ: number; maxZ: number };
  parkingLot: FlatRectArea;
  terminal: TerminalSpec;
  tower: TowerSpec;
  hangars: HangarSpec[];
  apron: FlatRectArea;
  taxiway: FlatRectArea;
  runway: FlatRectArea;
  planes: ParkedPlaneSpec[];
  // Whether ScheduledFlight (the AI airliner) takes off/lands here. Only one
  // airport is the scheduled-flight home today; flightPath.ts is hard-coded
  // to the main airport's runway. See project memory: a flyable plane
  // iteration would generalize this.
  hostsScheduledFlight: boolean;
};

// --- Main airport ---

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

export const MAIN_AIRPORT_SUBURB: Suburb = {
  id: 'airport_access',
  junctions: [ENTRANCE_JUNCTION],
  handoffs: [HIGHWAY_HANDOFF],
  splines: [HIGHWAY_SPLINE],
};

// World-space coordinates (meters). Long axis = Z (north-south runway).
export const MAIN_AIRPORT: AirportSpec = {
  id: 'main_airport',
  axis: 'z',
  pad: {
    minX: -1140,
    maxX: -780,
    minZ: -340,
    maxZ: +340,
  },
  parkingLot: {
    centerX: -820,
    centerZ: 0,
    width: 50,
    depth: 80,
  },
  terminal: {
    centerX: -870,
    centerZ: 0,
    width: 30,
    depth: 80,
    height: 12,
    color: '#cfd2d6',
  },
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
    { centerX: -870, centerZ: 110, width: 40, depth: 50, height: 14, doorFacing: '-x' },
    { centerX: -870, centerZ: 180, width: 40, depth: 50, height: 14, doorFacing: '-x' },
  ],
  apron: { centerX: -940, centerZ: 0, width: 60, depth: 280 },
  taxiway: { centerX: -1000, centerZ: 0, width: 20, depth: 360 },
  runway: { centerX: -1080, centerZ: 0, width: 60, depth: 600 },
  planes: [
    { x: -940, z: -100, headingY: -Math.PI / 2 },
    { x: -940, z: 0, headingY: -Math.PI / 2 },
    { x: -940, z: +100, headingY: -Math.PI / 2 },
  ],
  hostsScheduledFlight: true,
};

// AABB of the main airport pad with a small margin. Used by landBounds.ts to
// size the main island. Other airports' bounds belong to their own islands.
export function getMainAirportPadBounds(): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const m = 30;
  return {
    minX: MAIN_AIRPORT.pad.minX - m,
    maxX: MAIN_AIRPORT.pad.maxX + m,
    minZ: MAIN_AIRPORT.pad.minZ - m,
    maxZ: MAIN_AIRPORT.pad.maxZ + m,
  };
}
