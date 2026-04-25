// Hand-authored city layout. Pure data — no Three.js imports.
// Coordinates are in meters. The grid origin is at the world origin.
//
// The grid is non-uniform: each column has an independent width and each row
// an independent depth, stored in COL_WIDTHS / ROW_DEPTHS and accumulated into
// edge arrays. World positions come from those edges via cellCenter/cellBounds.

export const ROAD_WIDTH = 8;
export const SIDEWALK_WIDTH = 3;
export const PARKING_LANE_WIDTH = 2.4;
export const LANE_OFFSET = 2; // right-lane offset from centerline
// Narrow road corridors: 8m drivable road + 3m shoulder on each side. Shoulders
// double as buffer between road and adjacent block sidewalks.
export const ROAD_STRIP_WIDTH = ROAD_WIDTH + SIDEWALK_WIDTH * 2;

// 15x15 with a road on every odd col/row — 7×7 arterial intersections.
export const COLS = 15;
export const ROWS = 15;
const CITY_SEED = 1;

// Gunstore near grid center; range in the far corner. Both pinned so the
// player's spawn and the firing range stay stable across procedural cities.
const GUNSTORE: [number, number] = [6, 6];
const RANGE: [number, number] = [12, 12];
const MECHANIC: [number, number] = [8, 6];
const HOSPITAL: [number, number] = [4, 6];

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
export type CellBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type CellRef = { col: number; row: number };

export type RoadCell = {
  kind: 'road';
  parkingLane: 'none' | 'left' | 'right' | 'both';
  carriesNS: boolean; // vertical lanes available
  carriesEW: boolean; // horizontal lanes available
  isIntersection: boolean;
  // Set when this road cell is swallowed by a neighboring super-block.
  mergedInto?: CellRef;
};

export type BlockType = 'standard' | 'subdivided' | 'mixed' | 'plaza';

export type BuildingCell = {
  kind: 'building';
  height: number;
  color: string;
  tag?: 'gunstore' | 'range' | 'mechanic' | 'hospital';
  blockType: BlockType;
  // Super-block anchor: lists absorbed (road + sibling-block) cells and the
  // merged footprint spanning all three.
  absorbs?: ReadonlyArray<CellRef>;
  mergedBounds?: CellBounds;
  // Absorbed sibling: points at its anchor; should not render on its own.
  mergedInto?: CellRef;
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

// --- Non-uniform grid axes ---

export type AxisKind = 'road' | 'block';

function buildAxisKinds(count: number): AxisKind[] {
  const out: AxisKind[] = [];
  for (let i = 0; i < count; i++) out.push(isRoadIndex(i) ? 'road' : 'block');
  return out;
}

// Block widths jitter in [BLOCK_MIN, BLOCK_MAX]; road strips stay uniform.
const BLOCK_MIN = 32;
const BLOCK_MAX = 60;

// Per-axis width table. Road axes are narrow and uniform; block axes pick a
// width from the seeded RNG so rows/cols have varying extents.
function buildAxisSizes(kinds: AxisKind[], seed: number): number[] {
  const rand = mulberry32(seed);
  return kinds.map((k) =>
    k === 'road' ? ROAD_STRIP_WIDTH : BLOCK_MIN + Math.floor(rand() * (BLOCK_MAX - BLOCK_MIN + 1)),
  );
}

// Accumulated edge positions, centered on the world origin.
// edges[i] is the minimum world coord of cell i; edges[count] is the max of the last cell.
function buildAxisEdges(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  const edges: number[] = [-total / 2];
  for (const s of sizes) edges.push(edges[edges.length - 1] + s);
  return edges;
}

const COL_KINDS = buildAxisKinds(COLS);
const ROW_KINDS = buildAxisKinds(ROWS);
// Distinct seeds so column widths and row depths don't mirror each other.
const COL_WIDTHS = buildAxisSizes(COL_KINDS, CITY_SEED ^ 0xa1b2c3d4);
const ROW_DEPTHS = buildAxisSizes(ROW_KINDS, CITY_SEED ^ 0x5e6f7a8b);
const COL_EDGES = buildAxisEdges(COL_WIDTHS);
const ROW_EDGES = buildAxisEdges(ROW_DEPTHS);

export const CITY_WIDTH = COL_EDGES[COLS] - COL_EDGES[0];
export const CITY_DEPTH = ROW_EDGES[ROWS] - ROW_EDGES[0];
export const CITY_MIN_X = COL_EDGES[0];
export const CITY_MIN_Z = ROW_EDGES[0];

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
        line.push({
          kind: 'building',
          height: 14,
          color: '#8b6f47',
          tag: 'gunstore',
          blockType: 'standard',
        });
      } else if (col === RANGE[0] && row === RANGE[1]) {
        line.push({
          kind: 'building',
          height: 12,
          color: '#7c5b3b',
          tag: 'range',
          blockType: 'standard',
        });
      } else if (col === MECHANIC[0] && row === MECHANIC[1]) {
        line.push({
          kind: 'building',
          height: 6,
          color: '#3a3d44',
          tag: 'mechanic',
          blockType: 'standard',
        });
      } else if (col === HOSPITAL[0] && row === HOSPITAL[1]) {
        line.push({
          kind: 'building',
          height: 10,
          color: '#e8ecef',
          tag: 'hospital',
          blockType: 'standard',
        });
      } else if (parks.has(key)) {
        line.push({ kind: 'park' });
      } else if (lots.has(key)) {
        line.push({ kind: 'parkingLot' });
      } else {
        const height = 10 + Math.floor(rand() * 19); // 10–28m
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        line.push({ kind: 'building', height, color, blockType: 'standard' });
      }
    }
    grid.push(line);
  }
  return grid;
}

