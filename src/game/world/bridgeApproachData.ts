// Coastal road + small neighborhood east of the main grid that connects the
// city to the bridge. Without this, the bridge anchor sat at the grid's east
// edge and the deck spanned ~150m of empty grass before reaching water.
// Adding an approach road lets the bridge start at the actual shoreline and
// gives the area something to look at as you drive in.
//
// Pure data — `BridgeApproach.tsx` renders the buildings; the road spline is
// surfaced through SPLINE_REGIONS so SuburbRoads.tsx draws the asphalt.

import { MAIN_CITY, ROAD_WIDTH } from './cityLayout';
import type { GridHandoff, Junction, SplineRoad, Suburb } from './suburbs';
import type { IslandBuilding } from './island2';

const ENTRY_COL = 24;
const ENTRY_ROW = 9;

const ENTRY_BOUNDS = MAIN_CITY.cellBounds(ENTRY_COL, ENTRY_ROW);
const ENTRY_CENTER = MAIN_CITY.cellCenter(ENTRY_COL, ENTRY_ROW);

export const APPROACH_ENTRY_X = ENTRY_BOUNDS.maxX;
export const APPROACH_ENTRY_Z = ENTRY_CENTER[2];

// End of the approach = where the bridge actually begins. Tuned to land just
// short of the row-9 shoreline (the inner-rect-plus-corner-radius geometry
// puts it ~150m past the grid's east edge; we stop a hair short so the deck
// junction sits on grass rather than partway into the beach slope).
export const APPROACH_LEN = 120;
export const APPROACH_END_X = APPROACH_ENTRY_X + APPROACH_LEN;
export const APPROACH_END_Z = APPROACH_ENTRY_Z;

const HOUSE_COLORS = ['#8b6f47', '#7f6a4d', '#6a7280', '#5a4f6c', '#7c5b3b'];

const handoffs: GridHandoff[] = [
  { id: 'bridge_approach_entry', pos: [APPROACH_ENTRY_X, 0, APPROACH_ENTRY_Z] },
];

const junctions: Junction[] = [
  // T-junction at the far end where the road meets the bridge deck. Marked
  // as 'T' so the SuburbRoads renderer puts a flat asphalt disc there
  // (covers the ribbon's end neatly rather than drawing a cul-de-sac rim).
  {
    id: 'bridge_approach_end',
    pos: [APPROACH_END_X, 0, APPROACH_END_Z],
    kind: 'T',
    radius: 7,
  },
];

const splines: SplineRoad[] = [
  {
    id: 'bridge_approach_road',
    controls: [
      [APPROACH_ENTRY_X, 0, APPROACH_ENTRY_Z],
      // Two collinear-along-+X controls so the spline tangent matches the
      // arterial's direction at the handoff (otherwise the ribbon enters
      // diagonally and reads as a seam). Same trick the east_suburb uses.
      [APPROACH_ENTRY_X + 12, 0, APPROACH_ENTRY_Z],
      [APPROACH_ENTRY_X + 60, 0, APPROACH_ENTRY_Z],
      [APPROACH_END_X, 0, APPROACH_END_Z],
    ],
    width: ROAD_WIDTH,
    start: { kind: 'gridHandoff', id: 'bridge_approach_entry' },
    end: { kind: 'junction', id: 'bridge_approach_end' },
  },
];

export const BRIDGE_APPROACH_SUBURB: Suburb = {
  id: 'bridge_approach',
  junctions,
  handoffs,
  splines,
};

// Coastal residential buildings flanking the road. Heights stay small (5–7m)
// so the bridge deck sits well above the rooftops as it leaves the road.
const X = APPROACH_ENTRY_X;
const Z = APPROACH_ENTRY_Z;
export const BRIDGE_APPROACH_BUILDINGS: IslandBuilding[] = [
  // North side of road (z < center)
  { id: 'ba_h1', x: X + 22, z: Z - 18, width: 9, depth: 9, height: 5, color: HOUSE_COLORS[0] },
  { id: 'ba_h2', x: X + 50, z: Z - 19, width: 10, depth: 8, height: 6, color: HOUSE_COLORS[1] },
  { id: 'ba_h3', x: X + 82, z: Z - 18, width: 9, depth: 9, height: 5, color: HOUSE_COLORS[2] },
  // South side of road (z > center)
  { id: 'ba_h4', x: X + 25, z: Z + 18, width: 8, depth: 10, height: 5, color: HOUSE_COLORS[3] },
  { id: 'ba_h5', x: X + 57, z: Z + 19, width: 10, depth: 9, height: 6, color: HOUSE_COLORS[4] },
  { id: 'ba_h6', x: X + 88, z: Z + 18, width: 9, depth: 8, height: 5, color: HOUSE_COLORS[1] },
  // Coastal warehouse near the bridge head — taller, lighter color so it
  // reads as a transition between the residential strip and the bridge.
  { id: 'ba_warehouse', x: X + 108, z: Z + 30, width: 16, depth: 12, height: 7, color: '#9a9da3' },
];

// Trees scattered between buildings for variety.
export const BRIDGE_APPROACH_TREES: ReadonlyArray<{ x: number; z: number }> = [
  { x: X + 12, z: Z - 28 },
  { x: X + 40, z: Z - 30 },
  { x: X + 72, z: Z - 30 },
  { x: X + 102, z: Z - 24 },
  { x: X + 14, z: Z + 28 },
  { x: X + 42, z: Z + 30 },
  { x: X + 75, z: Z + 30 },
];
