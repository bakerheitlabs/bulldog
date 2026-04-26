import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  SIDEWALK_WIDTH,
  allCells,
  cellBounds,
  type BuildingCell,
  type CellInfo,
} from './cityLayout';
import { getPlayerPos, useChunkKey, visibleForChunk } from './Chunks';

// Outer radius governs how far the city silhouette extends. Pushed well
// beyond the city's own ~1km extent so the skyline keeps reading from any
// vantage point — flying high or driving the airport highway both see the
// full city block out to the horizon.
const OUTER_RADIUS = 2800;

// Capacity for the InstancedMesh. The 25×25 grid alternates road/block so the
// upper bound on building cells is ~13×13 = 169 anchors. 256 leaves headroom.
const MAX_INSTANCES = 256;

// Pre-resolved list of every building anchor in the city. We do the merge
// resolution + footprint inset once at module load — every chunk crossing
// just filters this list, no recomputation of geometry.
type BuildingFootprint = {
  col: number;
  row: number;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  height: number;
  color: THREE.Color;
};

function resolveFootprint(info: CellInfo): BuildingFootprint | null {
  const cell = info.cell;
  if (cell.kind !== 'building') return null;
  // Absorbed siblings inside a super-block don't render on their own; the
  // anchor cell carries the merged footprint and renders the whole thing.
  if ((cell as BuildingCell).mergedInto) return null;
  const merged = (cell as BuildingCell).mergedBounds;
  const bounds = merged ?? cellBounds(info.col, info.row);
  // Buildings are rendered inset by SIDEWALK_WIDTH from the cell edges to
  // leave room for sidewalks; mirror that here so the LOD silhouette aligns
  // with the actual buildings on the boundary between detailed and LOD.
  const inset = SIDEWALK_WIDTH;
  const width = Math.max(1, bounds.maxX - bounds.minX - 2 * inset);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ - 2 * inset);
  return {
    col: info.col,
    row: info.row,
    cx: (bounds.minX + bounds.maxX) / 2,
    cz: (bounds.minZ + bounds.maxZ) / 2,
    width,
    depth,
    height: cell.height,
    color: new THREE.Color(cell.color),
  };
}

const ALL_FOOTPRINTS: BuildingFootprint[] = allCells()
  .map(resolveFootprint)
  .filter((f): f is BuildingFootprint => f !== null);

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export default function DistantBuildings() {
  const chunk = useChunkKey();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Single 1×1×1 box geometry + Lambert material reused by every instance.
  // Lambert is ~half the fragment cost of Standard and looks fine at the
  // distances this LOD covers.
  const { geometry, material } = useMemo(() => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    return { geometry: geom, material: mat };
  }, []);

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Keys of the cells that the detailed renderer is currently drawing — the
  // LOD ring skips them so detailed and LOD never coincide. Recomputed only
  // when the player crosses a chunk boundary.
  const detailedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const info of visibleForChunk(chunk)) set.add(cellKey(info.col, info.row));
    return set;
  }, [chunk]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const [px, pz] = getPlayerPos();
    const outerR2 = OUTER_RADIUS * OUTER_RADIUS;
    const matrix = new THREE.Matrix4();
    let n = 0;
    for (const fp of ALL_FOOTPRINTS) {
      if (n >= MAX_INSTANCES) break;
      // Skip cells the detailed renderer is handling so the two systems
      // never overlap. This also closes the previous gap where a cell just
      // outside the detailed block was inside a fixed inner-radius
      // exclusion and ended up rendered by neither.
      if (detailedKeys.has(cellKey(fp.col, fp.row))) continue;
      const dx = fp.cx - px;
      const dz = fp.cz - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > outerR2) continue;
      // Box geometry is unit-cube centered at origin → scale to footprint and
      // lift so the box sits flat on Y=0.
      matrix.makeScale(fp.width, fp.height, fp.depth);
      matrix.setPosition(fp.cx, fp.height / 2, fp.cz);
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, fp.color);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Recompute bounding sphere so frustum culling stays correct after the
    // instance set changes; without this, instances near the screen edge can
    // pop out incorrectly when the camera pans.
    mesh.computeBoundingSphere();
  }, [detailedKeys]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      // No shadows on the LOD ring — the directional shadow camera only
      // covers ±150m (matches the detailed area), and casting from
      // distant boxes would either blow that out or produce visible shadow
      // edges where the LOD ends.
      castShadow={false}
      receiveShadow={false}
      frustumCulled
    />
  );
}
