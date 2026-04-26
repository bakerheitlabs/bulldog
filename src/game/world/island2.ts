// Island 2 — a smaller, more organic-looking island sitting north of the main
// island. Self-contained: owns its landmass spec, road network, regional
// airport, a small village, and a tiny straight-streets "city district" with
// its own AI lane + pedestrian waypoint graphs.
//
// Design goals (delta vs. main island / main airport):
// - More natural coastline: per-corner radii vary widely, more noise octaves
//   with higher amplitude, plus one carved southern bay (facing the main
//   island) and a peninsula bump on the north coast.
// - Mix of road shapes: a winding "scenic" collector approaches from the
//   western cul-de-sac, then transitions into a small straight-edged
//   one-way ring road around a downtown block (the "city district").
// - Smaller airport: ~400m runway oriented east-west (vs. main's 600m N-S),
//   single hangar, single parked plane, no scheduled airliner.
//
// No connection to the city grid — there's no bridge in this iteration. The
// island is teleport-only via 'island2'; once a flyable plane lands, it'll
// also be reachable by air. (See project memory: flyable plane is the next
// deferred iteration.)

import {
  LANE_OFFSET,
  ROAD_WIDTH,
  type LaneWaypoint,
  type Vec3,
  type Waypoint,
} from './cityLayout';
import type { GridHandoff, Junction, SplineRoad, Suburb } from './suburbs';
import type { AirportSpec } from './airport';
import type { LandmassSpec } from './landBounds';

// Center of the island. Sits ~1100m north of the main island's max-Z so the
// gap reads as open ocean rather than "another district."
const C_X = 200;
const C_Z = 2200;

// Inner content rectangle for the perimeter generator. Long axis is E-W so
// the runway has room without forcing the island to be a square.
const INNER_HALF_W = 360;
const INNER_HALF_D = 220;

const INNER_MIN_X = C_X - INNER_HALF_W;
const INNER_MAX_X = C_X + INNER_HALF_W;
const INNER_MIN_Z = C_Z - INNER_HALF_D;
const INNER_MAX_Z = C_Z + INNER_HALF_D;

// --- Landmass spec ---

export const ISLAND2_LANDMASS: LandmassSpec = {
  id: 'island2',
  innerRect: { minX: INNER_MIN_X, maxX: INNER_MAX_X, minZ: INNER_MIN_Z, maxZ: INNER_MAX_Z },
  cornerRadii: [120, 80, 220, 110],
  noise: { seed: 31, amplitudes: [22, 14, 9, 5, 2] },
  bays: [
    { tCenter: 0.55, tWidth: 0.06, depth: 80 },
  ],
};

// --- Road network ---

const ROAD_Z_BASE = C_Z + 60;
const ROAD_X_W = C_X - 280;
const ROAD_X_MID = C_X - 40;

const CUL_W: Junction = {
  id: 'i2_cul_w',
  pos: [ROAD_X_W, 0, ROAD_Z_BASE],
  kind: 'culDeSac',
  radius: 10,
};

const T_APT: Junction = {
  id: 'i2_t_apt',
  pos: [ROAD_X_MID, 0, ROAD_Z_BASE - 18],
  kind: 'T',
  radius: 8,
};

// Northern cul-de-sac branch off the T-junction.
const CUL_N: Junction = {
  id: 'i2_cul_n',
  pos: [ROAD_X_MID + 30, 0, ROAD_Z_BASE - 110],
  kind: 'culDeSac',
  radius: 10,
};

// "City district" — a small one-way clockwise ring road around a downtown
// block east of T_APT. Junctions at each corner are simple 2-way meets
// (kind 'T' suppresses the cul-de-sac rim ring; the renderer just draws an
// asphalt disc to cover the ribbon ends cleanly).
const BLOCK_W = 200;
const BLOCK_E = 320;
const BLOCK_N = 2230;
const BLOCK_S = 2290;
const CORNER_R = 7;