// Super-blocks: occasionally promote a non-intersection road cell (and its two
// flanking plain-building cells) into a single merged block. Anchor is always
// the left/top block; it owns `absorbs` + `mergedBounds`. The road cell and
// the opposite block get `mergedInto` pointing back at the anchor.
function applySuperBlocks(grid: Cell[][]) {
  const rand = mulberry32(CITY_SEED ^ 0xdeadbeef);
  const PROB = 0.12;
  const taken = new Set<string>();
  const isPlainBuilding = (c: Cell): c is BuildingCell =>
    c.kind === 'building' && c.tag == null;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      const c = grid[row][col];
      if (c.kind !== 'road' || c.isIntersection) continue;
      if (!c.carriesNS) continue;
      const leftKey = `${col - 1},${row}`;
      const rightKey = `${col + 1},${row}`;
      if (taken.has(leftKey) || taken.has(rightKey)) continue;
      const left = grid[row][col - 1];
      const right = grid[row][col + 1];
      if (!isPlainBuilding(left) || !isPlainBuilding(right)) continue;
      if (rand() >= PROB) continue;
      const anchor: CellRef = { col: col - 1, row };
      left.absorbs = [{ col, row }, { col: col + 1, row }];
      const lb = cellBounds(col - 1, row);
      const rb = cellBounds(col + 1, row);
      left.mergedBounds = { minX: lb.minX, maxX: rb.maxX, minZ: lb.minZ, maxZ: lb.maxZ };
      right.mergedInto = anchor;
      c.mergedInto = anchor;
      taken.add(leftKey);
      taken.add(key);
      taken.add(rightKey);
    }
  }

  for (let col = 0; col < COLS; col++) {
    for (let row = 1; row < ROWS - 1; row++) {
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      const c = grid[row][col];
      if (c.kind !== 'road' || c.isIntersection) continue;
      if (!c.carriesEW) continue;
      const topKey = `${col},${row - 1}`;
      const botKey = `${col},${row + 1}`;
      if (taken.has(topKey) || taken.has(botKey)) continue;
      const top = grid[row - 1][col];
      const bot = grid[row + 1][col];
      if (!isPlainBuilding(top) || !isPlainBuilding(bot)) continue;
      if (rand() >= PROB) continue;
      const anchor: CellRef = { col, row: row - 1 };
      top.absorbs = [{ col, row }, { col, row: row + 1 }];
      const tb = cellBounds(col, row - 1);
      const bb = cellBounds(col, row + 1);
      top.mergedBounds = { minX: tb.minX, maxX: tb.maxX, minZ: tb.minZ, maxZ: bb.maxZ };
      bot.mergedInto = anchor;
      c.mergedInto = anchor;
      taken.add(topKey);
      taken.add(key);
      taken.add(botKey);
    }
  }
}

