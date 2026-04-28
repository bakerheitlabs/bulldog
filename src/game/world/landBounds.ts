// Shared landmass geometry. Builds one or more organic islands from a list of
// LandmassSpecs and exposes per-island THREE.Shape pairs (grass + beach) plus
// hull point clouds for physics colliders.
//
// Each landmass is a rounded rectangle (4 straight sides + per-corner radii)
// with seeded radial noise + optional Gaussian "bay" carves added along the
// outward normal so the shoreline reads as a coastline rather than a stamped
// silhouette. The first entry is the main island (city + east suburb + the
// main airport); additional entries come from external island modules
// (e.g. island2.ts) that contribute their own LandmassSpec.

import * as THREE from 'three';
import { CITY_DEPTH, CITY_MIN_X, CITY_MIN_Z, CITY_WIDTH } from './cityLayout';
import { getSuburbBounds } from './suburbs';
import { getMainAirportPadBounds } from './airport';
import { ISLAND2_LANDMASS } from './island2';
import { ISLAND3_CITY } from './island3';

export const BEACH_WIDTH = 36;
// Water plane sits a hair below the grass baseline (y=0). Exported so movement
// code can detect "in water" without re-declaring the constant per-call site.
export const WATER_Y = -0.02;
const ISLAND_SAMPLES = 192; // smoothness of the perimeter polygon

export type LandBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

// One inward-pulling carve along the perimeter. `tCenter` is the parameter
// position around the polygon (0..1), `tWidth` is the half-width of the bell
// curve in the same parameter space, and `depth` is the meters of inward pull
// at the bell's peak. Multiple bays compose by summing their pulls.
export type BayCarve = {
  tCenter: number;
  tWidth: number;
  depth: number;
};

// Per-octave amplitude. Octave i contributes a sine wave at a unique
// frequency with seeded phase. Amplitudes typically taper down across octaves
// so the low-frequency terms shape the silhouette and the high-frequency
// terms add crinkle without dominating.
export type NoiseProfile = {
  seed: number;
  amplitudes: number[]; // meters; index 0 is the lowest frequency
};

export type LandmassSpec = {
  id: string;
  // Inner content rectangle that the perimeter must enclose with margin.
  innerRect: LandBounds;
  // Quarter-arc radius at each corner. Order: [topRight, bottomRight, bottomLeft, topLeft].
  // Asymmetric radii break the perfect-rectangle silhouette.
  cornerRadii: [number, number, number, number];
  noise: NoiseProfile;
  bays?: BayCarve[];
};

// Sin-octave noise on t ∈ [0,1). Each octave's phase is offset by the seed so
// different islands read differently. Wraps cleanly on t=1 because every
// octave's frequency is an integer multiple of 2π.
function octaveNoise(t: number, profile: NoiseProfile): number {
  const w = t * Math.PI * 2;
  let sum = 0;
  // Frequencies chosen to be coprime-ish so the octaves don't beat into a
  // visible repeat: 3, 5, 7, 11, 13...
  const freqs = [3, 5, 7, 11, 13, 17];
  for (let i = 0; i < profile.amplitudes.length; i++) {
    const f = freqs[i] ?? freqs[freqs.length - 1] + i;
    const phase = profile.seed * (1.3 + i * 0.97);
    sum += Math.sin(w * f + phase) * profile.amplitudes[i];
  }
  return sum;
}

// Sum of bell-curve inward pulls. `t` is the perimeter parameter; the result
// is meters to subtract from the radial offset (i.e. pull the coast inward).
// Wrapping is handled by considering the carve at t and at t±1 so a bay near
// t=0 still affects t=0.99 samples.
function bayPull(t: number, bays: BayCarve[] | undefined): number {
  if (!bays || bays.length === 0) return 0;
  let pull = 0;
  for (const bay of bays) {
    for (const dt of [-1, 0, 1]) {
      const u = (t - bay.tCenter + dt) / Math.max(0.0001, bay.tWidth);
      pull += bay.depth * Math.exp(-u * u);
    }
  }
  return pull;
}

type PerimeterSample = { x: number; z: number; nx: number; nz: number };