const BLOCK_NW: Junction = {
  id: 'i2_block_nw',
  pos: [BLOCK_W, 0, BLOCK_N],
  kind: 'T',
  radius: CORNER_R,
};
const BLOCK_NE: Junction = {
  id: 'i2_block_ne',
  pos: [BLOCK_E, 0, BLOCK_N],
  kind: 'T',
  radius: CORNER_R,
};
const BLOCK_SE: Junction = {
  id: 'i2_block_se',
  pos: [BLOCK_E, 0, BLOCK_S],
  kind: 'T',
  radius: CORNER_R,
};
const BLOCK_SW: Junction = {
  id: 'i2_block_sw',
  pos: [BLOCK_W, 0, BLOCK_S],
  kind: 'T',
  radius: CORNER_R,
};

const COLLECTOR_W: SplineRoad = {
  id: 'i2_collector_w',
  controls: [
    [ROAD_X_W, 0, ROAD_Z_BASE],
    [ROAD_X_W + 35, 0, ROAD_Z_BASE - 8],
    [ROAD_X_W + 90, 0, ROAD_Z_BASE + 25],
    [ROAD_X_W + 150, 0, ROAD_Z_BASE - 5],
    [ROAD_X_W + 210, 0, ROAD_Z_BASE - 28],
    T_APT.pos,
  ],
  width: ROAD_WIDTH,
  start: { kind: 'junction', id: 'i2_cul_w' },
  end: { kind: 'junction', id: 'i2_t_apt' },
};

const SPUR_N: SplineRoad = {
  id: 'i2_spur_n',
  controls: [
    T_APT.pos,
    [ROAD_X_MID + 8, 0, ROAD_Z_BASE - 50],
    [ROAD_X_MID + 22, 0, ROAD_Z_BASE - 85],
    CUL_N.pos,
  ],
  width: ROAD_WIDTH,
  start: { kind: 'junction', id: 'i2_t_apt' },
  end: { kind: 'junction', id: 'i2_cul_n' },
};

// Connector from T_APT to the block's NW corner — short straight stub linking
// the winding part of the network to the city district.
const BLOCK_CONNECTOR: SplineRoad = {
  id: 'i2_block_connector',
  controls: [
    T_APT.pos,
    [(T_APT.pos[0] + BLOCK_W) / 2, 0, (T_APT.pos[2] + BLOCK_N) / 2],
    BLOCK_NW.pos,
  ],
  width: ROAD_WIDTH,
  start: { kind: 'junction', id: 'i2_t_apt' },
  end: { kind: 'junction', id: 'i2_block_nw' },
};

// Block ring road — 4 straight splines (2 collinear control points each).
function straight(id: string, a: Vec3, b: Vec3, startId: string, endId: string): SplineRoad {
  return {
    id,
    controls: [a, [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2], b],
    width: ROAD_WIDTH,
    start: { kind: 'junction', id: startId },
    end: { kind: 'junction', id: endId },
  };
}

const BLOCK_TOP: SplineRoad = straight(
  'i2_block_top',
  BLOCK_NW.pos,
  BLOCK_NE.pos,
  'i2_block_nw',
  'i2_block_ne',
);
const BLOCK_RIGHT: SplineRoad = straight(
  'i2_block_right',
  BLOCK_NE.pos,
  BLOCK_SE.pos,
  'i2_block_ne',
  'i2_block_se',
);
const BLOCK_BOT: SplineRoad = straight(
  'i2_block_bot',
  BLOCK_SE.pos,
  BLOCK_SW.pos,
  'i2_block_se',
  'i2_block_sw',
);
const BLOCK_LEFT: SplineRoad = straight(
  'i2_block_left',
  BLOCK_SW.pos,
  BLOCK_NW.pos,
  'i2_block_sw',
  'i2_block_nw',
);

const APT_SPUR_END: Vec3 = [C_X + 60, 0, C_Z + 130];
const J_APT_ENTRY: Junction = {
  id: 'i2_apt_entry',
  pos: APT_SPUR_END,
  kind: 'T',
  radius: 7,
};

