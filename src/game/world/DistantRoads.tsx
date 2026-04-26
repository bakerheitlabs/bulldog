import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  allCells,
  cellBounds,
  type CellInfo,
  type RoadCell,
} from './cityLayout';
import { getPlayerPos, useChunkKey, visibleForChunk } from './Chunks';

// Matches DistantBuildings so the silhouette and the road grid extend equally
// far from the player; tuning this in tandem keeps the city reading at
// distance.
const OUTER_RADIUS = 2800;

// Road cells alternate with block cells on each axis, so the upper bound on
// road cells is roughly COLS*ROWS / 2 ≈ 312. Padding to 400 gives headroom.
const MAX_INSTANCES = 400;

// Sit just above the base ground (Y=0) but BELOW the detailed road's asphalt
// (Y=0.01). If the LOD ever overlaps a detailed cell — whether from a
// transient frame mismatch on chunk crossings or an exclusion-set bug —
// detailed wins the depth test and the LOD plane stays hidden. Park surfaces
// are at Y=0.02, so 0.005 also stays clear of those.
const ROAD_LOD_Y = 0.005;
// Same hex as the detailed road's ROAD_COLOR so the LOD seam is invisible.
const ROAD_LOD_COLOR = '#2d2d33';

type RoadFootprint = {
  col: number;
  row: number;
  cx: number;
  cz: number;
  width: number;
  depth: number;
};

function resolveRoad(info: CellInfo): RoadFootprint | null {
  const cell = info.cell;
  if (cell.kind !== 'road') return null;
  // Road cells absorbed into a super-block don't render — the anchoring
  // building covers them.
  if ((cell as RoadCell).mergedInto) return null;
  const bounds = cellBounds(info.col, info.row);
  return {
    col: info.col,
    row: info.row,
    cx: (bounds.minX + bounds.maxX) / 2,
    cz: (bounds.minZ + bounds.maxZ) / 2,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ,
  };
}

const ALL_ROADS: RoadFootprint[] = allCells()
  .map(resolveRoad)
  .filter((f): f is RoadFootprint => f !== null);

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export default function DistantRoads() {
  const chunk = useChunkKey();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Single flat plane reused across instances. PlaneGeometry sits in the XY
  // plane by default (normal +Z); we rotate it to lie in the XZ plane (normal
  // +Y) so per-instance scale.x / scale.z directly map to road footprint
  // width / depth. Scale.y is a no-op on a flat plane so we don't bother
  // setting it on each instance.
  const { geometry, material } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(1, 1);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: ROAD_LOD_COLOR });
    return { geometry: geom, material: mat };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Detailed cells the chunked Roads renderer is currently drawing — skip
  // those in the LOD pass so we never coincide. Recomputed only on chunk
  // crossings.
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
    for (const fp of ALL_ROADS) {
      if (n >= MAX_INSTANCES) break;
      if (detailedKeys.has(cellKey(fp.col, fp.row))) continue;
      const dx = fp.cx - px;
      const dz = fp.cz - pz;
      if (dx * dx + dz * dz > outerR2) continue;
      matrix.makeScale(fp.width, 1, fp.depth);
      matrix.setPosition(fp.cx, ROAD_LOD_Y, fp.cz);
      mesh.setMatrixAt(n, matrix);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [detailedKeys]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
    />
  );
}
