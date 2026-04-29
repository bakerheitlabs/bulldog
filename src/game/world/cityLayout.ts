// City layout. Pure data — no Three.js imports.
// Coordinates are in meters.
//
// The grid is non-uniform: each column has an independent width and each row
// an independent depth, stored in colWidths / rowDepths and accumulated into
// edge arrays. World positions come from those edges via cellCenter/cellBounds.
//
// As of the third-island change, the layout is a *factory*: `buildCityGrid`
// instantiates a `CityGrid` for any spec (cols, rows, seed, world center,
// landmarks). The original singleton "main city" is `MAIN_CITY`, and the
// pre-existing top-level exports (`cellCenter`, `getCell`, `LANE_WAYPOINTS`,
// etc.) remain as backward-compat shims pointing at it. Additional grids
// (e.g. island 3) are registered via `registerCityGrid` from their own module
// and surfaced through `getAllCityGrids`.

export const ROAD_WIDTH = 8;
export const SIDEWALK_WIDTH = 3;
export const PARKING_LANE_WIDTH = 2.4;
export const LANE_OFFSET = 2; // right-lane offset from centerline
// Narrow road corridors: 8m drivable road + 3m shoulder on each side. Shoulders
// double as buffer between road and adjacent block sidewalks.
export const ROAD_STRIP_WIDTH = ROAD_WIDTH + SIDEWALK_WIDTH * 2;

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

export type BuildingTag =
  | 'gunstore'
  | 'range'
  | 'mechanic'
  | 'hospital'
  | 'church'
  | 'stadium'
  | 'marina'
  | 'hotel';

