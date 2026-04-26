import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import {
  allCells,
  cellCenter,
  cellSize,
  getCell,
  worldToCell,
  type CellInfo,
} from './cityLayout';
import { useGameStore } from '@/state/gameStore';
import { readDrivenCarPos, useVehicleStore } from '@/game/vehicles/vehicleState';

const CHUNK_SIZE = 3; // cells per chunk side
// Chunks around the player to keep mounted. 1 = 3x3 chunk block = 9x9 = 81
// cells visible. A small radius keeps in-city draw cost down — the off-grid
// fallback below handles "looking back at the city from a highway."
const VIEW_RADIUS = 1;

// Off-grid (airport highway, airport pad) we can't use the chunk grid because
// the chunk grid only covers the city. Fall back to a distance-based window
// around the player, throttled by snapping to OFF_GRID_SNAP_M so we re-build
// the visible list at the same cadence the on-grid path does.
const OFF_GRID_SNAP_M = 90; // recompute when the player moves this far
const OFF_GRID_VIEW_M = 600; // cells within this radius are eligible
const OFF_GRID_MAX_CELLS = 180; // hard cap on how many cells we draw at once

export type ChunkKey =
  | { kind: 'on-grid'; cc: number; cr: number }
  | { kind: 'off-grid'; sx: number; sz: number; px: number; pz: number };

export function getPlayerPos(): [number, number] {
  if (useVehicleStore.getState().drivenCarId) {
    const carPos = readDrivenCarPos();
    if (carPos) return [carPos.x, carPos.z];
  }
  const [px, , pz] = useGameStore.getState().player.position;
  return [px, pz];
}

export function playerChunk(): ChunkKey {
  const [px, pz] = getPlayerPos();
  const cell = worldToCell(px, pz);
  if (cell) {
    return {
      kind: 'on-grid',
      cc: Math.floor(cell.col / CHUNK_SIZE),
      cr: Math.floor(cell.row / CHUNK_SIZE),
    };
  }
  return {
    kind: 'off-grid',
    sx: Math.floor(px / OFF_GRID_SNAP_M),
    sz: Math.floor(pz / OFF_GRID_SNAP_M),
    px,
    pz,
  };
}

export function chunksEqual(a: ChunkKey, b: ChunkKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'on-grid' && b.kind === 'on-grid') return a.cc === b.cc && a.cr === b.cr;
  if (a.kind === 'off-grid' && b.kind === 'off-grid') return a.sx === b.sx && a.sz === b.sz;
  return false;
}

function cellInChunkRange(col: number, row: number, cc: number, cr: number): boolean {
  const c = Math.floor(col / CHUNK_SIZE);
  const r = Math.floor(row / CHUNK_SIZE);
  return Math.abs(c - cc) <= VIEW_RADIUS && Math.abs(r - cr) <= VIEW_RADIUS;
}

const ALL = allCells();

// Super-block anchors may sit just outside the visible chunk range when one of
// their absorbed siblings is visible. Include the anchor so the merged render
// covers the visible absorbed area (otherwise the sibling skips itself while
// no one renders its footprint).
function withAnchors(cells: CellInfo[]): CellInfo[] {
  const byKey = new Map<string, CellInfo>();
  for (const info of cells) byKey.set(`${info.col},${info.row}`, info);
  for (const info of cells) {
    const c = info.cell;
    const ref =
      (c.kind === 'building' && c.mergedInto) || (c.kind === 'road' && c.mergedInto) || null;
    if (!ref) continue;
    const key = `${ref.col},${ref.row}`;
    if (byKey.has(key)) continue;
    const anchorCell = getCell(ref.col, ref.row);
    if (!anchorCell) continue;
    byKey.set(key, {
      col: ref.col,
      row: ref.row,
      cell: anchorCell,
      center: cellCenter(ref.col, ref.row),
      size: cellSize(ref.col, ref.row),
    });
  }
  return Array.from(byKey.values());
}

export function visibleForChunk(key: ChunkKey): CellInfo[] {
  if (key.kind === 'on-grid') {
    return withAnchors(
      ALL.filter(({ col, row }) => cellInChunkRange(col, row, key.cc, key.cr)),
    );
  }
  // Off-grid: take the N closest grid cells within the view radius. From the
  // airport you only ever see the half of the city facing you anyway, so a
  // capped nearest-N list keeps the draw call count bounded while still
  // giving a city silhouette.
  const r2 = OFF_GRID_VIEW_M * OFF_GRID_VIEW_M;
  const ranked: { info: CellInfo; d2: number }[] = [];
  for (const info of ALL) {
    const dx = info.center[0] - key.px;
    const dz = info.center[2] - key.pz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) ranked.push({ info, d2 });
  }
  ranked.sort((a, b) => a.d2 - b.d2);
  return withAnchors(ranked.slice(0, OFF_GRID_MAX_CELLS).map((r) => r.info));
}

// Returns the player's current chunk key. Re-renders only when the player
// crosses a chunk boundary (on-grid) or moves OFF_GRID_SNAP_M off-grid.
// Shared by `useVisibleCells` and the distant-LOD ring so both recompute on
// the same cadence.
export function useChunkKey(): ChunkKey {
  const initial = playerChunk();
  const lastRef = useRef<ChunkKey>(initial);
  const [key, setKey] = useState<ChunkKey>(initial);

  useFrame(() => {
    const cur = playerChunk();
    if (chunksEqual(cur, lastRef.current)) return;
    lastRef.current = cur;
    setKey(cur);
  });

  return key;
}

// Hook: returns the list of cells visible for the current player chunk.
// Re-renders the caller only when the player crosses a chunk boundary OR
// when they cross the on-grid / off-grid boundary.
export function useVisibleCells(): CellInfo[] {
  const key = useChunkKey();
  return useMemo(() => visibleForChunk(key), [key]);
}
