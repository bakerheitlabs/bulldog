// Hand-authored city layout. Pure data — no Three.js imports.
// Coordinates are in meters. The grid origin is at the world origin.
// Each "cell" is BLOCK_SIZE x BLOCK_SIZE meters.

export const BLOCK_SIZE = 50;
export const ROAD_WIDTH = 8;
export const SIDEWALK_WIDTH = 3;
export const PARKING_LANE_WIDTH = 2.4;
export const LANE_OFFSET = 2; // right-lane offset from centerline

// 15x15 with a road on every odd col/row — 7×7 arterial intersections.
export const COLS = 15;
export const ROWS = 15;
const CITY_SEED = 1;

// Gunstore near grid center; range in the far corner. Both pinned so the
// player's spawn and the firing range stay stable across procedural cities.
const GUNSTORE: [number, number] = [6, 6];
const RANGE: [number, number] = [12, 12];

// Fixed parks + parking lots so the whole city doesn't wall-to-wall with buildings.
const PARKS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [14, 0],
  [0, 14],
];
const PARKING_LOTS: ReadonlyArray<[number, number]> = [
  [4, 8],
  [10, 4],
];

export type Vec3 = [number, number, number];

export type RoadCell = {
  kind: 'road';
  parkingLane: 'none' | 'left' | 'right' | 'both';
  carriesNS: boolean; // vertical lanes available
  carriesEW: boolean; // horizontal lanes available
  isIntersection: boolean;
};

export type BuildingCell = {
  kind: 'building';
  height: number;
  color: string;
  tag?: 'gunstore' | 'range';
};

export type ParkingLotCell = {
  kind: 'parkingLot';
};

export type ParkCell = {
  kind: 'park';
};

export type Cell = RoadCell | BuildingCell | ParkingLotCell | ParkCell;

const BUILDING_COLORS = [
  '#6a7280',
  '#7f6a4d',
  '#5f6b73',
  '#8b6f47',
  '#4a5a6a',
  '#7c5b3b',
  '#5a4f6c',
  '#3f524a',
];

// Deterministic tiny RNG so city layout stays identical across sessions.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function isRoadIndex(i: number) {
  return i % 2 === 1;
}

function buildGrid(): Cell[][] {
  const rand = mulberry32(CITY_SEED);
  const grid: Cell[][] = [];
  const setOf = (entries: ReadonlyArray<[number, number]>) =>
    new Set(entries.map(([c, r]) => `${c},${r}`));
  const parks = setOf(PARKS);
  const lots = setOf(PARKING_LOTS);

  for (let row = 0; row < ROWS; row++) {
    const line: Cell[] = [];
    for (let col = 0; col < COLS; col++) {
      const colIsRoad = isRoadIndex(col);
      const rowIsRoad = isRoadIndex(row);
      if (colIsRoad || rowIsRoad) {
        // Arterials every 4 (indices 1, 5, 9, 13). They get both-side parking.
        const arterial = col % 4 === 1 && row % 4 === 1;
        let parkingLane: RoadCell['parkingLane'] = 'none';
        if (!(colIsRoad && rowIsRoad)) {
          // Non-intersection road cells can host street parking.
          const r = rand();
          if (arterial) parkingLane = 'both';
          else if (r < 0.35) parkingLane = 'both';
          else if (r < 0.6) parkingLane = 'left';
          else if (r < 0.85) parkingLane = 'right';
        }
        line.push({
          kind: 'road',
          parkingLane,
          carriesNS: colIsRoad,
          carriesEW: rowIsRoad,
          isIntersection: colIsRoad && rowIsRoad,
        });
        continue;
      }
      const key = `${col},${row}`;
      if (col === GUNSTORE[0] && row === GUNSTORE[1]) {
        line.push({ kind: 'building', height: 14, color: '#8b6f47', tag: 'gunstore' });
      } else if (col === RANGE[0] && row === RANGE[1]) {
        line.push({ kind: 'building', height: 12, color: '#7c5b3b', tag: 'range' });
      } else if (parks.has(key)) {
        line.push({ kind: 'park' });
      } else if (lots.has(key)) {
        line.push({ kind: 'parkingLot' });
      } else {
        const height = 10 + Math.floor(rand() * 19); // 10–28m
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        line.push({ kind: 'building', height, color });
      }
    }
    grid.push(line);
  }
  return grid;
}