export type BuildingCell = {
  kind: 'building';
  height: number;
  color: string;
  tag?: BuildingTag;
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

export const BUILDING_COLORS = [
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

function buildAxisSizes(kinds: AxisKind[], seed: number): number[] {
  const rand = mulberry32(seed);
  return kinds.map((k) =>
    k === 'road' ? ROAD_STRIP_WIDTH : BLOCK_MIN + Math.floor(rand() * (BLOCK_MAX - BLOCK_MIN + 1)),
  );
}

// Accumulated edge positions, centered on `centerOffset`.
// edges[i] is the minimum world coord of cell i; edges[count] is the max of the last cell.
function buildAxisEdges(sizes: number[], centerOffset: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  const edges: number[] = [centerOffset - total / 2];
  for (const s of sizes) edges.push(edges[edges.length - 1] + s);
  return edges;
}

// --- CityGrid factory ---

// Per-grid landmark spec. The factory paints the cell with the given
// height/color and tags it; rendering code dispatches on tag for special
// landmark visuals (gunstore, hospital, stadium, marina, ...).
export type LandmarkSpec = {
  tag: BuildingTag;
  col: number;
  row: number;
  height: number;
  color: string;
};

export type CityGridSpec = {
  id: string;
  cols: number;
  rows: number;
  seed: number;
  centerX: number;
  centerZ: number;
  landmarks: ReadonlyArray<LandmarkSpec>;
  parks: ReadonlyArray<[number, number]>;
  parkingLots: ReadonlyArray<[number, number]>;
  superBlockProb?: number;
};

export type CellInfo = {
  gridId: string;
  col: number;
  row: number;
  cell: Cell;
  center: Vec3;
  size: { width: number; depth: number };
};

export type Waypoint = { id: string; pos: Vec3; neighbors: string[] };

export type LaneDir = 'N' | 'S' | 'E' | 'W';
export type LaneWaypoint = Waypoint & {
  dir: LaneDir;
  col: number;
  row: number;
  isIntersection: boolean;
};

export type ParkingSlot = { pos: Vec3; rotationY: number };

export type Intersection = {
  id: string;
  gridId: string;
  col: number;
  row: number;
  center: Vec3;
  phaseOffset: number; // seconds into the global cycle; de-syncs lights
};

export type CityGrid = {
  spec: CityGridSpec;
  id: string;
  cols: number;
  rows: number;
  colEdges: number[];
  rowEdges: number[];
  colWidths: number[];
  rowDepths: number[];
  bounds: CellBounds;
  cells: Cell[][];
  cellCenter: (col: number, row: number) => Vec3;
  cellBounds: (col: number, row: number) => CellBounds;
  cellSize: (col: number, row: number) => { width: number; depth: number };
  worldToCell: (x: number, z: number) => { col: number; row: number } | null;
  getCell: (col: number, row: number) => Cell | null;
  allCells: () => CellInfo[];
  buildingInteriorAt: (x: number, z: number) => CellBounds | null;
  lineOfSightClear: (x1: number, z1: number, x2: number, z2: number) => boolean;
  laneWaypoints: Record<string, LaneWaypoint>;
  roadWaypoints: Record<string, Waypoint>;
  pedWaypoints: Record<string, Waypoint>;
  parkingSlots: ParkingSlot[];
  intersections: Intersection[];
  intersectionByCell: (col: number, row: number) => Intersection | null;
  findCellByTag: (tag: BuildingTag) => CellInfo | null;
  lightPostPos: (intersection: Intersection, dir: LaneDir) => { pos: Vec3; rotY: number } | null;
  stopBackoff: (intersection: Intersection, dir: LaneDir) => number;
};

export function buildCityGrid(spec: CityGridSpec): CityGrid {
  const { id, cols, rows, seed, centerX, centerZ } = spec;
  const superBlockProb = spec.superBlockProb ?? 0.12;

  const colKinds = buildAxisKinds(cols);
  const rowKinds = buildAxisKinds(rows);
  // Distinct seeds so column widths and row depths don't mirror each other.
  const colWidths = buildAxisSizes(colKinds, seed ^ 0xa1b2c3d4);
  const rowDepths = buildAxisSizes(rowKinds, seed ^ 0x5e6f7a8b);
  const colEdges = buildAxisEdges(colWidths, centerX);
  const rowEdges = buildAxisEdges(rowDepths, centerZ);

  const bounds: CellBounds = {
    minX: colEdges[0],
    maxX: colEdges[cols],
    minZ: rowEdges[0],
    maxZ: rowEdges[rows],
  };

  // --- Cell helpers (closures capture the local edges/cells) ---

  const cellCenter = (col: number, row: number): Vec3 => {
    const x = (colEdges[col] + colEdges[col + 1]) / 2;
    const z = (rowEdges[row] + rowEdges[row + 1]) / 2;
    return [x, 0, z];
  };
  const cellSize = (col: number, row: number) => ({
    width: colWidths[col],
    depth: rowDepths[row],
  });
  const cellBoundsFn = (col: number, row: number): CellBounds => ({
    minX: colEdges[col],
    maxX: colEdges[col + 1],
    minZ: rowEdges[row],
    maxZ: rowEdges[row + 1],
  });

  const findEdgeIndex = (edges: number[], v: number): number => {
    if (v < edges[0] || v >= edges[edges.length - 1]) return -1;
    let lo = 0;
    let hi = edges.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (edges[mid] <= v) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const worldToCell = (x: number, z: number) => {
    const col = findEdgeIndex(colEdges, x);
    const row = findEdgeIndex(rowEdges, z);
    if (col < 0 || row < 0) return null;
    return { col, row };
  };

  // --- Build grid ---

  const cells: Cell[][] = [];
  {
    const rand = mulberry32(seed);
    const setOf = (entries: ReadonlyArray<[number, number]>) =>
      new Set(entries.map(([c, r]) => `${c},${r}`));
    const parks = setOf(spec.parks);
    const lots = setOf(spec.parkingLots);
    const landmarkByCell = new Map<string, LandmarkSpec>();
    for (const l of spec.landmarks) landmarkByCell.set(`${l.col},${l.row}`, l);

    for (let row = 0; row < rows; row++) {
      const line: Cell[] = [];
      for (let col = 0; col < cols; col++) {
        const colIsRoad = isRoadIndex(col);
        const rowIsRoad = isRoadIndex(row);
        if (colIsRoad || rowIsRoad) {
          // Arterials every 4 (indices 1, 5, 9, 13). They get both-side parking.
          const arterial = col % 4 === 1 && row % 4 === 1;
          let parkingLane: RoadCell['parkingLane'] = 'none';
          if (!(colIsRoad && rowIsRoad)) {
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
        const lm = landmarkByCell.get(key);
        if (lm) {
          line.push({
            kind: 'building',
            height: lm.height,
            color: lm.color,
            tag: lm.tag,
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
      cells.push(line);
    }
  }

  // --- Super-blocks ---
  {
    const rand = mulberry32(seed ^ 0xdeadbeef);
    const taken = new Set<string>();
    const isPlainBuilding = (c: Cell): c is BuildingCell =>
      c.kind === 'building' && c.tag == null;

    for (let row = 0; row < rows; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const key = `${col},${row}`;
        if (taken.has(key)) continue;
        const c = cells[row][col];
        if (c.kind !== 'road' || c.isIntersection) continue;
        if (!c.carriesNS) continue;
        const leftKey = `${col - 1},${row}`;
        const rightKey = `${col + 1},${row}`;
        if (taken.has(leftKey) || taken.has(rightKey)) continue;
        const left = cells[row][col - 1];
        const right = cells[row][col + 1];
        if (!isPlainBuilding(left) || !isPlainBuilding(right)) continue;
        if (rand() >= superBlockProb) continue;
        const anchor: CellRef = { col: col - 1, row };
        left.absorbs = [{ col, row }, { col: col + 1, row }];
        const lb = cellBoundsFn(col - 1, row);
        const rb = cellBoundsFn(col + 1, row);
        left.mergedBounds = { minX: lb.minX, maxX: rb.maxX, minZ: lb.minZ, maxZ: lb.maxZ };
        right.mergedInto = anchor;
        c.mergedInto = anchor;
        taken.add(leftKey);
        taken.add(key);
        taken.add(rightKey);
      }
    }

    for (let col = 0; col < cols; col++) {
      for (let row = 1; row < rows - 1; row++) {
        const key = `${col},${row}`;
        if (taken.has(key)) continue;
        const c = cells[row][col];
        if (c.kind !== 'road' || c.isIntersection) continue;
        if (!c.carriesEW) continue;
        const topKey = `${col},${row - 1}`;
        const botKey = `${col},${row + 1}`;
        if (taken.has(topKey) || taken.has(botKey)) continue;
        const top = cells[row - 1][col];
        const bot = cells[row + 1][col];
        if (!isPlainBuilding(top) || !isPlainBuilding(bot)) continue;
        if (rand() >= superBlockProb) continue;
        const anchor: CellRef = { col, row: row - 1 };
        top.absorbs = [{ col, row }, { col, row: row + 1 }];
        const tb = cellBoundsFn(col, row - 1);
        const bb = cellBoundsFn(col, row + 1);
        top.mergedBounds = { minX: tb.minX, maxX: tb.maxX, minZ: tb.minZ, maxZ: bb.maxZ };
        bot.mergedInto = anchor;
        c.mergedInto = anchor;
        taken.add(topKey);
        taken.add(key);
        taken.add(botKey);
      }
    }
  }

  // --- Block types ---
  {
    const rand = mulberry32(seed ^ 0xc0ffee42);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
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

  // --- Cell-list helpers depending on cells[][] ---

  const getCell = (col: number, row: number): Cell | null => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return cells[row][col];
  };

  const allCells = (): CellInfo[] => {
    const out: CellInfo[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        out.push({
          gridId: id,
          col,
          row,
          cell: cells[row][col],
          center: cellCenter(col, row),
          size: cellSize(col, row),
        });
      }
    }
    return out;
  };

  // --- LOS / interior checks ---

  const segmentHitsAabb = (
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): boolean => {
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
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    if (Math.abs(dz) < EPS) {
      if (z1 < minZ || z1 > maxZ) return false;
    } else {
      let t1 = (minZ - z1) / dz;
      let t2 = (maxZ - z1) / dz;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
    return true;
  };

  const lineOfSightClear = (x1: number, z1: number, x2: number, z2: number): boolean => {
    if (Math.abs(x2 - x1) < 0.01 && Math.abs(z2 - z1) < 0.01) return true;
    // Segment vs AABB rejection for the whole grid (cheap early-out for shots
    // entirely off this island).
    if (
      !segmentHitsAabb(
        x1, z1, x2, z2,
        bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ,
      )
    ) {
      return true;
    }
    const visitedAnchors = new Set<string>();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row][col];
        if (cell.kind !== 'building') continue;
        if (cell.blockType === 'plaza') continue;
        if (cell.tag === 'mechanic') continue;
        let anchorCol = col;
        let anchorRow = row;
        let bb: CellBounds;
        if (cell.mergedInto) {
          anchorCol = cell.mergedInto.col;
          anchorRow = cell.mergedInto.row;
          const anchor = getCell(anchorCol, anchorRow);
          if (!anchor || anchor.kind !== 'building' || !anchor.mergedBounds) continue;
          bb = anchor.mergedBounds;
        } else if (cell.mergedBounds) {
          bb = cell.mergedBounds;
        } else {
          bb = cellBoundsFn(col, row);
        }
        const key = `${anchorCol},${anchorRow}`;
        if (visitedAnchors.has(key)) continue;
        visitedAnchors.add(key);
        if (
          segmentHitsAabb(
            x1, z1, x2, z2,
            bb.minX + SIDEWALK_WIDTH,
            bb.maxX - SIDEWALK_WIDTH,
            bb.minZ + SIDEWALK_WIDTH,
            bb.maxZ - SIDEWALK_WIDTH,
          )
        ) {
          return false;
        }
      }
    }
    return true;
  };

  const buildingInteriorAt = (x: number, z: number): CellBounds | null => {
    const loc = worldToCell(x, z);
    if (!loc) return null;
    const cell = getCell(loc.col, loc.row);
    if (!cell || cell.kind !== 'building') return null;
    if (cell.blockType === 'plaza') return null;
    if (cell.tag === 'mechanic') return null;
    let bb: CellBounds;
    if (cell.mergedInto) {
      const anchor = getCell(cell.mergedInto.col, cell.mergedInto.row);
      if (!anchor || anchor.kind !== 'building' || !anchor.mergedBounds) return null;
      bb = anchor.mergedBounds;
    } else if (cell.mergedBounds) {
      bb = cell.mergedBounds;
    } else {
      bb = cellBoundsFn(loc.col, loc.row);
    }
    const interior = {
      minX: bb.minX + SIDEWALK_WIDTH,
      maxX: bb.maxX - SIDEWALK_WIDTH,
      minZ: bb.minZ + SIDEWALK_WIDTH,
      maxZ: bb.maxZ - SIDEWALK_WIDTH,
    };
    if (x >= interior.minX && x <= interior.maxX && z >= interior.minZ && z <= interior.maxZ) {
      return interior;
    }
    return null;
  };

  // --- Lane waypoints ---

  const laneId = (col: number, row: number, dir: LaneDir) => `${id}_l_${col}_${row}_${dir}`;

  const laneWaypoints: Record<string, LaneWaypoint> = (() => {
    const map: Record<string, LaneWaypoint> = {};
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        if (c.kind !== 'road') continue;
        if (c.mergedInto) continue;
        const [cx, , cz] = cellCenter(col, row);
        const dirs: LaneDir[] = [];
        if (c.carriesNS) dirs.push('N', 'S');
        if (c.carriesEW) dirs.push('E', 'W');
        for (const d of dirs) {
          const [ox, oz] = laneOffset(d);
          let px = cx + ox;
          let pz = cz + oz;
          if (c.isIntersection) {
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
    for (const node of Object.values(map)) {
      const { col, row, dir, isIntersection } = node;
      const [dc, dr] = dirDelta(dir);
      const straight = map[laneId(col + dc, row + dr, dir)];
      if (straight) node.neighbors.push(straight.id);
      if (isIntersection) {
        const right = TURN_RIGHT[dir];
        const [rdc, rdr] = dirDelta(right);
        const rNode = map[laneId(col + rdc, row + rdr, right)];
        if (rNode) node.neighbors.push(rNode.id);
      }
    }
    // Iteratively prune dead-end nodes.
    for (;;) {
      const dead = Object.values(map).filter((n) => n.neighbors.length === 0);
      if (dead.length === 0) break;
      for (const d of dead) delete map[d.id];
      for (const n of Object.values(map)) {
        n.neighbors = n.neighbors.filter((nid) => map[nid] != null);
      }
    }
    return map;
  })();

  // --- Legacy road waypoints ---

  const roadId = (col: number, row: number) => `${id}_r_${col}_${row}`;
  const roadWaypoints: Record<string, Waypoint> = (() => {
    const map: Record<string, Waypoint> = {};
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        if (c.kind !== 'road') continue;
        const wid = roadId(col, row);
        map[wid] = { id: wid, pos: cellCenter(col, row), neighbors: [] };
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wid = roadId(col, row);
        if (!map[wid]) continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nid = roadId(col + dc, row + dr);
          if (map[nid]) map[wid].neighbors.push(nid);
        }
      }
    }
    return map;
  })();

  // --- Pedestrian waypoints ---

  const pedId = (col: number, row: number, side: string) => `${id}_p_${col}_${row}_${side}`;
  const pedWaypoints: Record<string, Waypoint> = (() => {
    const map: Record<string, Waypoint> = {};
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        if (c.kind === 'road') continue;
        if (c.kind === 'building' && c.mergedInto) continue;
        const bb =
          c.kind === 'building' && c.mergedBounds ? c.mergedBounds : cellBoundsFn(col, row);
        const cx = (bb.minX + bb.maxX) / 2;
        const cz = (bb.minZ + bb.maxZ) / 2;
        const width = bb.maxX - bb.minX;
        const depth = bb.maxZ - bb.minZ;
        const offX = width / 2 - SIDEWALK_WIDTH / 2;
        const offZ = depth / 2 - SIDEWALK_WIDTH / 2;
        const corners: Array<['nw' | 'ne' | 'sw' | 'se', Vec3]> = [
          ['nw', [cx - offX, 0, cz - offZ]],
          ['ne', [cx + offX, 0, cz - offZ]],
          ['sw', [cx - offX, 0, cz + offZ]],
          ['se', [cx + offX, 0, cz + offZ]],
        ];
        for (const [side, pos] of corners) {
          const wid = pedId(col, row, side);
          map[wid] = { id: wid, pos, neighbors: [] };
        }
        const link = (a: string, b: string) => {
          map[a].neighbors.push(b);
          map[b].neighbors.push(a);
        };
        link(pedId(col, row, 'nw'), pedId(col, row, 'ne'));
        link(pedId(col, row, 'ne'), pedId(col, row, 'se'));
        link(pedId(col, row, 'se'), pedId(col, row, 'sw'));
        link(pedId(col, row, 'sw'), pedId(col, row, 'nw'));
      }
    }
    return map;
  })();

  // --- Parking slots ---

  const parkingSlots: ParkingSlot[] = (() => {
    const slots: ParkingSlot[] = [];
    const STREET_SLOT_SPACING = 6;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        const [cx, , cz] = cellCenter(col, row);
        const { width: cw, depth: cd } = cellSize(col, row);
        if (c.kind === 'parkingLot') {
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
          const isNS = c.carriesNS;
          const runLen = isNS ? cd : cw;
          const nSlots = Math.floor((runLen - STREET_SLOT_SPACING) / STREET_SLOT_SPACING);
          if (nSlots <= 0) continue;
          const half = (nSlots - 1) / 2;
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
  })();

  // --- Intersections ---

  const intersections: Intersection[] = (() => {
    const out: Intersection[] = [];
    const rand = mulberry32(seed ^ 0x9e3779b9);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        if (c.kind !== 'road' || !c.isIntersection) continue;
        out.push({
          id: `${id}_int_${col}_${row}`,
          gridId: id,
          col,
          row,
          center: cellCenter(col, row),
          phaseOffset: rand() * 15,
        });
      }
    }
    return out;
  })();

  const intersectionByCellMap: Record<string, Intersection> = Object.fromEntries(
    intersections.map((it) => [`${it.col},${it.row}`, it]),
  );
  const intersectionByCell = (col: number, row: number) =>
    intersectionByCellMap[`${col},${row}`] ?? null;

  // --- Tag lookup ---

  const findCellByTag = (tag: BuildingTag): CellInfo | null => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = cells[row][col];
        if (c.kind === 'building' && c.tag === tag) {
          return {
            gridId: id,
            col,
            row,
            cell: c,
            center: cellCenter(col, row),
            size: cellSize(col, row),
          };
        }
      }
    }
    return null;
  };

  // --- Traffic light geometry ---

  const lightPostPos = (
    intersection: Intersection,
    dir: LaneDir,
  ): { pos: Vec3; rotY: number } | null => {
    const { col, row } = intersection;
    let nCol: number;
    let nRow: number;
    let xEdge: 'min' | 'max';
    let zEdge: 'min' | 'max';
    let rotY: number;
    switch (dir) {
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
    if (nCell.kind === 'building' && nCell.mergedInto) return null;
    const b = cellBoundsFn(nCol, nRow);
    const px = xEdge === 'min' ? b.minX + SIDEWALK_WIDTH / 2 : b.maxX - SIDEWALK_WIDTH / 2;
    const pz = zEdge === 'min' ? b.minZ + SIDEWALK_WIDTH / 2 : b.maxZ - SIDEWALK_WIDTH / 2;
    return { pos: [px, 0, pz], rotY };
  };

  const stopBackoff = (intersection: Intersection, dir: LaneDir): number => {
    const { width, depth } = cellSize(intersection.col, intersection.row);
    const half = dir === 'N' || dir === 'S' ? depth / 2 : width / 2;
    return half - ROAD_WIDTH / 2 + 1;
  };

  const grid: CityGrid = {
    spec,
    id,
    cols,
    rows,
    colEdges,
    rowEdges,
    colWidths,
    rowDepths,
    bounds,
    cells,
    cellCenter,
    cellBounds: cellBoundsFn,
    cellSize,
    worldToCell,
    getCell,
    allCells,
    buildingInteriorAt,
    lineOfSightClear,
    laneWaypoints,
    roadWaypoints,
    pedWaypoints,
    parkingSlots,
    intersections,
    intersectionByCell,
    findCellByTag,
    lightPostPos,
    stopBackoff,
  };
  return grid;
}

