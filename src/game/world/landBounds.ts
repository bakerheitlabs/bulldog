// Shared island geometry. Builds an organic, rounded island around the union
// of (city + suburbs + airport) and exposes the resulting THREE.Shape pair
// (grass + beach) plus a hull point cloud for the physics collider.
//
// The perimeter is a rounded rectangle (4 straight sides + quarter-arc
// corners) with seeded radial noise added along the outward normal so the
// shoreline reads as a coastline rather than a stamped silhouette.

import * as THREE from 'three';
import { CITY_DEPTH, CITY_MIN_X, CITY_MIN_Z, CITY_WIDTH } from './cityLayout';
import { getSplineRegionBounds } from './splineRegions';

export const BEACH_WIDTH = 36;
const ISLAND_SAMPLES = 160; // smoothness of the perimeter polygon
const CORNER_RADIUS = 160;  // quarter-arc radius at each rectangle corner
const NOISE_AMP = 26;       // peak ± wobble (m) along the outward normal
const NOISE_SEED = 7;

export type LandBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

function getInnerRect(): LandBounds {
  const r = getSplineRegionBounds();
  return {
    minX: Math.min(CITY_MIN_X, r.minX),
    maxX: Math.max(CITY_MIN_X + CITY_WIDTH, r.maxX),
    minZ: Math.min(CITY_MIN_Z, r.minZ),
    maxZ: Math.max(CITY_MIN_Z + CITY_DEPTH, r.maxZ),
  };
}

// Periodic noise on t ∈ [0,1). Three sin harmonics with seeded phase offsets
// give a smooth wobble that wraps cleanly without a visible seam.
function perimeterNoise(t: number, seed: number): number {
  const w = t * Math.PI * 2;
  return (
    Math.sin(w * 2 + seed * 1.3) * 0.55 +
    Math.sin(w * 5 + seed * 2.7) * 0.30 +
    Math.sin(w * 11 + seed * 4.9) * 0.15
  );
}

type PerimeterSample = { x: number; z: number; nx: number; nz: number };

// Walk a rounded rectangle by arc length, sampling N points with their
// outward normals. Order goes CCW from above (top side L→R, then TR arc,
// right side, BR arc, bottom L←R, BL arc, left side, TL arc).
function buildPerimeter(rect: LandBounds, R: number, samples: number): PerimeterSample[] {
  const { minX, maxX, minZ, maxZ } = rect;
  const sideX = maxX - minX - 2 * R; // top + bottom straight length
  const sideZ = maxZ - minZ - 2 * R; // left + right straight length
  const arcLen = (Math.PI / 2) * R;
  const total = 2 * sideX + 2 * sideZ + 4 * arcLen;

  const out: PerimeterSample[] = [];
  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * total;
    let x = 0;
    let z = 0;
    let nx = 0;
    let nz = 0;
    if (d < sideX) {
      const u = d / sideX;
      x = minX + R + u * sideX;
      z = maxZ;
      nz = 1;
    } else if ((d -= sideX) < arcLen) {
      const ang = Math.PI / 2 - (d / arcLen) * (Math.PI / 2); // π/2 → 0
      x = maxX - R + R * Math.cos(ang);
      z = maxZ - R + R * Math.sin(ang);
      nx = Math.cos(ang);
      nz = Math.sin(ang);
    } else if ((d -= arcLen) < sideZ) {
      const u = d / sideZ;
      x = maxX;
      z = maxZ - R - u * sideZ;
      nx = 1;
    } else if ((d -= sideZ) < arcLen) {
      const ang = -(d / arcLen) * (Math.PI / 2); // 0 → -π/2
      x = maxX - R + R * Math.cos(ang);
      z = minZ + R + R * Math.sin(ang);
      nx = Math.cos(ang);
      nz = Math.sin(ang);
    } else if ((d -= arcLen) < sideX) {
      const u = d / sideX;
      x = maxX - R - u * sideX;
      z = minZ;
      nz = -1;
    } else if ((d -= sideX) < arcLen) {
      const ang = -Math.PI / 2 - (d / arcLen) * (Math.PI / 2); // -π/2 → -π
      x = minX + R + R * Math.cos(ang);
      z = minZ + R + R * Math.sin(ang);
      nx = Math.cos(ang);
      nz = Math.sin(ang);
    } else if ((d -= arcLen) < sideZ) {
      const u = d / sideZ;
      x = minX;
      z = minZ + R + u * sideZ;
      nx = -1;
    } else {
      d -= sideZ;
      const ang = Math.PI - (d / arcLen) * (Math.PI / 2); // π → π/2
      x = minX + R + R * Math.cos(ang);
      z = maxZ - R + R * Math.sin(ang);
      nx = Math.cos(ang);
      nz = Math.sin(ang);
    }
    const t = i / samples;
    const offset = perimeterNoise(t, NOISE_SEED) * NOISE_AMP;
    out.push({ x: x + nx * offset, z: z + nz * offset, nx, nz });
  }
  return out;
}

// THREE.Shape lives in a 2D coordinate space that we render as XZ via a
// rotation of -π/2 around X. With that rotation, mesh-local (x, y, 0) maps to
// world (x, 0, -y). To make shape-space coords correspond to world XZ, store
// shape.y = -worldZ — handled here so callers just see world coords going in
// and out.
function shapeFromSamples(samples: PerimeterSample[], offset: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const px = s.x + s.nx * offset;
    const pz = s.z + s.nz * offset;
    if (i === 0) shape.moveTo(px, -pz);
    else shape.lineTo(px, -pz);
  }
  shape.closePath();
  return shape;
}

type IslandData = {
  innerShape: THREE.Shape;
  outerShape: THREE.Shape;
  // Convex-hull point cloud for the physics collider: top + bottom rings of
  // outer-perimeter points so the hull is a 3D solid with thickness.
  hullPoints: Float32Array;
  bounds: LandBounds; // AABB of outer perimeter
};

let _cached: IslandData | null = null;

export function getIslandData(): IslandData {
  if (_cached) return _cached;
  const samples = buildPerimeter(getInnerRect(), CORNER_RADIUS, ISLAND_SAMPLES);
  const innerShape = shapeFromSamples(samples, 0);
  const outerShape = shapeFromSamples(samples, BEACH_WIDTH);

  const HULL_DEPTH = 1; // 1m of collider thickness — keeps fast vehicles from tunneling
  const hull = new Float32Array(samples.length * 6);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const x = s.x + s.nx * BEACH_WIDTH;
    const z = s.z + s.nz * BEACH_WIDTH;
    hull[i * 6 + 0] = x;
    hull[i * 6 + 1] = 0;
    hull[i * 6 + 2] = z;
    hull[i * 6 + 3] = x;
    hull[i * 6 + 4] = -HULL_DEPTH;
    hull[i * 6 + 5] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  _cached = {
    innerShape,
    outerShape,
    hullPoints: hull,
    bounds: { minX, maxX, minZ, maxZ },
  };
  return _cached;
}

// AABB of the beach perimeter — for distant-LOD systems that want a
// conservative rectangle rather than the curved polygon.
export function getLandBounds(): LandBounds {
  return getIslandData().bounds;
}

export function getInnerLandBounds(): LandBounds {
  return getInnerRect();
}