// Per-block variety: after merges, roll a block type for each plain building
// cell. Anchors and tagged cells stay `standard` to keep landmarks predictable
// and merge rendering simple.
function assignBlockTypes(grid: Cell[][]) {
  const rand = mulberry32(CITY_SEED ^ 0xc0ffee42);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = grid[row][col];
      if (c.kind !== 'building') continue;
      if (c.tag || c.absorbs || c.mergedInto) continue;
      const r = rand();
      if (r < 0.55) c.blockType = 'standard';
      else if (r < 0.75) c.blockType = 'subdivided';
      else if (r < 0.87) c.blockType = 'mixed';
      else c.blockType = 'plaza';
    }
  }
}

const G: Cell[][] = buildGrid();
applySuperBlocks(G);
assignBlockTypes(G);

export function cellCenter(col: number, row: number): Vec3 {
  const x = (COL_EDGES[col] + COL_EDGES[col + 1]) / 2;
  const z = (ROW_EDGES[row] + ROW_EDGES[row + 1]) / 2;
  return [x, 0, z];
}

export function cellSize(col: number, row: number): { width: number; depth: number } {
  return { width: COL_WIDTHS[col], depth: ROW_DEPTHS[row] };
}

export function cellBounds(col: number, row: number): CellBounds {
  return {
    minX: COL_EDGES[col],
    maxX: COL_EDGES[col + 1],
    minZ: ROW_EDGES[row],
    maxZ: ROW_EDGES[row + 1],
  };
}

