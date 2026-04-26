import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  LANE_OFFSET,
  getIntersection,
  stopBackoff,
  yawForLaneDir,
  type LaneDir,
  type LaneWaypoint,
} from '@/game/world/cityLayout';
import { LANE_WAYPOINTS } from '@/game/world/worldWaypoints';
import { mustStopAtLight } from '@/game/world/trafficLightState';
import { isVehicleAhead } from './vehicleRegistry';
import { CAR_COLLIDER_HALF } from './drivingConstants';

// Kinematic path-follower AI. Each car becomes a `KinematicPositionBased`
// body, advances along a planned Bezier-curve segment between consecutive
// waypoints, and never calls setLinvel/setAngvel. No physics fights →
// predictable turns inside the destination lane, no overlap pile-ups, no
// in-place spinning. Ambient traffic, train-on-rails feel.
//
// AI cars don't get pushed by collisions (Kinematic) and don't push each
// other (Kinematic-Kinematic doesn't collide-resolve). Inter-car spacing
// is enforced via the existing `isVehicleAhead` forward-cone check.

const BODY_KINEMATIC_POSITION = 2;

// The Y at which a car's body center sits when its collider bottom is flush
// with the y=0 island ground. Hardcoded instead of read from r.translation()
// at AI takeover: the car spawns Dynamic at CAR_SPAWN_Y and the AI hook
// captures whatever Y gravity has reached on the first useFrame, which is
// race-dependent across refreshes — that's the "different heights every
// reload, sometimes only roofs / sometimes wheels clipping" symptom.
const CAR_GROUND_Y = CAR_COLLIDER_HALF[1];

// ~1.5 car lengths ahead.
const FOLLOW_DIST = 6;
// ~26° half-cone — narrow enough to ignore parallel-lane traffic.
const FOLLOW_HALF_ANGLE_COS = Math.cos(0.45);

// Approximate arc length factor for the turn relative to its chord. Good
// enough that constant t-step ≈ constant speed for our turns.
const CURVE_LENGTH_FACTOR = 1.15;

export type AiFrameConfig = {
  speed: number;
  pickNext: (currentId: string, prevId: string | null) => LaneWaypoint;
  obeyLights: boolean;
};

type Options = {
  // Vehicle id, matched against vehicleRegistry to skip self in cone check.
  id: string;
  rigidRef: MutableRefObject<RapierRigidBody | null>;
  startId: string;
  // Suspended while the player is driving or the car has been "claimed".
  // While disabled the hook is a no-op — body type is left for whoever
  // takes over (typically `useCarDriver`).
  disabled: boolean;
  // Called each frame; returning 'hold' freezes the car in place.
  getConfig: (ctx: { pos: { x: number; z: number } }) => AiFrameConfig | 'hold';
  // When true, log each segment switch and any "stuck" condition (no
  // progress in 5+ s) to the browser console. Used by DebugTraffic.
  debug?: boolean;
};

export function pickRandomNeighbor(
  currentId: string,
  prevId: string | null,
): LaneWaypoint {
  const cur = LANE_WAYPOINTS[currentId];
  const choices = cur.neighbors.filter((n) => n !== prevId);
  const list = choices.length ? choices : cur.neighbors;
  if (list.length === 0) return cur;
  return LANE_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
}

// --- Path geometry ---

type Vec3 = readonly [number, number, number];

type StraightSegment = {
  kind: 'straight';
  p0: Vec3;
  p3: Vec3;
  length: number;
  yaw: number;
};

type CurveSegment = {
  kind: 'curve';
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;
  p3: Vec3;
  length: number;
};

type Segment = StraightSegment | CurveSegment;

function dirVec(dir: LaneDir): [number, number] {
  switch (dir) {
    case 'N':
      return [0, -1];
    case 'S':
      return [0, 1];
    case 'E':
      return [1, 0];
    case 'W':
      return [-1, 0];
  }
}

function chord(p0: Vec3, p3: Vec3): number {
  const dx = p3[0] - p0[0];
  const dz = p3[2] - p0[2];
  return Math.hypot(dx, dz);
}