// Walk a rounded rectangle by arc length, sampling N points with their
// outward normals. Order goes CCW from above (top side L→R, then TR arc,
// right side, BR arc, bottom L←R, BL arc, left side, TL arc). Per-corner
// radii are ordered [TR, BR, BL, TL] to match the traversal.
function buildPerimeter(spec: LandmassSpec, samples: number): PerimeterSample[] {
  const { minX, maxX, minZ, maxZ } = spec.innerRect;
  const [rTR, rBR, rBL, rTL] = spec.cornerRadii;
  // Straight side lengths: each side is bounded by the radii of the two
  // corners it connects, so different corners on the same side shorten the
  // straight differently than a uniform-radius rounded rect would.
  const topLen = maxX - minX - (rTL + rTR);
  const rightLen = maxZ - minZ - (rTR + rBR);
  const botLen = maxX - minX - (rBL + rBR);
  const leftLen = maxZ - minZ - (rTL + rBL);
  const arc = (r: number) => (Math.PI / 2) * r;
  const lens = [
    topLen,
    arc(rTR),
    rightLen,
    arc(rBR),
    botLen,
    arc(rBL),
    leftLen,
    arc(rTL),
  ];
  const total = lens.reduce((a, b) => a + b, 0);

  const out: PerimeterSample[] = [];
  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * total;
    let x = 0;
    let z = 0;
    let nx = 0;
    let nz = 0;
    let leg = 0;
    while (leg < lens.length && d >= lens[leg]) {
      d -= lens[leg];
      leg++;
    }
    switch (leg) {
      case 0: {
        const u = topLen > 0 ? d / topLen : 0;
        x = minX + rTL + u * topLen;
        z = maxZ;
        nz = 1;
        break;
      }
      case 1: {
        const ang = Math.PI / 2 - (d / Math.max(0.0001, arc(rTR))) * (Math.PI / 2);
        x = maxX - rTR + rTR * Math.cos(ang);
        z = maxZ - rTR + rTR * Math.sin(ang);
        nx = Math.cos(ang);
        nz = Math.sin(ang);
        break;
      }
      case 2: {
        const u = rightLen > 0 ? d / rightLen : 0;
        x = maxX;
        z = maxZ - rTR - u * rightLen;
        nx = 1;
        break;
      }
      case 3: {
        const ang = -(d / Math.max(0.0001, arc(rBR))) * (Math.PI / 2);
        x = maxX - rBR + rBR * Math.cos(ang);
        z = minZ + rBR + rBR * Math.sin(ang);
        nx = Math.cos(ang);
        nz = Math.sin(ang);
        break;
      }
      case 4: {
        const u = botLen > 0 ? d / botLen : 0;
        x = maxX - rBR - u * botLen;
        z = minZ;
        nz = -1;
        break;
      }
      case 5: {
        const ang = -Math.PI / 2 - (d / Math.max(0.0001, arc(rBL))) * (Math.PI / 2);
        x = minX + rBL + rBL * Math.cos(ang);
        z = minZ + rBL + rBL * Math.sin(ang);
        nx = Math.cos(ang);
        nz = Math.sin(ang);
        break;
      }
      case 6: {
        const u = leftLen > 0 ? d / leftLen : 0;
        x = minX;
        z = minZ + rBL + u * leftLen;
        nx = -1;
        break;
      }
      default: {
        const ang = Math.PI - (d / Math.max(0.0001, arc(rTL))) * (Math.PI / 2);
        x = minX + rTL + rTL * Math.cos(ang);
        z = maxZ - rTL + rTL * Math.sin(ang);
        nx = Math.cos(ang);
        nz = Math.sin(ang);
        break;
      }
    }
    const t = i / samples;
    const offset = octaveNoise(t, spec.noise) - bayPull(t, spec.bays);
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

// World-space (x, z) point on a perimeter polygon.
export type PerimeterPoint = { x: number; z: number };

export type IslandData = {
  id: string;
  innerShape: THREE.Shape;
  outerShape: THREE.Shape;
  // Closed perimeter polygons in world coords. innerPolygon is the grass edge;
  // outerPolygon is the beach edge (BEACH_WIDTH outside). Used by the minimap
  // to draw the island silhouettes without re-deriving them from THREE.Shape.
  innerPolygon: PerimeterPoint[];
  outerPolygon: PerimeterPoint[];
  // Convex-hull point cloud for the physics collider: top + bottom rings of
  // outer-perimeter points so the hull is a 3D solid with thickness.
  hullPoints: Float32Array;
  // Underwater slope ring: a triangle mesh forming a ramp around the
  // perimeter from the beach edge (y=0) out to the shelf toe at
  // y=-BEACH_SLOPE_DROP. A trimesh handles the non-convex annular shape
  // cleanly — segmented convex hulls wrap each segment in their own
  // wedge-shape walls, which created small invisible kinks the swimmer kept
  // catching on. Kept separate from the main island hull because the
  // annulus isn't a convex shape.
  slopeVertices: Float32Array;
  slopeIndices: Uint32Array;
  bounds: LandBounds; // AABB of outer perimeter
};

// Slope geometry. The toe sits clearly below the swimmer's capsule bottom
// (~y=-1.22) so the swimmer passes OVER the toe edge and lands on the slope
// from above. RUN of 18m gives a gentle ~6.3° climb angle.
const BEACH_SLOPE_RUN = 18;
const BEACH_SLOPE_DROP = 2.0;
// Lift the inner edge of the slope slightly above the beach top so a swimmer
// climbing the ramp ENDS UP above beach height by the time they reach the
// perimeter — they then fall the last LIP onto the visible beach. Kept small
// (≤ capsule lower-hemisphere reach of 0.4m) so walking the OTHER way (off
// the beach into the water) still rolls the capsule over the lip without
// needing a jump.
const BEACH_SLOPE_LIP = 0.15;

function buildIslandData(spec: LandmassSpec): IslandData {
  const samples = buildPerimeter(spec, ISLAND_SAMPLES);
  const innerShape = shapeFromSamples(samples, 0);
  const outerShape = shapeFromSamples(samples, BEACH_WIDTH);

  const HULL_DEPTH = 1; // 1m of collider thickness — keeps fast vehicles from tunneling
  const hull = new Float32Array(samples.length * 6);
  const innerPolygon: PerimeterPoint[] = new Array(samples.length);
  const outerPolygon: PerimeterPoint[] = new Array(samples.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const x = s.x + s.nx * BEACH_WIDTH;
    const z = s.z + s.nz * BEACH_WIDTH;
    innerPolygon[i] = { x: s.x, z: s.z };
    outerPolygon[i] = { x, z };
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
  // Slope ring as a triangle strip between two concentric rings:
  //   inner ring: beach edge (outerPolygon) at y=0
  //   outer ring: shelf toe (outerPolygon + RUN, perimeter normal) at y=-DROP
  // Each adjacent pair of perimeter samples spans one quad split into two
  // triangles. Winding is chosen so the triangle normals point UP+OUTWARD —
  // i.e. the solid side of the trimesh is up, which is what the swimmer
  // ascends.
  const N = samples.length;
  const slopeVertices = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    // Inner ring vertex i — at outer perimeter, lifted by BEACH_SLOPE_LIP so
    // the slope crests above the visible beach. Capsule rides up to here,
    // then falls onto the prism top at y=0 once it crosses the perimeter.
    slopeVertices[i * 3 + 0] = s.x + s.nx * BEACH_WIDTH;
    slopeVertices[i * 3 + 1] = BEACH_SLOPE_LIP;
    slopeVertices[i * 3 + 2] = s.z + s.nz * BEACH_WIDTH;
    // Outer ring vertex i (at toe, y=-DROP)
    slopeVertices[(N + i) * 3 + 0] = s.x + s.nx * (BEACH_WIDTH + BEACH_SLOPE_RUN);
    slopeVertices[(N + i) * 3 + 1] = -BEACH_SLOPE_DROP;
    slopeVertices[(N + i) * 3 + 2] = s.z + s.nz * (BEACH_WIDTH + BEACH_SLOPE_RUN);
  }
  const slopeIndices = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    // Wind triangles CCW from above so face normals point UP (the side the
    // swimmer climbs). With perimeter samples ordered CCW from above, the
    // sequence inner[i] → inner[next] → outer[next] traces CCW.
    slopeIndices[i * 6 + 0] = i;
    slopeIndices[i * 6 + 1] = next;
    slopeIndices[i * 6 + 2] = N + next;
    slopeIndices[i * 6 + 3] = i;
    slopeIndices[i * 6 + 4] = N + next;
    slopeIndices[i * 6 + 5] = N + i;
  }

  return {
    id: spec.id,
    innerShape,
    outerShape,
    innerPolygon,
    outerPolygon,
    hullPoints: hull,
    slopeVertices,
    slopeIndices,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

// Spec for the main island: encloses the city grid, the east suburb, and the
// main airport. Other islands (e.g. island 2) own their own airports inside
// their own landmass spec.
function getMainIslandSpec(): LandmassSpec {
  const suburbBounds = getSuburbBounds();
  const aptBounds = getMainAirportPadBounds();
  const innerRect: LandBounds = {
    minX: Math.min(CITY_MIN_X, suburbBounds.minX, aptBounds.minX),
    maxX: Math.max(CITY_MIN_X + CITY_WIDTH, suburbBounds.maxX, aptBounds.maxX),
    minZ: Math.min(CITY_MIN_Z, suburbBounds.minZ, aptBounds.minZ),
    maxZ: Math.max(CITY_MIN_Z + CITY_DEPTH, suburbBounds.maxZ, aptBounds.maxZ),
  };
  return {
    id: 'main',
    innerRect,
    // Slightly varied corner radii so the silhouette no longer reads as a
    // uniform stamp. The previous single-radius shape (160m everywhere)
    // looked too regular up close.
    cornerRadii: [180, 140, 170, 150],
    // Three octaves matched to the previous look (sum of amplitudes ≈ 30m,
    // close to the original ±26m wobble).
    noise: { seed: 7, amplitudes: [16, 9, 5] },
  };
}

// Island 3 sits east of main, connected by a drivable bridge. Its landmass
// hugs the orthogonal grid defined in island3.ts; the bays carve out a small
// notch on the west coast facing the main island so the bridge entry feels
// like it sits in a small inlet.
//
// The inner rect is inflated past ISLAND3_CITY.bounds by GRID_MARGIN so the
// perimeter encloses the grid even at its corners (a rounded-rect corner with
// radius r cuts ~r*(1 - 1/√2) ≈ 0.3r inside the bounding box, plus the noise
// amplitudes can pull the coast inward further). Without that margin the
// corner blocks visibly poked into the water on the minimap.
function getIsland3Spec(): LandmassSpec {
  const GRID_MARGIN = 40;
  const b = ISLAND3_CITY.bounds;
  return {
    id: 'island3',
    innerRect: {
      minX: b.minX - GRID_MARGIN,
      maxX: b.maxX + GRID_MARGIN,
      minZ: b.minZ - GRID_MARGIN,
      maxZ: b.maxZ + GRID_MARGIN,
    },
    // Smaller, more uniform corner radii than before — island 3 is half the
    // main island's footprint, so the same per-corner numbers were eating a
    // larger fraction of the coastline.
    cornerRadii: [70, 60, 80, 65],
    // Lower amplitudes so coast wobble can't pull below the grid margin.
    noise: { seed: 53, amplitudes: [9, 5, 3, 2] },
    bays: [{ tCenter: 0.75, tWidth: 0.05, depth: 25 }],
  };
}

let _cached: IslandData[] | null = null;

export function getAllIslands(): IslandData[] {
  if (_cached) return _cached;
  _cached = [getMainIslandSpec(), ISLAND2_LANDMASS, getIsland3Spec()].map(buildIslandData);
  return _cached;
}

// Standard ray-casting point-in-polygon. Polygon is in world XZ coords.
function pointInPolygon(x: number, z: number, poly: PerimeterPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// True if (x,z) sits over any island's beach footprint (i.e. there's a land
// collider beneath that point). Used by movement code to decide between
// walking and swimming. AABB rejection keeps the per-frame cost tiny.
export function isOverLand(x: number, z: number): boolean {
  const islands = getAllIslands();
  for (const island of islands) {
    const b = island.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (pointInPolygon(x, z, island.outerPolygon)) return true;
  }
  return false;
}