// Binary search for the cell index containing world coord `v` along an edges axis.
function findEdgeIndex(edges: number[], v: number): number {
  if (v < edges[0] || v >= edges[edges.length - 1]) return -1;
  let lo = 0;
  let hi = edges.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (edges[mid] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function worldToCell(x: number, z: number): { col: number; row: number } | null {
  const col = findEdgeIndex(COL_EDGES, x);
  const row = findEdgeIndex(ROW_EDGES, z);
  if (col < 0 || row < 0) return null;
  return { col, row };
}

export function getCell(col: number, row: number): Cell | null {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return G[row][col];
}

// 2D segment vs axis-aligned rectangle (slab / Liang-Barsky).
// Returns true if segment (x1,z1)->(x2,z2) intersects the AABB at all.
function segmentHitsAabb(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  const EPS = 1e-6;
  if (Math.abs(dx) < EPS) {
    if (x1 < minX || x1 > maxX) return false;
  } else {
    let t1 = (minX - x1) / dx;
    let t2 = (maxX - x1) / dx;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < EPS) {
    if (z1 < minZ || z1 > maxZ) return false;
  } else {
    let t1 = (minZ - z1) / dz;
    let t2 = (maxZ - z1) / dz;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

// Exact line-of-sight against building interior footprints. For each building
// cell in the grid, resolves its merged/anchor footprint, insets by
// SIDEWALK_WIDTH to the interior rectangle, and does a 2D segment-vs-AABB
// slab test. Returns false as soon as any building interior is pierced. The
// merged super-block dedup keeps us from testing the same anchor multiple
// times.
export function lineOfSightClear(x1: number, z1: number, x2: number, z2: number): boolean {
  if (Math.abs(x2 - x1) < 0.01 && Math.abs(z2 - z1) < 0.01) return true;
  const visitedAnchors = new Set<string>();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = G[row][col];
      if (cell.kind !== 'building') continue;
      if (cell.blockType === 'plaza') continue;
      if (cell.tag === 'mechanic') continue;
      let anchorCol = col;
      let anchorRow = row;
      let bounds: CellBounds;
      if (cell.mergedInto) {
        anchorCol = cell.mergedInto.col;
        anchorRow = cell.mergedInto.row;
        const anchor = getCell(anchorCol, anchorRow);
        if (!anchor || anchor.kind !== 'building' || !anchor.mergedBounds) continue;
        bounds = anchor.mergedBounds;
      } else if (cell.mergedBounds) {
        bounds = cell.mergedBounds;
      } else {
        bounds = cellBounds(col, row);
      }
      const key = `${anchorCol},${anchorRow}`;
      if (visitedAnchors.has(key)) continue;
      visitedAnchors.add(key);
      if (
        segmentHitsAabb(
          x1,
          z1,
          x2,
          z2,
          bounds.minX + SIDEWALK_WIDTH,
          bounds.maxX - SIDEWALK_WIDTH,
          bounds.minZ + SIDEWALK_WIDTH,
          bounds.maxZ - SIDEWALK_WIDTH,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

// Returns the interior bounds of the building footprint at (x,z) if the point
// lies inside one, else null. Uses the same footprint math as
// lineOfSightClear (sidewalk-inset), so movement blocking and LOS stay
// consistent.
export function buildingInteriorAt(x: number, z: number): CellBounds | null {
  const loc = worldToCell(x, z);
  if (!loc) return null;
  const cell = getCell(loc.col, loc.row);
  if (!cell || cell.kind !== 'building') return null;
  if (cell.blockType === 'plaza') return null;
  if (cell.tag === 'mechanic') return null;
  let bounds: CellBounds;
  if (cell.mergedInto) {
    const anchor = getCell(cell.mergedInto.col, cell.mergedInto.row);
    if (!anchor || anchor.kind !== 'building' || !anchor.mergedBounds) return null;
    bounds = anchor.mergedBounds;
  } else if (cell.mergedBounds) {
    bounds = cell.mergedBounds;
  } else {
    bounds = cellBounds(loc.col, loc.row);
  }
  const interior = {
    minX: bounds.minX + SIDEWALK_WIDTH,
    maxX: bounds.maxX - SIDEWALK_WIDTH,
    minZ: bounds.minZ + SIDEWALK_WIDTH,
    maxZ: bounds.maxZ - SIDEWALK_WIDTH,
  };
  if (x >= interior.minX && x <= interior.maxX && z >= interior.minZ && z <= interior.maxZ) {
    return interior;
  }
  return null;
}

export type CellInfo = {
  col: number;
  row: number;
  cell: Cell;
  center: Vec3;
  size: { width: number; depth: number };
};

export function allCells(): CellInfo[] {
  const out: CellInfo[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      out.push({
        col,
        row,
        cell: G[row][col],
        center: cellCenter(col, row),
        size: cellSize(col, row),
      });
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
// Three.js right-handed coords (+x right, +y up, +z toward camera). The
// driver's "right" is forward × up:
//   N (-z) × +y = +x   → right side at +x (east)
//   S (+z) × +y = -x   → right side at -x (west)
//   E (+x) × +y = +z   → right side at +z (south)
//   W (-x) × +y = -z   → right side at -z (north)
function laneOffset(dir: LaneDir): [number, number] {
  switch (dir) {
    case 'N':
      return [LANE_OFFSET, 0];
    case 'S':
      return [-LANE_OFFSET, 0];
    case 'E':
      return [0, LANE_OFFSET];
    case 'W':
      return [0, -LANE_OFFSET];
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

// Car model's local +Z is forward; rotation around Y to make it face
// along `dir`. Used by NPC car spawners so they don't start out facing the
// wrong way and drive backwards down the lane until angular velocity
// catches up.
export function yawForLaneDir(dir: LaneDir): number {
  switch (dir) {
    case 'S':
      return 0;
    case 'N':
      return Math.PI;
    case 'E':
      return Math.PI / 2;
    case 'W':
      return -Math.PI / 2;
  }
}

const TURN_RIGHT: Record<LaneDir, LaneDir> = { N: 'E', S: 'W', E: 'S', W: 'N' };

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
      if (c.mergedInto) continue; // absorbed road cells carry no traffic
      const [cx, , cz] = cellCenter(col, row);
      const dirs: LaneDir[] = [];
      if (c.carriesNS) dirs.push('N', 'S');
      if (c.carriesEW) dirs.push('E', 'W');
      for (const d of dirs) {
        const [ox, oz] = laneOffset(d);
        let px = cx + ox;
        let pz = cz + oz;
        if (c.isIntersection) {
          // Pull intersection waypoints back to the road-edge entry point
          // so a right-turn arc of radius LANE_OFFSET fits inside the
          // intersection box and lands on the destination lane line. With
          // waypoints at the cell center the entry sits past the lane-meet
          // corner — no curve from there avoids the opposing lane.
          const [ddx, ddz] = dirDelta(d);
          px -= ddx * (ROAD_WIDTH / 2);
          pz -= ddz * (ROAD_WIDTH / 2);
        }
        map[laneId(col, row, d)] = {
          id: laneId(col, row, d),
          pos: [px, 0, pz],
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

      // No left turns — they cross opposing through-traffic and our AI has
      // no yielding logic for cross-flow. Three rights = one left, so the
      // grid stays fully reachable.
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

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      // Skip pure road cells (no sidewalks needed there)
      if (c.kind === 'road') continue;
      // Skip absorbed blocks — their perimeter is covered by the anchor.
      if (c.kind === 'building' && c.mergedInto) continue;
      const bounds =
        c.kind === 'building' && c.mergedBounds ? c.mergedBounds : cellBounds(col, row);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cz = (bounds.minZ + bounds.maxZ) / 2;
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxZ - bounds.minZ;
      const offX = width / 2 - SIDEWALK_WIDTH / 2;
      const offZ = depth / 2 - SIDEWALK_WIDTH / 2;
      const corners: Array<['nw' | 'ne' | 'sw' | 'se', Vec3]> = [
        ['nw', [cx - offX, 0, cz - offZ]],
        ['ne', [cx + offX, 0, cz - offZ]],
        ['sw', [cx - offX, 0, cz + offZ]],
        ['se', [cx + offX, 0, cz + offZ]],
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
  const STREET_SLOT_SPACING = 6; // meters between consecutive street-parked cars
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      const [cx, , cz] = cellCenter(col, row);
      const { width: cw, depth: cd } = cellSize(col, row);

      if (c.kind === 'parkingLot') {
        // Scale the 4x3 slot grid to fit the lot with margins.
        const usableW = cw - SIDEWALK_WIDTH * 2 - 2;
        const usableD = cd - SIDEWALK_WIDTH * 2 - 2;
        const stepX = usableW / 4;
        const stepZ = usableD / 3;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            slots.push({
              pos: [
                cx - usableW / 2 + stepX / 2 + i * stepX,
                0,
                cz - usableD / 2 + stepZ / 2 + j * stepZ,
              ],
              rotationY: 0,
            });
          }
        }
      } else if (c.kind === 'road') {
        if (c.isIntersection) continue;
        if (c.mergedInto) continue;
        const lane = c.parkingLane;
        if (lane === 'none') continue;
        const isNS = c.carriesNS; // vertical road
        // Derive slot count from actual cell length; leave a small end margin.
        const runLen = isNS ? cd : cw;
        const nSlots = Math.floor((runLen - STREET_SLOT_SPACING) / STREET_SLOT_SPACING);
        if (nSlots <= 0) continue;
        const half = (nSlots - 1) / 2;
        // Only emit street parking if there's room alongside the 8m road for a
        // 2.4m parking lane. Narrow road strips (14m) have no shoulder and
        // skip street parking entirely.
        const sideRoom = isNS ? (cw - ROAD_WIDTH) / 2 : (cd - ROAD_WIDTH) / 2;
        if (sideRoom < PARKING_LANE_WIDTH) continue;
        if (isNS) {
          if (lane === 'left' || lane === 'both') {
            for (let i = 0; i < nSlots; i++) {
              slots.push({
                pos: [
                  cx - ROAD_WIDTH / 2 - PARKING_LANE_WIDTH / 2,
                  0,
                  cz + (i - half) * STREET_SLOT_SPACING,
                ],
                rotationY: 0,
              });
            }
          }
          if (lane === 'right' || lane === 'both') {
            for (let i = 0; i < nSlots; i++) {
              slots.push({
                pos: [
                  cx + ROAD_WIDTH / 2 + PARKING_LANE_WIDTH / 2,
                  0,
                  cz + (i - half) * STREET_SLOT_SPACING,
                ],
                rotationY: Math.PI,
              });
            }
          }
        } else {
          // E-W road: parking on north/south sides. Cars park facing the
          // direction of the adjacent lane: north curb sits next to the
          // westbound lane (face -x), south curb next to eastbound (face +x).
          if (lane === 'left' || lane === 'both') {
            for (let i = 0; i < nSlots; i++) {
              slots.push({
                pos: [
                  cx + (i - half) * STREET_SLOT_SPACING,
                  0,
                  cz - ROAD_WIDTH / 2 - PARKING_LANE_WIDTH / 2,
                ],
                rotationY: -Math.PI / 2,
              });
            }
          }
          if (lane === 'right' || lane === 'both') {
            for (let i = 0; i < nSlots; i++) {
              slots.push({
                pos: [
                  cx + (i - half) * STREET_SLOT_SPACING,
                  0,
                  cz + ROAD_WIDTH / 2 + PARKING_LANE_WIDTH / 2,
                ],
                rotationY: Math.PI / 2,
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

// Position of the traffic-light post for a given approach direction at an
// intersection. Placed on the near corner of the diagonally-adjacent block
// cell so the light sits on a real sidewalk regardless of cell sizes. Returns
// null if the expected corner block doesn't exist (map edge).
export function lightPostPos(
  intersection: Intersection,
  dir: LaneDir,
): { pos: Vec3; rotY: number } | null {
  const { col, row } = intersection;
  let nCol: number;
  let nRow: number;
  let xEdge: 'min' | 'max';
  let zEdge: 'min' | 'max';
  let rotY: number;
  switch (dir) {
    // For direction of travel D, the light sits on the far-right corner (from
    // the approaching driver's perspective), on the sidewalk of the diagonally-
    // adjacent block cell past the intersection.
    case 'N':
      nCol = col + 1; nRow = row - 1;
      xEdge = 'min'; zEdge = 'max'; rotY = 0;
      break;
    case 'S':
      nCol = col - 1; nRow = row + 1;
      xEdge = 'max'; zEdge = 'min'; rotY = Math.PI;
      break;
    case 'E':
      nCol = col + 1; nRow = row + 1;
      xEdge = 'min'; zEdge = 'min'; rotY = -Math.PI / 2;
      break;
    case 'W':
      nCol = col - 1; nRow = row - 1;
      xEdge = 'max'; zEdge = 'max'; rotY = Math.PI / 2;
      break;
  }
  const nCell = getCell(nCol, nRow);
  if (nCell == null) return null;
  // If the diagonal block has been swallowed by a super-block, skip the light
  // rather than place it inside the merged interior.
  if (nCell.kind === 'building' && nCell.mergedInto) return null;
  const b = cellBounds(nCol, nRow);
  const px = xEdge === 'min' ? b.minX + SIDEWALK_WIDTH / 2 : b.maxX - SIDEWALK_WIDTH / 2;
  const pz = zEdge === 'min' ? b.minZ + SIDEWALK_WIDTH / 2 : b.maxZ - SIDEWALK_WIDTH / 2;
  return { pos: [px, 0, pz], rotY };
}

// Distance from the intersection's lane waypoint (now at the road-edge
// entry, ROAD_WIDTH/2 inside the cell) to the stop line. Keeps a car
// clear of the intersection box with a 1m margin past the cell edge.
export function stopBackoff(intersection: Intersection, dir: LaneDir): number {
  const { width, depth } = cellSize(intersection.col, intersection.row);
  const half = dir === 'N' || dir === 'S' ? depth / 2 : width / 2;
  return half - ROAD_WIDTH / 2 + 1;
}

export const ROAD_WAYPOINTS = buildRoadWaypoints();
export const LANE_WAYPOINTS = buildLaneWaypoints();

// Find the N closest lane waypoints to a position, optionally requiring a
// minimum distance (so you don't spawn cars right on top of the player).
export function nearestLaneWaypoints(
  pos: { x: number; z: number },
  count: number,
  minDist = 0,
): LaneWaypoint[] {
  const ranked: { wp: LaneWaypoint; d: number }[] = [];
  for (const wp of Object.values(LANE_WAYPOINTS)) {
    const dx = wp.pos[0] - pos.x;
    const dz = wp.pos[2] - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < minDist) continue;
    ranked.push({ wp, d });
  }
  ranked.sort((a, b) => a.d - b.d);
  return ranked.slice(0, count).map((r) => r.wp);
}
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

export function findCellByTag(
  tag: 'gunstore' | 'range' | 'mechanic' | 'hospital',
): CellInfo | null {
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
  return [x + gs.size.width / 2 - SIDEWALK_WIDTH + 1, 1, z];
}

// Respawn point for death: sidewalk in front of the hospital's east face.
// Falls back to the standard player spawn if the hospital cell is missing.
export function getHospitalRespawn(): Vec3 {
  const h = findCellByTag('hospital');
  if (!h) return getPlayerSpawn();
  const [x, , z] = h.center;
  return [x + h.size.width / 2 - SIDEWALK_WIDTH + 1, 1, z];
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