const G: Cell[][] = buildGrid();

export function cellCenter(col: number, row: number): Vec3 {
  const x = (col - (COLS - 1) / 2) * BLOCK_SIZE;
  const z = (row - (ROWS - 1) / 2) * BLOCK_SIZE;
  return [x, 0, z];
}

export function getCell(col: number, row: number): Cell | null {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return G[row][col];
}

export type CellInfo = { col: number; row: number; cell: Cell; center: Vec3 };

export function allCells(): CellInfo[] {
  const out: CellInfo[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      out.push({ col, row, cell: G[row][col], center: cellCenter(col, row) });
    }
  }
  return out;
}

// --- Waypoint graphs ---

export type Waypoint = { id: string; pos: Vec3; neighbors: string[] };

function makeId(prefix: string, col: number, row: number, side: string = '') {
  return `${prefix}_${col}_${row}${side ? '_' + side : ''}`;
}

// --- Lane waypoints (directional, right-hand driving) ---

export type LaneDir = 'N' | 'S' | 'E' | 'W';
export type LaneWaypoint = Waypoint & {
  dir: LaneDir;
  col: number;
  row: number;
  isIntersection: boolean;
};

// Lane offset from cell center: right-of-traveler side for each flow direction.
// Three.js right-handed: facing -z ("N"), right-hand is +x.
function laneOffset(dir: LaneDir): [number, number] {
  switch (dir) {
    case 'N':
      return [LANE_OFFSET, 0];
    case 'S':
      return [-LANE_OFFSET, 0];
    case 'E':
      return [0, -LANE_OFFSET];
    case 'W':
      return [0, LANE_OFFSET];
  }
}

function dirDelta(dir: LaneDir): [number, number] {
  switch (dir) {
    case 'N':
      return [0, -1];
    case 'S':
      return [0, 1];
    case 'E':
      return [1, 0];
    case 'W':
      return [-1, 0];
  }
}

const TURN_RIGHT: Record<LaneDir, LaneDir> = { N: 'E', S: 'W', E: 'S', W: 'N' };
const TURN_LEFT: Record<LaneDir, LaneDir> = { N: 'W', S: 'E', E: 'N', W: 'S' };

function laneId(col: number, row: number, dir: LaneDir) {
  return `l_${col}_${row}_${dir}`;
}

export function buildLaneWaypoints(): Record<string, LaneWaypoint> {
  const map: Record<string, LaneWaypoint> = {};
  // Emit nodes
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      if (c.kind !== 'road') continue;
      const [cx, , cz] = cellCenter(col, row);
      const dirs: LaneDir[] = [];
      if (c.carriesNS) dirs.push('N', 'S');
      if (c.carriesEW) dirs.push('E', 'W');
      for (const d of dirs) {
        const [ox, oz] = laneOffset(d);
        map[laneId(col, row, d)] = {
          id: laneId(col, row, d),
          pos: [cx + ox, 0, cz + oz],
          dir: d,
          col,
          row,
          isIntersection: c.isIntersection,
          neighbors: [],
        };
      }
    }
  }
  // Wire neighbors
  for (const node of Object.values(map)) {
    const { col, row, dir, isIntersection } = node;
    const straight = (() => {
      const [dc, dr] = dirDelta(dir);
      return map[laneId(col + dc, row + dr, dir)];
    })();
    if (straight) node.neighbors.push(straight.id);

    if (isIntersection) {
      // Turn right: enter the cell next to us on our right side with the
      // right-turn direction as the new flow.
      const right = TURN_RIGHT[dir];
      const [rdc, rdr] = dirDelta(right);
      const rNode = map[laneId(col + rdc, row + rdr, right)];
      if (rNode) node.neighbors.push(rNode.id);

      const left = TURN_LEFT[dir];
      const [ldc, ldr] = dirDelta(left);
      const lNode = map[laneId(col + ldc, row + ldr, left)];
      if (lNode) node.neighbors.push(lNode.id);
    }
  }
  // Iteratively prune dead-end nodes (no onward neighbors). Otherwise cars
  // can wander into an edge lane that points off the grid and get stuck.
  // Cascades until stable — removing a dead-end may orphan its predecessor.
  for (;;) {
    const dead = Object.values(map).filter((n) => n.neighbors.length === 0);
    if (dead.length === 0) break;
    for (const d of dead) delete map[d.id];
    for (const n of Object.values(map)) {
      n.neighbors = n.neighbors.filter((nid) => map[nid] != null);
    }
  }
  return map;
}

