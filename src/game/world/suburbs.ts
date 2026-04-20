// Hand-authored suburban road overlay. Lives outside the orthogonal city grid
// and uses Catmull-Rom splines for curved collectors, Y/T junctions, and
// cul-de-sacs. The grid's existing lane graph only carries N/S/E/W traffic;
// suburbs attach at named GridHandoff anchors so the driving AI can later
// bridge in. For now this module only provides data + sampling; rendering
// asphalt happens in SuburbRoads.tsx.

import * as THREE from 'three';
import { ROAD_WIDTH, cellCenter, cellSize, type Vec3 } from './cityLayout';

export type JunctionKind = 'Y' | 'T' | 'culDeSac';

export type Junction = {
  id: string;
  pos: Vec3;
  kind: JunctionKind;
  radius: number;
};

// Attach point between the orthogonal grid's lane graph and a spline road.
// For this prototype the handoff is a pure position; wiring the lane graph
// across this boundary is deferred to the driving-AI step.
export type GridHandoff = {
  id: string;
  pos: Vec3;
};

export type SplineAnchor =
  | { kind: 'junction'; id: string }
  | { kind: 'gridHandoff'; id: string };

export type SplineRoad = {
  id: string;
  controls: Vec3[];
  width: number;
  start: SplineAnchor;
  end: SplineAnchor;
};

export type Suburb = {
  id: string;
  junctions: Junction[];
  handoffs: GridHandoff[];
  splines: SplineRoad[];
};

export type SplineSample = { pos: Vec3; tangent: Vec3 };

// Centripetal Catmull-Rom through the controls. Centripetal avoids the
// overshoots the default (uniform) parameterization produces when control
// spacing is uneven, which matters here because suburb authoring uses a mix
// of short and long segments.
export function sampleSpline(controls: Vec3[], samples: number): SplineSample[] {
  return sampleSplineRange(controls, samples, 0, 0);
}

// Samples the spline over the arc-length sub-range [trimStart, L - trimEnd].
// Used so spline ribbons stop short of junction discs (junction radius = trim)
// and cul-de-sac bulbs, leaving the disc to fill the gap.
export function sampleSplineRange(
  controls: Vec3[],
  samples: number,
  trimStart: number,
  trimEnd: number,
): SplineSample[] {
  const pts = controls.map(([x, , z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const total = curve.getLength();
  const safeStart = Math.max(0, trimStart);
  const safeEnd = Math.max(0, trimEnd);
  const span = Math.max(1, total - safeStart - safeEnd);
  const u0 = safeStart / total;
  const uSpan = span / total;
  const out: SplineSample[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = u0 + (uSpan * i) / samples;
    const p = curve.getPointAt(Math.min(1, Math.max(0, u)));
    const tg = curve.getTangentAt(Math.min(1, Math.max(0, u)));
    out.push({ pos: [p.x, 0, p.z], tangent: [tg.x, 0, tg.z] });
  }
  return out;
}

// Trim distance (in meters) for a spline endpoint based on what it attaches
// to. Grid handoffs contribute no trim. For junctions, trimming by the full
// disc radius leaves the ribbon's perpendicular *edges* sticking past the
// disc (the ribbon center sits ON the boundary, but its ±half-width corners
// sit at sqrt(r² + halfW²) > r). Trim instead by sqrt(r² - halfW²) so the
// outer corners land right at the disc edge and the ribbon visually dies
// into the disc rather than poking through it.
export function trimForAnchor(anchor: SplineAnchor, suburb: Suburb): number {
  if (anchor.kind === 'gridHandoff') return 0;
  const j = suburb.junctions.find((jj) => jj.id === anchor.id);
  if (!j) return 0;
  const halfW = ROAD_WIDTH / 2;
  const inner = j.radius * j.radius - halfW * halfW;
  return inner > 0 ? Math.sqrt(inner) : 0;
}

// The one hand-authored suburb (v1). Sits east of the city grid off the outer
// arterial at col=13, row=13 — an S-curved collector leads to a Y-junction
// with two branches ending in cul-de-sacs.
function buildEastSuburb(): Suburb {
  const [ax, , az] = cellCenter(14, 13);
  const { width: cellW } = cellSize(14, 13);
  // Anchor the entry at the east edge of the arterial's cell so the spline
  // continues directly from the grid asphalt. The first two controls are
  // collinear along +X so the spline's initial tangent matches the arterial's
  // direction — otherwise the ribbon enters at a diagonal and reads as a seam.
  const entryX = ax + cellW / 2;
  const entryZ = az;
  const runoutX = entryX + 10;

  const handoffs: GridHandoff[] = [{ id: 'east_entry', pos: [entryX, 0, entryZ] }];

  // Gentle S: both endpoints sit on the arterial centerline (z = entryZ) and
  // the curve only wiggles a few meters in between, so the collector reads as
  // a softly-bending continuation of the straight road rather than a sharp S.
  const yPos: Vec3 = [entryX + 120, 0, entryZ];
  const culN: Vec3 = [entryX + 160, 0, entryZ - 42];
  const culS: Vec3 = [entryX + 160, 0, entryZ + 42];

  const junctions: Junction[] = [
    { id: 'y_main', pos: yPos, kind: 'Y', radius: 7 },
    { id: 'cul_n', pos: culN, kind: 'culDeSac', radius: 10 },
    { id: 'cul_s', pos: culS, kind: 'culDeSac', radius: 10 },
  ];

  const splines: SplineRoad[] = [
    {
      id: 'collector',
      controls: [
        [entryX, 0, entryZ],
        [runoutX, 0, entryZ],
        [entryX + 45, 0, entryZ - 4],
        [entryX + 85, 0, entryZ + 4],
        yPos,
      ],
      width: ROAD_WIDTH,
      start: { kind: 'gridHandoff', id: 'east_entry' },
      end: { kind: 'junction', id: 'y_main' },
    },
    {
      id: 'branch_n',
      controls: [
        yPos,
        [entryX + 135, 0, entryZ - 12],
        [entryX + 152, 0, entryZ - 30],
        culN,
      ],
      width: ROAD_WIDTH,
      start: { kind: 'junction', id: 'y_main' },
      end: { kind: 'junction', id: 'cul_n' },
    },
    {
      id: 'branch_s',
      controls: [
        yPos,
        [entryX + 135, 0, entryZ + 12],
        [entryX + 152, 0, entryZ + 30],
        culS,
      ],
      width: ROAD_WIDTH,
      start: { kind: 'junction', id: 'y_main' },
      end: { kind: 'junction', id: 'cul_s' },
    },
  ];

  return { id: 'east_suburb', junctions, handoffs, splines };
}

export const SUBURBS: Suburb[] = [buildEastSuburb()];

// World-space bounding box spanning all suburb features. Used by the minimap
// to widen its viewport so suburbs don't fall outside the grid-only extent.
export function getSuburbBounds(): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const include = (x: number, z: number, pad: number) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  };
  for (const s of SUBURBS) {
    for (const j of s.junctions) include(j.pos[0], j.pos[2], j.radius);
    for (const sp of s.splines) {
      for (const c of sp.controls) include(c[0], c[2], sp.width / 2);
    }
  }
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return { minX, maxX, minZ, maxZ };
}