// --- Lane direction helpers (free-standing; needed by the factory) ---

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

// --- Main island grid (singleton) ---

const MAIN_LANDMARKS: ReadonlyArray<LandmarkSpec> = [
  { tag: 'gunstore', col: 12, row: 12, height: 14, color: '#8b6f47' },
  { tag: 'range', col: 22, row: 22, height: 12, color: '#7c5b3b' },
  { tag: 'mechanic', col: 18, row: 8, height: 6, color: '#3a3d44' },
  { tag: 'hospital', col: 4, row: 18, height: 10, color: '#e8ecef' },
  { tag: 'church', col: 4, row: 4, height: 14, color: '#d8cfa8' },
  { tag: 'hotel', col: 16, row: 16, height: 38, color: '#cdb98a' },
];

const MAIN_PARKS: ReadonlyArray<[number, number]> = [
  [0, 0], [24, 0], [0, 24], [24, 24], [12, 2], [2, 14],
];
const MAIN_PARKING_LOTS: ReadonlyArray<[number, number]> = [
  [6, 6], [18, 18], [6, 18], [18, 6],
];

export const MAIN_CITY: CityGrid = buildCityGrid({
  id: 'main',
  cols: 25,
  rows: 25,
  seed: 1,
  centerX: 0,
  centerZ: 0,
  landmarks: MAIN_LANDMARKS,
  parks: MAIN_PARKS,
  parkingLots: MAIN_PARKING_LOTS,
});

