// Drivable bridge connecting the main island's east arterial (cell [24, 9])
// to island 3's west arterial (cell [1, 5]). Pure data — Bridge.tsx renders
// the deck/colliders/railings; worldWaypoints.ts wires the lane graph through
// `wireBridgeLanes`.
//
// Geometry: a straight ribbon between the two anchor points. Most of the gap
// is east-west; the small Z mismatch between main row 9 and island 3 row 5
// is absorbed by orienting the deck along the connecting line (so the bridge
// reads as a slight diagonal rather than a kinked road).

import {
  LANE_OFFSET,
  type LaneWaypoint,
  type Vec3,
} from './cityLayout';
import {
  ISLAND3_CITY,
  ISLAND3_BRIDGE_ENTRY_COL,
  ISLAND3_BRIDGE_ENTRY_ROW,
  MAIN_BRIDGE_ENTRY_ROW,
} from './island3';
import { APPROACH_END_X, APPROACH_END_Z } from './bridgeApproachData';

// World-space anchor on the main island side: end of the bridge-approach
// road, which sits near the row-9 shoreline. Anchoring the bridge here
// instead of at the grid's east edge keeps the deck spanning water (with the
// approach road carrying traffic across the coastal grass).
export const BRIDGE_MAIN_X = APPROACH_END_X;
export const BRIDGE_MAIN_Z = APPROACH_END_Z;

// World-space anchor on island 3 side: west edge of [1, 5].
const I3_BOUNDS = ISLAND3_CITY.cellBounds(ISLAND3_BRIDGE_ENTRY_COL, ISLAND3_BRIDGE_ENTRY_ROW);
const I3_CENTER = ISLAND3_CITY.cellCenter(ISLAND3_BRIDGE_ENTRY_COL, ISLAND3_BRIDGE_ENTRY_ROW);
export const BRIDGE_I3_X = I3_BOUNDS.minX;
export const BRIDGE_I3_Z = I3_CENTER[2];

const dx = BRIDGE_I3_X - BRIDGE_MAIN_X;
const dz = BRIDGE_I3_Z - BRIDGE_MAIN_Z;
export const BRIDGE_LENGTH = Math.hypot(dx, dz);
// Three.js Y-rotation by θ maps local (+X, 0, 0) to world (cos θ, 0, -sin θ).
// We want local +X to point from MAIN toward I3 — i.e., (cos θ, -sin θ) =
// (dx/L, dz/L) — so θ = atan2(-dz, dx). With the previous `atan2(dz, dx)` the
// deck rotated the wrong way and its main-side end landed ~|dz| meters off
// the approach road.
export const BRIDGE_YAW = Math.atan2(-dz, dx);
export const BRIDGE_MID_X = (BRIDGE_MAIN_X + BRIDGE_I3_X) / 2;
export const BRIDGE_MID_Z = (BRIDGE_MAIN_Z + BRIDGE_I3_Z) / 2;
export const BRIDGE_DECK_WIDTH = 14; // 8m road + 3m sidewalk each side
export const BRIDGE_RAILING_HEIGHT = 1.0;
export const BRIDGE_DECK_THICKNESS = 0.4;
// Y of the deck top surface at the *ends* of the bridge (where it meets the
// approach road). The deck arcs up between the towers — see deckYAt.
export const BRIDGE_DECK_Y = 0.05;

// --- Suspension-bridge geometry ---
//
// Deck arcs along a parabola that's flat at the ends (so the road meets the
// approach grade smoothly) and peaks between the two towers. PEAK_Y is tuned
// so the steepest grade (at the very ends, before flattening) is roughly
// 4*PEAK / LENGTH ≈ 9° on the current span — drivable, visible from a
// distance, not flying-saucer steep.
export const BRIDGE_PEAK_Y = 18;

// Towers sit at 20% and 80% along the bridge length — symmetric, gives the
// classic Golden-Gate three-section silhouette (short back-stay, long main
// span, short back-stay).
export const TOWER_T: ReadonlyArray<number> = [0.2, 0.8];
export const TOWER_HEIGHT = 60;       // height of tower top above grade
export const TOWER_LEG_W = 3;         // each leg's footprint along bridge
export const TOWER_LEG_D = 4;         // each leg's footprint across bridge
export const TOWER_GAP = 6;           // clear gap between leg pair (deck passes through)

// Number of deck collider/visual segments. With 16 segments on a 450m bridge
// each chunk is ~28m, well below the parabola's curvature scale; cars feel a
// barely-perceptible flat-spot rather than a kink.
export const BRIDGE_DECK_SEGMENTS = 16;

// Returns deck top-surface Y at parameter t in [0, 1] along the bridge.
// Parabola: y = PEAK_Y * (1 - (2t - 1)^2). Endpoints sit at BRIDGE_DECK_Y so
// the deck meets the approach asphalt at grade level.
export function deckYAt(t: number): number {
  const u = 2 * t - 1;
  return BRIDGE_PEAK_Y * (1 - u * u) + BRIDGE_DECK_Y;
}