// Legacy non-directional road waypoints (center of each road cell). Kept so
// code that only needs a point on a road can still ask. AI cars now use
// LANE_WAYPOINTS for proper lane discipline.
export function buildRoadWaypoints(): Record<string, Waypoint> {
  const map: Record<string, Waypoint> = {};
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      if (c.kind !== 'road') continue;
      const id = makeId('r', col, row);
      map[id] = { id, pos: cellCenter(col, row), neighbors: [] };
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = makeId('r', col, row);
      if (!map[id]) continue;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nid = makeId('r', col + dc, row + dr);
        if (map[nid]) map[id].neighbors.push(nid);
      }
    }
  }
  return map;
}

// Pedestrian waypoints: a ring around each non-road cell, on the sidewalk,
// with connections to adjacent rings via the sidewalk corner.
export function buildPedWaypoints(): Record<string, Waypoint> {
  const map: Record<string, Waypoint> = {};
  const half = BLOCK_SIZE / 2;
  const inset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      // Skip pure road cells (no sidewalks needed there)
      if (c.kind === 'road') continue;
      const [cx, , cz] = cellCenter(col, row);
      const corners: Array<['nw' | 'ne' | 'sw' | 'se', Vec3]> = [
        ['nw', [cx - half + inset, 0, cz - half + inset]],
        ['ne', [cx + half - inset, 0, cz - half + inset]],
        ['sw', [cx - half + inset, 0, cz + half - inset]],
        ['se', [cx + half - inset, 0, cz + half - inset]],
      ];
      for (const [side, pos] of corners) {
        const id = makeId('p', col, row, side);
        map[id] = { id, pos, neighbors: [] };
      }
      // intra-cell loop
      const link = (a: string, b: string) => {
        map[a].neighbors.push(b);
        map[b].neighbors.push(a);
      };
      link(makeId('p', col, row, 'nw'), makeId('p', col, row, 'ne'));
      link(makeId('p', col, row, 'ne'), makeId('p', col, row, 'se'));
      link(makeId('p', col, row, 'se'), makeId('p', col, row, 'sw'));
      link(makeId('p', col, row, 'sw'), makeId('p', col, row, 'nw'));
    }
  }
  return map;
}

export type ParkingSlot = { pos: Vec3; rotationY: number };

