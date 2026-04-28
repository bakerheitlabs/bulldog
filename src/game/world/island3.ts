// Island 3 — a smaller orthogonal-grid island east of the main city, connected
// to it by a drivable bridge. Uses the same `buildCityGrid` factory as the
// main island so the streets, blocks, sidewalks, traffic lights, and lane/ped
// graphs all read consistently between the two grids. Two unique landmarks
// (a stadium and a marina) distinguish it from the main island.
//
// Layout summary:
// - 13×13 grid centered at world ([1100, 0, ~main row-9 z]). Centering on the
//   bridge row keeps the bridge approximately straight in world Z.
// - Bridge attaches on the west via main island's east arterial row 9.
// - Stadium pinned at the central block; marina pinned near the north coast.

import {
  MAIN_CITY,
  buildCityGrid,
  registerCityGrid,
  type CityGrid,
  type LandmarkSpec,
} from './cityLayout';

const CENTER_X = 1100;
// Align the island's center Z with the main island's bridge-row arterial so
// the bridge runs east-west at near-constant Z (a small curve at the island
// end picks up the row-5 offset).
const CENTER_Z = MAIN_CITY.cellCenter(24, 9)[2];

const LANDMARKS: ReadonlyArray<LandmarkSpec> = [
  // Stadium dominates the central block.
  { tag: 'stadium', col: 6, row: 6, height: 18, color: '#7a7d83' },
  // Marina sits near the north coast on a row-2 block (close to the beach).
  { tag: 'marina', col: 10, row: 2, height: 6, color: '#cdb98a' },
];

// Corner cells reserved as parks so the rounded landmass corners don't get
// half-submerged buildings sticking into the water — the same trick the main
// island uses at [0,0]/[24,0]/[0,24]/[24,24]. The two interior parks add a
// little urban variety beyond that.
const PARKS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [12, 0],
  [0, 12],
  [12, 12],
  [2, 10],
  [10, 10],
];

const PARKING_LOTS: ReadonlyArray<[number, number]> = [
  [4, 8],
  [8, 4],
];

export const ISLAND3_CITY: CityGrid = buildCityGrid({
  id: 'island3',
  cols: 13,
  rows: 13,
  seed: 4242,
  centerX: CENTER_X,
  centerZ: CENTER_Z,
  landmarks: LANDMARKS,
  parks: PARKS,
  parkingLots: PARKING_LOTS,
  superBlockProb: 0.1,
});

registerCityGrid(ISLAND3_CITY);

export const ISLAND3_CENTER_X = CENTER_X;
export const ISLAND3_CENTER_Z = CENTER_Z;

// Bridge anchor cells:
//  - main side: [24, 9] east arterial (carriesEW)
//  - island3 side: [0, 5] west arterial. Col 0 is a block col; the bridge
//    deck terminates at the col-1 road centerline (entry into the grid).
export const ISLAND3_BRIDGE_ENTRY_COL = 1;
export const ISLAND3_BRIDGE_ENTRY_ROW = 5;
export const MAIN_BRIDGE_ENTRY_COL = 24;
export const MAIN_BRIDGE_ENTRY_ROW = 9;