// --- Backward-compat top-level exports (delegate to MAIN_CITY) ---

export const COLS = MAIN_CITY.cols;
export const ROWS = MAIN_CITY.rows;
export const CITY_WIDTH = MAIN_CITY.bounds.maxX - MAIN_CITY.bounds.minX;
export const CITY_DEPTH = MAIN_CITY.bounds.maxZ - MAIN_CITY.bounds.minZ;
export const CITY_MIN_X = MAIN_CITY.bounds.minX;
export const CITY_MIN_Z = MAIN_CITY.bounds.minZ;

export const cellCenter = (col: number, row: number): Vec3 => MAIN_CITY.cellCenter(col, row);
export const cellBounds = (col: number, row: number): CellBounds =>
  MAIN_CITY.cellBounds(col, row);
export const cellSize = (col: number, row: number) => MAIN_CITY.cellSize(col, row);
export const worldToCell = (x: number, z: number) => MAIN_CITY.worldToCell(x, z);
export const getCell = (col: number, row: number) => MAIN_CITY.getCell(col, row);
export const allCells = (): CellInfo[] => MAIN_CITY.allCells();
export const buildingInteriorAt = (x: number, z: number) =>
  MAIN_CITY.buildingInteriorAt(x, z);
export const lineOfSightClear = (x1: number, z1: number, x2: number, z2: number) =>
  MAIN_CITY.lineOfSightClear(x1, z1, x2, z2);

