import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  BUILDING_COLORS,
  SIDEWALK_WIDTH,
  allCells,
  type BuildingCell,
  type CellInfo,
} from './cityLayout';
import { getPlayerPos, useChunkKey, visibleForChunk } from './Chunks';

// Outer radius governs how far the city silhouette extends.
const OUTER_RADIUS = 2800;

// Capacity for the InstancedMesh. Subdivided cells emit up to 4 primitives,
// so the upper bound is ~169 anchor cells × 4 ≈ 676 — round up for headroom.
const MAX_INSTANCES = 800;

// Sampled wall color for the Kenney `building_generic` GLB. The wall faces
// (triangles whose normal isn't vertical) map mostly to two near-white strips
// in the colormap (#e8e8f0 ~16% area, #d8d8e6 ~13%), with a darker grey accent
// behind. We use the second-lightest as a slight grey tint so the LOD doesn't
// look paper-pure-white while the detailed building has subtle shading.
// Re-sample if the GLB or colormap.png changes.
const WALL_COLOR = '#d8d8e6';
// Gunstore is also white-walled in the GLB sample, but it's a landmark — keep
// the red so players can spot it from a distance even at LOD.
const GUNSTORE_COLOR = '#a83a2c';
// Alleys between subdivided lots — Buildings.tsx widths must match.
const ALLEY_WIDTH = 2;

// Tiny hashed RNG, lifted verbatim from Buildings.tsx. Seeds are stable per
// (col, row, salt), so this LOD path generates the SAME jitters / heights /
// colors that the detailed renderer does — guaranteeing the LOD silhouette
// lines up with detail when the player crosses the chunk seam.
function hashRand(col: number, row: number, salt: number): number {
  let x = (col * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

type Lot = { x: number; z: number; w: number; d: number; h: number; color: string };

function subdivideLots(
  col: number,
  row: number,
  x: number,
  z: number,
  w: number,
  d: number,
): Lot[] {
  const lots: Lot[] = [];
  const rollSplit = hashRand(col, row, 7);
  const ratio = w / d;
  let mode: '2x1' | '1x2' | '2x2';
  if (ratio > 1.25) mode = '2x1';
  else if (ratio < 0.8) mode = '1x2';
  else mode = rollSplit < 0.5 ? '2x1' : '2x2';

  const cellSeed = (slot: number) => {
    const rh = hashRand(col, row, 11 + slot);
    const rc = hashRand(col, row, 29 + slot);
    return {
      h: 8 + Math.floor(rh * 18),
      color: BUILDING_COLORS[Math.floor(rc * BUILDING_COLORS.length)],
    };
  };
  const pushLot = (lx: number, lz: number, lw: number, ld: number, slot: number) => {
    const { h, color } = cellSeed(slot);
    lots.push({ x: lx, z: lz, w: lw, d: ld, h, color });
  };

  if (mode === '2x1') {
    const subW = (w - ALLEY_WIDTH) / 2;
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z, subW, d, 0);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z, subW, d, 1);
  } else if (mode === '1x2') {
    const subD = (d - ALLEY_WIDTH) / 2;
    pushLot(x, z - subD / 2 - ALLEY_WIDTH / 2, w, subD, 0);
    pushLot(x, z + subD / 2 + ALLEY_WIDTH / 2, w, subD, 1);
  } else {
    const subW = (w - ALLEY_WIDTH) / 2;
    const subD = (d - ALLEY_WIDTH) / 2;
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z - subD / 2 - ALLEY_WIDTH / 2, subW, subD, 0);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z - subD / 2 - ALLEY_WIDTH / 2, subW, subD, 1);
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z + subD / 2 + ALLEY_WIDTH / 2, subW, subD, 2);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z + subD / 2 + ALLEY_WIDTH / 2, subW, subD, 3);
  }
  return lots;
}

type Primitive = {
  col: number;
  row: number;
  cx: number;
  cz: number;
  width: number;
  height: number;
  depth: number;
  color: THREE.Color;
};