const APT_SPUR: SplineRoad = {
  id: 'i2_apt_spur',
  controls: [
    T_APT.pos,
    [ROAD_X_MID + 30, 0, ROAD_Z_BASE + 30],
    [ROAD_X_MID + 60, 0, ROAD_Z_BASE + 80],
    APT_SPUR_END,
  ],
  width: ROAD_WIDTH,
  start: { kind: 'junction', id: 'i2_t_apt' },
  end: { kind: 'junction', id: 'i2_apt_entry' },
};

const _handoffs: GridHandoff[] = [];

export const ISLAND2_ROADS_SUBURB: Suburb = {
  id: 'island2_roads',
  junctions: [
    CUL_W,
    T_APT,
    CUL_N,
    J_APT_ENTRY,
    BLOCK_NW,
    BLOCK_NE,
    BLOCK_SE,
    BLOCK_SW,
  ],
  handoffs: _handoffs,
  splines: [
    COLLECTOR_W,
    SPUR_N,
    APT_SPUR,
    BLOCK_CONNECTOR,
    BLOCK_TOP,
    BLOCK_RIGHT,
    BLOCK_BOT,
    BLOCK_LEFT,
  ],
};

// --- Lane waypoint graph (city district one-way clockwise ring) ---
// Two lane waypoints per edge, at LANE_OFFSET past the center line on the
// inside (right-of-traveler) side. Each waypoint chains to the next CW
// neighbor; corners cross dir which the AI driver renders as a curve segment.
//
// `col`/`row` are sentinel -1 since the AI driver only consults them when
// `isIntersection: true` — these waypoints set isIntersection: false so the
// scheduler treats them as ambient straight-line driving with bezier corners.

function laneWp(id: string, x: number, z: number, dir: LaneWaypoint['dir'], next: string): LaneWaypoint {
  return {
    id,
    pos: [x, 0, z],
    dir,
    col: -1,
    row: -1,
    isIntersection: false,
    neighbors: [next],
  };
}

// Right-lane offsets (using cityLayout.LANE_OFFSET so the AI driver's
// LANE_OFFSET-based curve tangents land where the chord expects):
// E lane: south of centerline (z + LANE_OFFSET); S: west (x - LANE_OFFSET);
// W: north (z - LANE_OFFSET); N: east (x + LANE_OFFSET).
const _eLaneZ = BLOCK_N + LANE_OFFSET;
const _sLaneX = BLOCK_E - LANE_OFFSET;
const _wLaneZ = BLOCK_S - LANE_OFFSET;
const _nLaneX = BLOCK_W + LANE_OFFSET;

// Two stops along each edge — close to the corner so the curve segment has a
// short chord (smoother turn at AI speed).
const TOP1: LaneWaypoint = laneWp('i2_lane_top1', BLOCK_W + 10, _eLaneZ, 'E', 'i2_lane_top2');
const TOP2: LaneWaypoint = laneWp('i2_lane_top2', BLOCK_E - 10, _eLaneZ, 'E', 'i2_lane_right1');
const RIGHT1: LaneWaypoint = laneWp('i2_lane_right1', _sLaneX, BLOCK_N + 10, 'S', 'i2_lane_right2');
const RIGHT2: LaneWaypoint = laneWp('i2_lane_right2', _sLaneX, BLOCK_S - 10, 'S', 'i2_lane_bot1');
const BOT1: LaneWaypoint = laneWp('i2_lane_bot1', BLOCK_E - 10, _wLaneZ, 'W', 'i2_lane_bot2');
const BOT2: LaneWaypoint = laneWp('i2_lane_bot2', BLOCK_W + 10, _wLaneZ, 'W', 'i2_lane_left1');
const LEFT1: LaneWaypoint = laneWp('i2_lane_left1', _nLaneX, BLOCK_S - 10, 'N', 'i2_lane_left2');
const LEFT2: LaneWaypoint = laneWp('i2_lane_left2', _nLaneX, BLOCK_N + 10, 'N', 'i2_lane_top1');

export const ISLAND2_LANE_WAYPOINTS: Record<string, LaneWaypoint> = {
  [TOP1.id]: TOP1,
  [TOP2.id]: TOP2,
  [RIGHT1.id]: RIGHT1,
  [RIGHT2.id]: RIGHT2,
  [BOT1.id]: BOT1,
  [BOT2.id]: BOT2,
  [LEFT1.id]: LEFT1,
  [LEFT2.id]: LEFT2,
};

