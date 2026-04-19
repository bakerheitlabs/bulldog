import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import {
  allCells,
  cellCenter,
  cellSize,
  COLS,
  getCell,
  ROWS,
  worldToCell,
  type CellInfo,
} from './cityLayout';
import { useGameStore } from '@/state/gameStore';

const CHUNK_SIZE = 3; // cells per chunk side
// Chunks around the player to keep mounted. 1 = 3x3 chunk block = 9x9 = 81
// cells visible — plenty for camera distance while leaving most of the 15x15
// city culled.
const VIEW_RADIUS = 1;

function playerChunk(): [number, number] {
  const [px, , pz] = useGameStore.getState().player.position;
  const cell = worldToCell(px, pz);
  const col = cell ? cell.col : px < 0 ? 0 : COLS - 1;
  const row = cell ? cell.row : pz < 0 ? 0 : ROWS - 1;
  return [Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE)];
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

// Hook: returns the list of cells visible for the current player chunk.
// Re-renders the caller only when the player crosses a chunk boundary.
export function useVisibleCells(): CellInfo[] {
  const initial = playerChunk();
  const lastRef = useRef<[number, number]>(initial);
  const [visible, setVisible] = useState<CellInfo[]>(() =>
    withAnchors(
      ALL.filter(({ col, row }) => cellInChunkRange(col, row, initial[0], initial[1])),
    ),
  );

  useFrame(() => {
    const [cc, cr] = playerChunk();
    if (cc === lastRef.current[0] && cr === lastRef.current[1]) return;
    lastRef.current = [cc, cr];
    setVisible(withAnchors(ALL.filter(({ col, row }) => cellInChunkRange(col, row, cc, cr))));
  });

  return visible;
}