function buildSegment(from: LaneWaypoint, to: LaneWaypoint): Segment {
  const p0: Vec3 = [from.pos[0], 0, from.pos[2]];
  const p3: Vec3 = [to.pos[0], 0, to.pos[2]];
  if (from.dir === to.dir) {
    return {
      kind: 'straight',
      p0,
      p3,
      length: Math.max(chord(p0, p3), 0.01),
      yaw: yawForLaneDir(from.dir),
    };
  }
  const c = chord(p0, p3);
  const fv = dirVec(from.dir);
  const tv = dirVec(to.dir);
  const dx = p3[0] - p0[0];
  const dz = p3[2] - p0[2];
  // The entry waypoint sits LANE_OFFSET past the lane-meet corner in the
  // entry direction (lane waypoints are at intersection-cell *centers*,
  // offset to the right lane). A chord-proportional tangent overshoots
  // and swings the curve into the opposing lane before turning. Anchor
  // the entry tangent at LANE_OFFSET so the curve tucks into the
  // destination lane; give the exit tangent the rest of the chord so the
  // curve hugs that lane on the way out.
  const projExit = Math.abs(dx * tv[0] + dz * tv[1]);
  const t1 = LANE_OFFSET;
  const t2 = Math.max(LANE_OFFSET, projExit - LANE_OFFSET);
  const p1: Vec3 = [p0[0] + fv[0] * t1, 0, p0[2] + fv[1] * t1];
  const p2: Vec3 = [p3[0] - tv[0] * t2, 0, p3[2] - tv[1] * t2];
  return {
    kind: 'curve',
    p0,
    p1,
    p2,
    p3,
    length: Math.max(c * CURVE_LENGTH_FACTOR, 0.01),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type SamplePos = { x: number; z: number; yaw: number };

function sampleSegment(seg: Segment, t: number, out: SamplePos): SamplePos {
  if (seg.kind === 'straight') {
    out.x = lerp(seg.p0[0], seg.p3[0], t);
    out.z = lerp(seg.p0[2], seg.p3[2], t);
    out.yaw = seg.yaw;
    return out;
  }
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    u3 * seg.p0[0] +
    3 * u2 * t * seg.p1[0] +
    3 * u * t2 * seg.p2[0] +
    t3 * seg.p3[0];
  out.z =
    u3 * seg.p0[2] +
    3 * u2 * t * seg.p1[2] +
    3 * u * t2 * seg.p2[2] +
    t3 * seg.p3[2];
  // Yaw from the curve's tangent — a constant-rate lerp between
  // entry/exit headings diverges from the bezier path mid-turn and the
  // car visibly slides into the destination lane.
  const dx =
    3 * u2 * (seg.p1[0] - seg.p0[0]) +
    6 * u * t * (seg.p2[0] - seg.p1[0]) +
    3 * t2 * (seg.p3[0] - seg.p2[0]);
  const dz =
    3 * u2 * (seg.p1[2] - seg.p0[2]) +
    6 * u * t * (seg.p2[2] - seg.p1[2]) +
    3 * t2 * (seg.p3[2] - seg.p2[2]);
  out.yaw = Math.atan2(dx, dz);
  return out;
}

// Convert "stop a bit before the intersection" into "clamp progress at
// segment.length − backoff". Reuses the existing stopBackoff geometry.
function stopLineProgressFor(
  seg: Segment,
  toWp: LaneWaypoint,
  intersection: ReturnType<typeof getIntersection>,
): number {
  const back = intersection ? stopBackoff(intersection, toWp.dir) : 0;
  return Math.max(0, seg.length - back);
}

const _Y_AXIS = new THREE.Vector3(0, 1, 0);

export function useAiWaypointDriver({
  id,
  rigidRef,
  startId,
  disabled,
  getConfig,
  debug = false,
}: Options) {
  const stateRef = useRef<{
    initialized: boolean;
    prevWpId: string | null;
    fromWpId: string;
    toWpId: string;
    segment: Segment;
    progress: number;
    groundY: number;
  }>({
    initialized: false,
    prevWpId: null,
    fromWpId: startId,
    toWpId: startId,
    segment: {
      kind: 'straight',
      p0: [0, 0, 0],
      p3: [0, 0, 0],
      length: 1,
      yaw: 0,
    },
    progress: 0,
    groundY: 0.6,
  });
  const ctxRef = useRef({ pos: { x: 0, z: 0 } });
  const sampleRef = useRef<SamplePos>({ x: 0, z: 0, yaw: 0 });
  const tmpQuat = useRef(new THREE.Quaternion());
  const debugRef = useRef({
    stuckTimer: 0,
    lastFromTo: '',
    lastStuckLogAt: 0,
  });

  useFrame((_, dt) => {
    if (disabled) return;
    const r = rigidRef.current;
    if (!r) return;
    const s = stateRef.current;

    // First active frame: take ownership of the body.
    if (!s.initialized) {
      const startWp = LANE_WAYPOINTS[startId];
      if (!startWp) return;
      r.setBodyType(BODY_KINEMATIC_POSITION, true);
      // Pick the first onward waypoint to build segment 0.
      const cfg0 = getConfig({
        pos: { x: startWp.pos[0], z: startWp.pos[2] },
      });
      const next =
        cfg0 === 'hold'
          ? pickRandomNeighbor(startId, null)
          : cfg0.pickNext(startId, null);
      s.fromWpId = startId;
      s.toWpId = next.id;
      s.segment = buildSegment(startWp, next);
      s.progress = 0;
      s.groundY = CAR_GROUND_Y;
      s.initialized = true;
      const sp = sampleSegment(s.segment, 0, sampleRef.current);
      r.setNextKinematicTranslation({ x: sp.x, y: s.groundY, z: sp.z });
      tmpQuat.current.setFromAxisAngle(_Y_AXIS, sp.yaw);
      r.setNextKinematicRotation(tmpQuat.current);
      return;
    }

    const t0 = r.translation();
    ctxRef.current.pos.x = t0.x;
    ctxRef.current.pos.z = t0.z;
    const cfg = getConfig(ctxRef.current);

    if (cfg === 'hold') {
      // Freeze in place — re-emit the current sample so the body stays put.
      const sp = sampleSegment(
        s.segment,
        s.progress / s.segment.length,
        sampleRef.current,
      );
      r.setNextKinematicTranslation({ x: sp.x, y: s.groundY, z: sp.z });
      tmpQuat.current.setFromAxisAngle(_Y_AXIS, sp.yaw);
      r.setNextKinematicRotation(tmpQuat.current);
      return;
    }

    let speed = cfg.speed;

    // Red light: clamp progress at the stop line for the upcoming
    // intersection waypoint.
    const toWp = LANE_WAYPOINTS[s.toWpId];
    if (cfg.obeyLights && toWp && toWp.isIntersection) {
      const it = getIntersection(toWp.col, toWp.row);
      if (it && mustStopAtLight(toWp.dir, it.phaseOffset)) {
        const stopProg = stopLineProgressFor(s.segment, toWp, it);
        if (s.progress >= stopProg) {
          s.progress = stopProg;
          speed = 0;
        }
      }
    }

    // Sample current pose so we can do the forward-cone check with the
    // right yaw (matters mid-curve where the heading is rotating).
    const probe = sampleSegment(
      s.segment,
      s.progress / s.segment.length,
      sampleRef.current,
    );

    if (
      speed > 0 &&
      isVehicleAhead(
        id,
        ctxRef.current.pos,
        probe.yaw,
        FOLLOW_DIST,
        FOLLOW_HALF_ANGLE_COS,
      )
    ) {
      speed = 0;
    }

    s.progress += speed * dt;

    // Advance segments if we crossed one or more boundaries this frame.
    let switched = false;
    let safety = 0;
    while (s.progress >= s.segment.length && safety++ < 4) {
      const remainder = s.progress - s.segment.length;
      const next = cfg.pickNext(s.toWpId, s.fromWpId);
      const oldTo = s.toWpId;
      const oldDir = LANE_WAYPOINTS[oldTo]?.dir;
      s.prevWpId = s.fromWpId;
      s.fromWpId = oldTo;
      s.toWpId = next.id;
      s.segment = buildSegment(
        LANE_WAYPOINTS[s.fromWpId],
        LANE_WAYPOINTS[s.toWpId],
      );
      s.progress = remainder;
      switched = true;
      if (debug) {
        const newDir = next.dir;
        const turn = oldDir === newDir ? 'straight' : `turn ${oldDir}→${newDir}`;
        // eslint-disable-next-line no-console
        console.log(
          `[ai:${id}] reached ${oldTo} (${oldDir}) → ${next.id} (${newDir}) [${turn}]`,
        );
      }
    }

    if (debug) {
      const dbg = debugRef.current;
      const key = `${s.fromWpId}→${s.toWpId}`;
      if (switched || dbg.lastFromTo !== key) {
        dbg.lastFromTo = key;
        dbg.stuckTimer = 0;
        dbg.lastStuckLogAt = 0;
      } else if (speed === 0) {
        dbg.stuckTimer += dt;
        if (
          dbg.stuckTimer > 5 &&
          dbg.stuckTimer - dbg.lastStuckLogAt > 2
        ) {
          dbg.lastStuckLogAt = dbg.stuckTimer;
          // eslint-disable-next-line no-console
          console.warn(
            `[ai:${id}] STUCK ${dbg.stuckTimer.toFixed(1)}s on ${key}, progress=${s.progress.toFixed(2)}/${s.segment.length.toFixed(2)}m`,
          );
        }
      } else {
        dbg.stuckTimer = 0;
      }
    }

    const sp = sampleSegment(
      s.segment,
      s.progress / s.segment.length,
      sampleRef.current,
    );
    r.setNextKinematicTranslation({ x: sp.x, y: s.groundY, z: sp.z });
    tmpQuat.current.setFromAxisAngle(_Y_AXIS, sp.yaw);
    r.setNextKinematicRotation(tmpQuat.current);
  });
}