// --- Pedestrian waypoint graph (sidewalk ring around the block) ---
// Eight points around the block's outer perimeter, two per side, connected to
// adjacent neighbors. Pedestrians ambient-walk this ring and don't leave it.

const PED_OFFSET = ROAD_WIDTH / 2 + 1.5; // road half-width + sidewalk approximation

function pedWp(id: string, x: number, z: number, neighbors: string[]): Waypoint {
  return { id, pos: [x, 0, z], neighbors };
}

const PED_NW = pedWp('i2_ped_nw', BLOCK_W - PED_OFFSET, BLOCK_N - PED_OFFSET, [
  'i2_ped_n',
  'i2_ped_w',
]);
const PED_N = pedWp('i2_ped_n', (BLOCK_W + BLOCK_E) / 2, BLOCK_N - PED_OFFSET, [
  'i2_ped_nw',
  'i2_ped_ne',
]);
const PED_NE = pedWp('i2_ped_ne', BLOCK_E + PED_OFFSET, BLOCK_N - PED_OFFSET, [
  'i2_ped_n',
  'i2_ped_e',
]);
const PED_E = pedWp('i2_ped_e', BLOCK_E + PED_OFFSET, (BLOCK_N + BLOCK_S) / 2, [
  'i2_ped_ne',
  'i2_ped_se',
]);
const PED_SE = pedWp('i2_ped_se', BLOCK_E + PED_OFFSET, BLOCK_S + PED_OFFSET, [
  'i2_ped_e',
  'i2_ped_s',
]);
const PED_S = pedWp('i2_ped_s', (BLOCK_W + BLOCK_E) / 2, BLOCK_S + PED_OFFSET, [
  'i2_ped_se',
  'i2_ped_sw',
]);
const PED_SW = pedWp('i2_ped_sw', BLOCK_W - PED_OFFSET, BLOCK_S + PED_OFFSET, [
  'i2_ped_s',
  'i2_ped_w',
]);
const PED_W = pedWp('i2_ped_w', BLOCK_W - PED_OFFSET, (BLOCK_N + BLOCK_S) / 2, [
  'i2_ped_sw',
  'i2_ped_nw',
]);

export const ISLAND2_PED_WAYPOINTS: Record<string, Waypoint> = {
  [PED_NW.id]: PED_NW,
  [PED_N.id]: PED_N,
  [PED_NE.id]: PED_NE,
  [PED_E.id]: PED_E,
  [PED_SE.id]: PED_SE,
  [PED_S.id]: PED_S,
  [PED_SW.id]: PED_SW,
  [PED_W.id]: PED_W,
};

// IDs exposed for the spawner so it can dedicate a quota of NPCs/cars to the
// island instead of leaving spawn distribution to random sampling over the
// (much larger) main grid.
export const ISLAND2_LANE_WAYPOINT_IDS: string[] = Object.keys(ISLAND2_LANE_WAYPOINTS);
export const ISLAND2_PED_WAYPOINT_IDS: string[] = Object.keys(ISLAND2_PED_WAYPOINTS);

// --- Village ---

export type IslandBuilding = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
};

export type IslandPlaza = {
  id: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
};

export type IslandParkingLot = {
  id: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
};

const HOUSE_COLORS = ['#8b6f47', '#7f6a4d', '#6a7280', '#5a4f6c', '#7c5b3b'];