export function buildParkingSlots(): ParkingSlot[] {
  const slots: ParkingSlot[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      const [cx, , cz] = cellCenter(col, row);

      if (c.kind === 'parkingLot') {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            slots.push({
              pos: [cx - 12 + i * 8, 0, cz - 8 + j * 8],
              rotationY: 0,
            });
          }
        }
      } else if (c.kind === 'road') {
        // Only non-intersection road cells carry street parking.
        if (c.isIntersection) continue;
        const lane = c.parkingLane;
        const isNS = c.carriesNS; // vertical road
        if (isNS) {
          if (lane === 'left' || lane === 'both') {
            for (let i = -2; i <= 2; i++) {
              slots.push({
                pos: [cx - ROAD_WIDTH / 2 - PARKING_LANE_WIDTH / 2, 0, cz + i * 6],
                rotationY: 0,
              });
            }
          }
          if (lane === 'right' || lane === 'both') {
            for (let i = -2; i <= 2; i++) {
              slots.push({
                pos: [cx + ROAD_WIDTH / 2 + PARKING_LANE_WIDTH / 2, 0, cz + i * 6],
                rotationY: Math.PI,
              });
            }
          }
        } else {
          // E-W road: parking on north/south sides
          if (lane === 'left' || lane === 'both') {
            for (let i = -2; i <= 2; i++) {
              slots.push({
                pos: [cx + i * 6, 0, cz - ROAD_WIDTH / 2 - PARKING_LANE_WIDTH / 2],
                rotationY: Math.PI / 2,
              });
            }
          }
          if (lane === 'right' || lane === 'both') {
            for (let i = -2; i <= 2; i++) {
              slots.push({
                pos: [cx + i * 6, 0, cz + ROAD_WIDTH / 2 + PARKING_LANE_WIDTH / 2],
                rotationY: -Math.PI / 2,
              });
            }
          }
        }
      }
    }
  }
  return slots;
}

// --- Intersection metadata ---

export type Intersection = {
  id: string;
  col: number;
  row: number;
  center: Vec3;
  phaseOffset: number; // seconds into the global cycle; de-syncs lights
};

export function buildIntersections(): Intersection[] {
  const out: Intersection[] = [];
  const rand = mulberry32(CITY_SEED ^ 0x9e3779b9);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      if (c.kind !== 'road' || !c.isIntersection) continue;
      out.push({
        id: `int_${col}_${row}`,
        col,
        row,
        center: cellCenter(col, row),
        phaseOffset: rand() * 15, // 0–15s, cycle length = 15s
      });
    }
  }
  return out;
}

export const ROAD_WAYPOINTS = buildRoadWaypoints();
export const LANE_WAYPOINTS = buildLaneWaypoints();
export const PED_WAYPOINTS = buildPedWaypoints();
export const PARKING_SLOTS = buildParkingSlots();
export const INTERSECTIONS = buildIntersections();

// Fast lookup: intersection by (col, row)
const INTERSECTION_INDEX: Record<string, Intersection> = Object.fromEntries(
  INTERSECTIONS.map((it) => [`${it.col},${it.row}`, it]),
);
export function getIntersection(col: number, row: number): Intersection | null {
  return INTERSECTION_INDEX[`${col},${row}`] ?? null;
}

export function findCellByTag(tag: 'gunstore' | 'range'): CellInfo | null {
  for (const info of allCells()) {
    if (info.cell.kind === 'building' && info.cell.tag === tag) return info;
  }
  return null;
}

// Player spawn: on the sidewalk in front of the gunstore, facing the road.
// Offset stays inside the non-road cell so the player doesn't spawn on asphalt.
export function getPlayerSpawn(): Vec3 {
  const gs = findCellByTag('gunstore');
  if (!gs) return [0, 1, 0];
  const [x, , z] = gs.center;
  return [x + BLOCK_SIZE / 2 - SIDEWALK_WIDTH + 1, 1, z];
}

// Target dummies live in the "range" cell
export function getTargetSpawns(): Array<{ id: string; pos: Vec3 }> {
  const r = findCellByTag('range');
  if (!r) return [];
  const [x, , z] = r.center;
  return [
    { id: 'target_0', pos: [x - 8, 0, z] },
    { id: 'target_1', pos: [x - 4, 0, z] },
    { id: 'target_2', pos: [x, 0, z] },
    { id: 'target_3', pos: [x + 4, 0, z] },
    { id: 'target_4', pos: [x + 8, 0, z] },
  ];
}