// Returns the list of LOD primitives for a single cell. Mirrors the branching
// in Buildings.tsx so the LOD silhouette matches what the detailed renderer
// draws (down to the per-lot positions, jitters, and colors).
function cellPrimitives(info: CellInfo): Primitive[] {
  const cell = info.cell;
  if (cell.kind !== 'building') return [];
  const b = cell as BuildingCell;
  if (b.mergedInto) return [];

  // Resolve footprint — super-block anchors get the merged bounds; everyone
  // else uses their own cell.
  let cx: number;
  let cz: number;
  let cw: number;
  let cd: number;
  if (b.mergedBounds) {
    cx = (b.mergedBounds.minX + b.mergedBounds.maxX) / 2;
    cz = (b.mergedBounds.minZ + b.mergedBounds.maxZ) / 2;
    cw = b.mergedBounds.maxX - b.mergedBounds.minX;
    cd = b.mergedBounds.maxZ - b.mergedBounds.minZ;
  } else {
    cx = info.center[0];
    cz = info.center[2];
    cw = info.size.width;
    cd = info.size.depth;
  }
  const w = cw - SIDEWALK_WIDTH * 2;
  const d = cd - SIDEWALK_WIDTH * 2;
  const h = b.height;

  const isGunstore = b.tag === 'gunstore';
  const isRange = b.tag === 'range';
  const isMechanic = b.tag === 'mechanic';
  const isHospital = b.tag === 'hospital';

  // Mechanic shop is an open three-walled bay — Buildings.tsx renders it as a
  // detailed structure, but for LOD a single low box approximates it well.
  if (isMechanic) {
    return [
      {
        col: info.col,
        row: info.row,
        cx,
        cz,
        width: w,
        height: 3.2,
        depth: d,
        color: new THREE.Color(b.color),
      },
    ];
  }
  // Hospital uses cell color in the detailed renderer's interior.
  if (isHospital) {
    return [
      {
        col: info.col,
        row: info.row,
        cx,
        cz,
        width: w,
        height: h,
        depth: d,
        color: new THREE.Color(b.color),
      },
    ];
  }

  if (b.blockType === 'plaza') {
    // Plaza is a tree-lined open square — no buildings to silhouette.
    return [];
  }

  if (b.blockType === 'subdivided') {
    return subdivideLots(info.col, info.row, cx, cz, w, d).map((lot) => ({
      col: info.col,
      row: info.row,
      cx: lot.x,
      cz: lot.z,
      width: lot.w,
      height: lot.h,
      depth: lot.d,
      color: new THREE.Color(lot.color),
    }));
  }

  if (b.blockType === 'mixed') {
    // Half-cell building + half-cell parking lot. Mirror the split direction
    // and side selection from MixedBlock so the LOD lands on the same half.
    const alongX = w >= d;
    const halfW = alongX ? w / 2 - 0.4 : w;
    const halfD = alongX ? d : d / 2 - 0.4;
    const buildingOnFirstHalf = hashRand(info.col, info.row, 91) < 0.5;
    const sign = buildingOnFirstHalf ? -1 : 1;
    const bx = alongX ? cx + sign * (w / 4 + 0.2) : cx;
    const bz = alongX ? cz : cz + sign * (d / 4 + 0.2);
    return [
      {
        col: info.col,
        row: info.row,
        cx: bx,
        cz: bz,
        width: halfW,
        height: h,
        depth: halfD,
        color: new THREE.Color(isGunstore ? GUNSTORE_COLOR : b.color),
      },
    ];
  }

  // 'standard' — single building. Mirror the per-cell jitter applied in
  // Buildings.tsx so the LOD footprint matches the GLB's actual placement.
  // Tagged landmarks (gunstore/range/hospital) keep their full cell footprint.
  let bx = cx;
  let bz = cz;
  let bw = w;
  let bd = d;
  if (!isGunstore && !isRange && !isHospital) {
    const scaleW = 0.65 + hashRand(info.col, info.row, 131) * 0.3;
    const scaleD = 0.65 + hashRand(info.col, info.row, 149) * 0.3;
    bw = w * scaleW;
    bd = d * scaleD;
    const slackX = w - bw;
    const slackZ = d - bd;
    bx = cx + (hashRand(info.col, info.row, 157) - 0.5) * 0.5 * slackX;
    bz = cz + (hashRand(info.col, info.row, 173) - 0.5) * 0.5 * slackZ;
  }
  // Standard cells render the white-walled Kenney GLB; LOD matches that with
  // WALL_COLOR. Gunstore stays red as a landmark, range keeps its cell.color
  // so the firing range still reads as distinct from neighboring buildings.
  // Variety comes from the subdivided/mixed/mechanic/hospital branches above.
  const color = isGunstore ? GUNSTORE_COLOR : isRange ? b.color : WALL_COLOR;
  return [
    {
      col: info.col,
      row: info.row,
      cx: bx,
      cz: bz,
      width: bw,
      height: h,
      depth: bd,
      color: new THREE.Color(color),
    },
  ];
}

const ALL_PRIMITIVES: Primitive[] = allCells().flatMap(cellPrimitives);

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export default function DistantBuildings() {
  const chunk = useChunkKey();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { geometry, material } = useMemo(() => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    return { geometry: geom, material: mat };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

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
    for (const p of ALL_PRIMITIVES) {
      if (n >= MAX_INSTANCES) break;
      // Skip the whole CELL if its detailed version is currently rendering —
      // every primitive belongs to one cell, so a single key check covers
      // mixed/subdivided lots together.
      if (detailedKeys.has(cellKey(p.col, p.row))) continue;
      const dx = p.cx - px;
      const dz = p.cz - pz;
      if (dx * dx + dz * dz > outerR2) continue;
      matrix.makeScale(p.width, p.height, p.depth);
      matrix.setPosition(p.cx, p.height / 2, p.cz);
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, p.color);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
