// Hand-authored city layout. Pure data — no Three.js imports.
// Coordinates are in meters. The grid origin is at the world origin.
// Each "cell" is BLOCK_SIZE x BLOCK_SIZE meters.

export const BLOCK_SIZE = 50;
export const ROAD_WIDTH = 10;
export const SIDEWALK_WIDTH = 3;
export const PARKING_LANE_WIDTH = 2.4;

export type Vec3 = [number, number, number];

export type RoadCell = {
  kind: 'road';
  parkingLane: 'none' | 'left' | 'right' | 'both';
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

// 5 columns x 5 rows. (col, row) — col=x, row=z. Roads are H/V cross.
const G: (Cell | null)[][] = [
  // row 0
  [
    { kind: 'building', height: 18, color: '#6a7280' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'building', height: 22, color: '#7f6a4d' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'building', height: 16, color: '#5f6b73' },
  ],
  // row 1 — east-west road
  [
    { kind: 'road', parkingLane: 'both' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'road', parkingLane: 'both' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'road', parkingLane: 'both' },
  ],
  // row 2 — center
  [
    { kind: 'building', height: 14, color: '#8b6f47', tag: 'gunstore' },
    { kind: 'road', parkingLane: 'right' },
    { kind: 'parkingLot' },
    { kind: 'road', parkingLane: 'left' },
    { kind: 'building', height: 26, color: '#4a5a6a' },
  ],
  // row 3 — east-west road
  [
    { kind: 'road', parkingLane: 'both' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'road', parkingLane: 'both' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'road', parkingLane: 'both' },
  ],
  // row 4
  [
    { kind: 'park' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'building', height: 12, color: '#7c5b3b', tag: 'range' },
    { kind: 'road', parkingLane: 'none' },
    { kind: 'building', height: 20, color: '#5a4f6c' },
  ],
];

export const COLS = G[0].length;
export const ROWS = G.length;

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
      const cell = G[row][col];
      if (!cell) continue;
      out.push({ col, row, cell, center: cellCenter(col, row) });
    }
  }
  return out;
}

// --- Waypoint graphs ---

export type Waypoint = { id: string; pos: Vec3; neighbors: string[] };

function makeId(prefix: string, col: number, row: number, side: string = '') {
  return `${prefix}_${col}_${row}${side ? '_' + side : ''}`;
}

// Road waypoints: a node at the center of every road cell, connected to
// adjacent road cells (4-directional).
export function buildRoadWaypoints(): Record<string, Waypoint> {
  const map: Record<string, Waypoint> = {};
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = G[row][col];
      if (!c || c.kind !== 'road') continue;
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
      if (!c) continue;
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
      if (!c) continue;
      const [cx, , cz] = cellCenter(col, row);

      if (c.kind === 'parkingLot') {
        // 4x3 grid of parking spots
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            slots.push({
              pos: [cx - 12 + i * 8, 0, cz - 8 + j * 8],
              rotationY: 0,
            });
          }
        }
      } else if (c.kind === 'road') {
        // Street parking lanes
        const lane = c.parkingLane;
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
      }
    }
  }
  return slots;
}

export const ROAD_WAYPOINTS = buildRoadWaypoints();
export const PED_WAYPOINTS = buildPedWaypoints();
export const PARKING_SLOTS = buildParkingSlots();

export function findCellByTag(tag: 'gunstore' | 'range'): CellInfo | null {
  for (const info of allCells()) {
    if (info.cell.kind === 'building' && info.cell.tag === tag) return info;
  }
  return null;
}

// Player spawn: in front of the gunstore on the sidewalk
export function getPlayerSpawn(): Vec3 {
  const gs = findCellByTag('gunstore');
  if (!gs) return [0, 1, 0];
  const [x, , z] = gs.center;
  return [x + BLOCK_SIZE / 2 + 4, 1, z];
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