export const LANE_WAYPOINTS = MAIN_CITY.laneWaypoints;
export const ROAD_WAYPOINTS = MAIN_CITY.roadWaypoints;
export const PED_WAYPOINTS = MAIN_CITY.pedWaypoints;
export const PARKING_SLOTS = MAIN_CITY.parkingSlots;
export const INTERSECTIONS = MAIN_CITY.intersections;

export function getIntersection(col: number, row: number): Intersection | null {
  return MAIN_CITY.intersectionByCell(col, row);
}

export function findCellByTag(tag: BuildingTag): CellInfo | null {
  return MAIN_CITY.findCellByTag(tag);
}

export function nearestLaneWaypoints(
  pos: { x: number; z: number },
  count: number,
  minDist = 0,
): LaneWaypoint[] {
  const ranked: { wp: LaneWaypoint; d: number }[] = [];
  for (const grid of ALL_CITY_GRIDS) {
    for (const wp of Object.values(grid.laneWaypoints)) {
      const dx = wp.pos[0] - pos.x;
      const dz = wp.pos[2] - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < minDist) continue;
      ranked.push({ wp, d });
    }
  }
  ranked.sort((a, b) => a.d - b.d);
  return ranked.slice(0, count).map((r) => r.wp);
}

export function lightPostPos(
  intersection: Intersection,
  dir: LaneDir,
): { pos: Vec3; rotY: number } | null {
  const grid = getCityGrid(intersection.gridId);
  if (!grid) return null;
  return grid.lightPostPos(intersection, dir);
}