export const ISLAND2_BUILDINGS: IslandBuilding[] = [
  // West collector — north side of road (z < ROAD_Z_BASE).
  { id: 'i2_h1', x: -40, z: 2238, width: 9, depth: 9, height: 6, color: HOUSE_COLORS[0] },
  { id: 'i2_h2', x: 30, z: 2236, width: 11, depth: 8, height: 5, color: HOUSE_COLORS[1] },
  { id: 'i2_h3', x: 95, z: 2240, width: 8, depth: 10, height: 6, color: HOUSE_COLORS[2] },
  // West collector — south side (z > ROAD_Z_BASE).
  { id: 'i2_h4', x: -10, z: 2284, width: 10, depth: 9, height: 5, color: HOUSE_COLORS[3] },
  { id: 'i2_h5', x: 65, z: 2286, width: 9, depth: 9, height: 6, color: HOUSE_COLORS[4] },
  // Town hall / civic building between collector and block, taller and lighter.
  { id: 'i2_townhall', x: 145, z: 2280, width: 16, depth: 14, height: 11, color: '#cfd2d6' },
  // Spur to north — houses on either side.
  { id: 'i2_h6', x: 165, z: 2170, width: 9, depth: 9, height: 5, color: HOUSE_COLORS[1] },
  { id: 'i2_h7', x: 218, z: 2170, width: 8, depth: 10, height: 6, color: HOUSE_COLORS[0] },
  { id: 'i2_h8', x: 165, z: 2125, width: 8, depth: 9, height: 5, color: HOUSE_COLORS[2] },
  { id: 'i2_h9', x: 220, z: 2120, width: 10, depth: 8, height: 6, color: HOUSE_COLORS[4] },
  // City district — 4 buildings inside the block ring road.
  // Block interior (after road + curb): x ∈ [206, 314], z ∈ [2236, 2284].
  // Buildings split into two rows of two with an interior alley.
  { id: 'i2_office_nw', x: 235, z: 2247, width: 22, depth: 16, height: 9, color: '#5f6b73' },
  { id: 'i2_office_ne', x: 287, z: 2247, width: 22, depth: 16, height: 8, color: '#7f6a4d' },
  { id: 'i2_apt_sw', x: 235, z: 2273, width: 22, depth: 16, height: 10, color: '#6a7280' },
  { id: 'i2_apt_se', x: 287, z: 2273, width: 22, depth: 16, height: 9, color: '#5a4f6c' },
];

export const ISLAND2_PLAZA: IslandPlaza = {
  id: 'i2_plaza',
  centerX: 105,
  centerZ: 2280,
  width: 22,
  depth: 18,
};

export const ISLAND2_VILLAGE_PARKING: IslandParkingLot = {
  id: 'i2_village_lot',
  centerX: 178,
  centerZ: 2210,
  width: 22,
  depth: 14,
};

// --- Airport ---
// Smaller regional strip oriented east-west (long axis = X). All world coords.

const APT_CX = C_X + 60;
const APT_CZ = C_Z + 230;

export const ISLAND2_AIRPORT: AirportSpec = {
  id: 'island2_airport',
  axis: 'x',
  pad: {
    minX: APT_CX - 240,
    maxX: APT_CX + 240,
    minZ: APT_CZ - 90,
    maxZ: APT_CZ + 90,
  },
  parkingLot: {
    centerX: APT_CX,
    centerZ: APT_CZ - 70,
    width: 60,
    depth: 30,
  },
  terminal: {
    centerX: APT_CX,
    centerZ: APT_CZ - 35,
    width: 50,
    depth: 20,
    height: 8,
    color: '#cfd2d6',
  },
  tower: {
    centerX: APT_CX + 70,
    centerZ: APT_CZ - 35,
    width: 8,
    depth: 8,
    shaftHeight: 16,
    cabinHeight: 5,
    cabinWidth: 12,
    color: '#bfc1c5',
    cabinColor: '#1d2530',
  },
  hangars: [
    {
      centerX: APT_CX - 100,
      centerZ: APT_CZ - 40,
      width: 36,
      depth: 36,
      height: 11,
      doorFacing: '+z',
    },
  ],
  apron: { centerX: APT_CX - 50, centerZ: APT_CZ - 5, width: 200, depth: 30 },
  taxiway: { centerX: APT_CX, centerZ: APT_CZ + 25, width: 280, depth: 12 },
  runway: { centerX: APT_CX, centerZ: APT_CZ + 55, width: 400, depth: 40 },
  planes: [{ x: APT_CX - 100, z: APT_CZ - 5, headingY: Math.PI / 2 }],
  hostsScheduledFlight: false,
};