// --- Lane waypoint chain ---

// Number of lane waypoints sampled along the bridge per direction. Roughly
// every 12m so AI cars get smooth steering targets without being expensive.
const SAMPLES = Math.max(2, Math.round(BRIDGE_LENGTH / 12));

type DirAxis = 'E' | 'W';

// Right-hand-drive lane offset, perpendicular to the bridge axis. We derive
// forward/right directly from (dx, dz) rather than going through yaw — keeps
// the math independent of the rotation convention.
//   forward = (dx, dz)/L
//   right-of-forward (clockwise from above, +Y axis) = (-dz, dx)/L
// For yaw=0 (purely east) this gives right = (0, +1) = south, matching the
// city grid's right-hand-drive convention for E-bound lanes.
const FX = dx / BRIDGE_LENGTH;
const FZ = dz / BRIDGE_LENGTH;
const RX = -FZ;
const RZ = FX;

function laneSamples(dir: DirAxis): Vec3[] {
  const out: Vec3[] = [];
  // East-bound traveler walks MAIN → I3 with right = (RX, RZ); west-bound
  // walks I3 → MAIN, and the right side flips (sign = -1).
  const sign = dir === 'E' ? 1 : -1;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    // For W direction, t still parameterizes 0→1 from the W start (I3 end)
    // to the W end (MAIN end); the deck height curve is symmetric so we can
    // reuse deckYAt either way by recomputing the world-space t along the
    // bridge axis.
    const tBridge = dir === 'E' ? t : 1 - t;
    const baseX = dir === 'E'
      ? BRIDGE_MAIN_X + dx * t
      : BRIDGE_I3_X - dx * t;
    const baseZ = dir === 'E'
      ? BRIDGE_MAIN_Z + dz * t
      : BRIDGE_I3_Z - dz * t;
    const y = deckYAt(tBridge);
    out.push([baseX + RX * LANE_OFFSET * sign, y, baseZ + RZ * LANE_OFFSET * sign]);
  }
  return out;
}

const E_PATH = laneSamples('E');
const W_PATH = laneSamples('W');

const eId = (i: number) => `bridge_l_E_${i}`;
const wId = (i: number) => `bridge_l_W_${i}`;

// Bridge lane waypoints. Each entry chains forward to the next sample; the
// graph wiring at the islands is added in `wireBridgeLanes` once the merged
// lane map is available.
export const BRIDGE_LANE_WAYPOINTS: Record<string, LaneWaypoint> = {};

for (let i = 0; i < E_PATH.length; i++) {
  const id = eId(i);
  BRIDGE_LANE_WAYPOINTS[id] = {
    id,
    pos: E_PATH[i],
    dir: 'E',
    col: -1,
    row: -1,
    isIntersection: false,
    neighbors: i + 1 < E_PATH.length ? [eId(i + 1)] : [],
  };
}
for (let i = 0; i < W_PATH.length; i++) {
  const id = wId(i);
  BRIDGE_LANE_WAYPOINTS[id] = {
    id,
    pos: W_PATH[i],
    dir: 'W',
    col: -1,
    row: -1,
    isIntersection: false,
    neighbors: i + 1 < W_PATH.length ? [wId(i + 1)] : [],
  };
}

// Wire the bridge into a merged lane graph. We can't anchor at the grid-edge
// cells [24, 9] (main) or [0, 5] (island 3) because those lane nodes get
// pruned by the dead-end sweep in buildCityGrid (no straight neighbor exists
// past the grid border). Instead, anchor at the inward intersection cells —
// main's [23, 9] and island 3's [1, 5] — which always survive pruning thanks
// to their right-turn neighbors.
//
// Caller must pass the merged map (containing both grids' lane waypoints +
// these bridge waypoints) so we can mutate the neighbor lists in place.
export function wireBridgeLanes(merged: Record<string, LaneWaypoint>): void {
  const link = (from: LaneWaypoint | undefined, toId: string) => {
    if (!from) return;
    if (!merged[toId]) return;
    if (!from.neighbors.includes(toId)) from.neighbors.push(toId);
  };
  const lastE = E_PATH.length - 1;
  const lastW = W_PATH.length - 1;

  // East-bound: main intersection at [23, 9] → first bridge sample → island 3
  // intersection at [1, 5].
  link(merged[`main_l_23_${MAIN_BRIDGE_ENTRY_ROW}_E`], eId(0));
  link(
    merged[eId(lastE)],
    `island3_l_${ISLAND3_BRIDGE_ENTRY_COL}_${ISLAND3_BRIDGE_ENTRY_ROW}_E`,
  );

  // West-bound: island 3 intersection at [1, 5] → first bridge sample → main
  // intersection at [23, 9].
  link(
    merged[`island3_l_${ISLAND3_BRIDGE_ENTRY_COL}_${ISLAND3_BRIDGE_ENTRY_ROW}_W`],
    wId(0),
  );
  link(merged[wId(lastW)], `main_l_23_${MAIN_BRIDGE_ENTRY_ROW}_W`);
}