export function stopBackoff(intersection: Intersection, dir: LaneDir): number {
  const grid = getCityGrid(intersection.gridId);
  if (!grid) return 0;
  return grid.stopBackoff(intersection, dir);
}

// Player spawn: on the sidewalk in front of the gunstore, facing the road.
export function getPlayerSpawn(): Vec3 {
  const gs = MAIN_CITY.findCellByTag('gunstore');
  if (!gs) return [0, 1, 0];
  const [x, , z] = gs.center;
  return [x + gs.size.width / 2 - SIDEWALK_WIDTH + 1, 1, z];
}

export function getHospitalRespawn(): Vec3 {
  const h = MAIN_CITY.findCellByTag('hospital');
  if (!h) return getPlayerSpawn();
  const [x, , z] = h.center;
  return [x + h.size.width / 2 - SIDEWALK_WIDTH + 1, 1, z];
}

export function getTargetSpawns(): Array<{ id: string; pos: Vec3 }> {
  const r = MAIN_CITY.findCellByTag('range');
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

// --- Multi-grid registry ---

const ALL_CITY_GRIDS: CityGrid[] = [MAIN_CITY];

export function registerCityGrid(grid: CityGrid): void {
  if (ALL_CITY_GRIDS.some((g) => g.id === grid.id)) return;
  ALL_CITY_GRIDS.push(grid);
}

export function getAllCityGrids(): readonly CityGrid[] {
  return ALL_CITY_GRIDS;
}

export function getCityGrid(id: string): CityGrid | null {
  return ALL_CITY_GRIDS.find((g) => g.id === id) ?? null;
}

// True if (x,z) sits inside any registered city grid's footprint.
export function findCityGridAt(x: number, z: number): CityGrid | null {
  for (const g of ALL_CITY_GRIDS) {
    if (g.worldToCell(x, z)) return g;
  }
  return null;
}

// Cross-grid LOS: a shot is clear only if no registered grid blocks it.
export function lineOfSightClearAll(x1: number, z1: number, x2: number, z2: number): boolean {
  for (const g of ALL_CITY_GRIDS) {
    if (!g.lineOfSightClear(x1, z1, x2, z2)) return false;
  }
  return true;
}

// Cross-grid building-interior lookup.
export function buildingInteriorAtAll(
  x: number,
  z: number,
): { grid: CityGrid; bounds: CellBounds } | null {
  for (const g of ALL_CITY_GRIDS) {
    const b = g.buildingInteriorAt(x, z);
    if (b) return { grid: g, bounds: b };
  }
  return null;
}
