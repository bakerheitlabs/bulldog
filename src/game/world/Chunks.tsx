import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { allCells, BLOCK_SIZE, COLS, ROWS, type CellInfo } from './cityLayout';
import { useGameStore } from '@/state/gameStore';

const CHUNK_SIZE = 3; // cells per chunk side (150m)
// Chunks around the player to keep mounted. 1 = 3x3 chunk block = 9x9 = 81
// cells visible (~450m diameter) — plenty for camera distance while leaving
// most of the 15x15 city culled.
const VIEW_RADIUS = 1;

function playerChunk(): [number, number] {
  const [px, , pz] = useGameStore.getState().player.position;
  const col = Math.floor(px / BLOCK_SIZE + COLS / 2);
  const row = Math.floor(pz / BLOCK_SIZE + ROWS / 2);
  return [Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE)];
}

function cellInChunkRange(col: number, row: number, cc: number, cr: number): boolean {
  const c = Math.floor(col / CHUNK_SIZE);
  const r = Math.floor(row / CHUNK_SIZE);
  return Math.abs(c - cc) <= VIEW_RADIUS && Math.abs(r - cr) <= VIEW_RADIUS;
}

const ALL = allCells();

// Hook: returns the list of cells visible for the current player chunk.
// Re-renders the caller only when the player crosses a chunk boundary.
export function useVisibleCells(): CellInfo[] {
  const initial = playerChunk();
  const lastRef = useRef<[number, number]>(initial);
  const [visible, setVisible] = useState<CellInfo[]>(() =>
    ALL.filter(({ col, row }) => cellInChunkRange(col, row, initial[0], initial[1])),
  );

  useFrame(() => {
    const [cc, cr] = playerChunk();
    if (cc === lastRef.current[0] && cr === lastRef.current[1]) return;
    lastRef.current = [cc, cr];
    setVisible(ALL.filter(({ col, row }) => cellInChunkRange(col, row, cc, cr)));
  });

  return visible;
}
