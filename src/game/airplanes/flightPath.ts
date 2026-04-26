import { GROUND_Y } from './airplaneConstants';

// Scheduled airliner flight: a parametric path through phases (takeoff roll,
// climb, cruise loop, return, descent, landing roll). Pure module — no React,
// no audio, no rendering. The component layer ticks an elapsed time forward
// and asks `computeFlightPose(elapsed)` for a pose, which it then applies to
// a Three.js group.
//
// Time units throughout this module are *sim-seconds* — the same clock that
// gameStore.time.seconds runs on. That clock ticks 30× wall time and freezes
// during pause, so the flight pauses with the game for free.

export type FlightPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;   // around world Y; 0 = +Z forward
  pitch: number; // positive = nose up
  roll: number;  // positive = right wing down
  phase: FlightPhase;
};

export type FlightPhase =
  | 'takeoffRoll'
  | 'climb'
  | 'cruiseOut'
  | 'cruiseFar'
  | 'cityOverflight'
  | 'finalApproach'
  | 'descent'
  | 'landingRoll';

// Each waypoint is a key pose at a particular sim-second offset from the
// flight's start. The pose between two adjacent waypoints is produced by
// smooth-stepped interpolation, so the trajectory eases into and out of each
// segment instead of cornering linearly.
type Waypoint = {
  t: number;            // sim-seconds since flight start
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  roll: number;
  phase: FlightPhase;
};

// Runway centerline is x = -1080, z extends roughly -300..+300. Takeoff goes
// south-to-north (yaw 0). The plane climbs out east, loops far off-map, and
// returns from the southeast — descending across the city diagonally for
// ambience before turning south for a north-to-south landing on the runway.
//
// Yaw convention: 0 → +Z (north), π/2 → +X (east), π → -Z (south),
// 3π/2 → -X (west). Yaw values are written as a continuous monotonic
// sequence so naive lerping between waypoints picks the visually-correct
// short-arc turn (a 270° right loop, then a brief left turn for landing).
//
// Total flight time is 1740 sim-seconds (58 wall-clock seconds) — fits
// inside the 1800 sim-second / 60 wall-clock-second half-hour cadence. Time
// budget is biased toward the *visible* phases (overflight, approach,
// descent, landing roll); the off-screen cruise loop is compressed because
// nobody watches it.
const RWY_X = -1080;
const RWY_SOUTH_Z = -280;
const RWY_NORTH_Z = +280;
const CRUISE_ALT = 130;
const OVERFLIGHT_ALT = 95;       // altitude over the city — clears all rooftops
const ROTATE_ALT = GROUND_Y + 4; // a few meters off the deck at lift-off

const WAYPOINTS: Waypoint[] = [
  // Takeoff roll — accelerating down the runway, wings level.
  { t: 0,    pos: [RWY_X, GROUND_Y, RWY_SOUTH_Z], yaw: 0, pitch: 0,    roll: 0, phase: 'takeoffRoll' },
  { t: 150,  pos: [RWY_X, GROUND_Y, +180],         yaw: 0, pitch: 0.05, roll: 0, phase: 'takeoffRoll' },
  // Rotate + climb-out, nose up, gaining altitude.
  { t: 240,  pos: [RWY_X, ROTATE_ALT, RWY_NORTH_Z + 80], yaw: 0,        pitch: 0.18, roll: 0, phase: 'climb' },
  { t: 320,  pos: [RWY_X + 60, 90, +900],   yaw: 0.15, pitch: 0.12, roll: 0.1, phase: 'climb' },
  // Cruise out — banking right, leaving the visible map area. Compressed
  // because the plane is well past the visibility radius for these segments.
  { t: 380,  pos: [-200, CRUISE_ALT, +1500], yaw: 0.6,           pitch: 0, roll: 0.25, phase: 'cruiseOut' },
  { t: 430,  pos: [+1100, CRUISE_ALT, +1500], yaw: Math.PI * 0.5, pitch: 0, roll: 0.2,  phase: 'cruiseOut' },
  // Far cruise — well off-map, continuing the right-hand loop. Yaw climbs
  // monotonically through π and past, so the plane keeps turning right.
  { t: 480,  pos: [+1700, CRUISE_ALT, 0],     yaw: Math.PI,         pitch: 0, roll: 0.2,  phase: 'cruiseFar' },
  { t: 520,  pos: [+1300, CRUISE_ALT, -700],  yaw: Math.PI * 1.25,  pitch: 0, roll: 0.2,  phase: 'cruiseFar' },
  // City overflight — descending diagonally across the city heading west.
  // Enters from the southeast, crosses near the city centre, and exits to
  // the northwest. ~95 m altitude clears every rooftop with margin. Each
  // overflight segment runs ~180 sim-sec (6 wall-sec) so a typical 600 m
  // hop reads as ~100 m/s ≈ 360 km/h instead of the 700 km/h streak the
  // shorter old timing produced.
  { t: 560,  pos: [+600, 115, -300],           yaw: Math.PI * 1.5,   pitch: -0.02, roll: 0.1,  phase: 'cityOverflight' },
  { t: 740,  pos: [+50, OVERFLIGHT_ALT, -40],  yaw: Math.PI * 1.5,   pitch: -0.03, roll: 0,    phase: 'cityOverflight' },
  { t: 920,  pos: [-450, OVERFLIGHT_ALT, +120], yaw: Math.PI * 1.5,  pitch: -0.03, roll: 0,    phase: 'cityOverflight' },
  // Left turn from west heading to south, lining up north of the runway.
  // Yaw decreases from 3π/2 to π (a 90° left turn through southwest).
  { t: 1100, pos: [-900, 100, +500],           yaw: Math.PI * 1.25,  pitch: -0.02, roll: -0.12, phase: 'finalApproach' },
  { t: 1250, pos: [RWY_X, 110, +800],          yaw: Math.PI,         pitch: 0,    roll: 0,    phase: 'finalApproach' },
  // Descent + final approach — sinking toward the runway threshold.
  { t: 1400, pos: [RWY_X, 40, RWY_NORTH_Z + 200], yaw: Math.PI, pitch: -0.06, roll: 0, phase: 'descent' },
  // Threshold — flare imminent.
  { t: 1490, pos: [RWY_X, ROTATE_ALT, RWY_NORTH_Z], yaw: Math.PI, pitch: -0.02, roll: 0, phase: 'descent' },
  // Touchdown + decelerating rollout to runway south end. Stretched so the
  // landing roll reads as a plane braking, not a hovercraft skating.
  { t: 1580, pos: [RWY_X, GROUND_Y, +150], yaw: Math.PI, pitch: 0, roll: 0, phase: 'landingRoll' },
  { t: 1740, pos: [RWY_X, GROUND_Y, RWY_SOUTH_Z], yaw: Math.PI, pitch: 0, roll: 0, phase: 'landingRoll' },
];

export const FLIGHT_DURATION_SIM_SEC = WAYPOINTS[WAYPOINTS.length - 1].t;

// Catmull-Rom across 4 control points. The previous implementation used
// per-segment smoothstep+lerp, which gave each segment ease-in/ease-out — but
// that means the velocity drops to zero at every waypoint, producing a
// visible pulse on a long path. Catmull-Rom passes through each waypoint
// with C¹-continuous tangents derived from the neighbours, so headings and
// positions roll into and out of waypoints smoothly without stalling.
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// Returns the current pose along the flight at the given sim-second offset.
// `null` once the flight has ended (so the caller can recycle / despawn).
export function computeFlightPose(elapsedSimSec: number): FlightPose | null {
  if (elapsedSimSec < 0) return null;
  if (elapsedSimSec >= FLIGHT_DURATION_SIM_SEC) return null;

  // Find the segment that brackets `elapsed`. Linear scan — only ~17 waypoints,
  // and this runs once per frame for one plane. Not worth a binary search.
  let i = 0;
  while (i < WAYPOINTS.length - 1 && WAYPOINTS[i + 1].t <= elapsedSimSec) i++;
  const a = WAYPOINTS[i];
  const b = WAYPOINTS[i + 1];

  const span = b.t - a.t;
  const t = span > 0 ? (elapsedSimSec - a.t) / span : 0;

  // Clamp the surrounding two waypoints to the path ends so the curve enters
  // takeoff and exits landing without phantom outside-the-path tangents that
  // would make the plane drift sideways at t≈0 or t≈end.
  const wm1 = WAYPOINTS[Math.max(0, i - 1)];
  const wp1 = WAYPOINTS[Math.min(WAYPOINTS.length - 1, i + 2)];

  return {
    x: catmullRom(wm1.pos[0], a.pos[0], b.pos[0], wp1.pos[0], t),
    y: catmullRom(wm1.pos[1], a.pos[1], b.pos[1], wp1.pos[1], t),
    z: catmullRom(wm1.pos[2], a.pos[2], b.pos[2], wp1.pos[2], t),
    yaw: catmullRom(wm1.yaw, a.yaw, b.yaw, wp1.yaw, t),
    pitch: catmullRom(wm1.pitch, a.pitch, b.pitch, wp1.pitch, t),
    roll: catmullRom(wm1.roll, a.roll, b.roll, wp1.roll, t),
    // Phase comes from the *starting* waypoint of the segment so a phase like
    // "takeoffRoll" stays current until the next waypoint flips it.
    phase: a.phase,
  };
}

// Half-hour cadence: 30 sim-minutes = 1800 sim-seconds. Returns the sim-time
// at which the next flight should start, given a current sim-time. We pick
// the *next* half-hour boundary (i.e., never schedules a flight in the past).
export const FLIGHT_INTERVAL_SIM_SEC = 30 * 60;

export function nextScheduledStart(currentSimSec: number): number {
  const next = Math.ceil(currentSimSec / FLIGHT_INTERVAL_SIM_SEC) * FLIGHT_INTERVAL_SIM_SEC;
  // If we're exactly on a boundary, push to the *following* slot so the
  // callsite doesn't immediately re-trigger after a flight just finished
  // landing on the boundary itself.
  return next === currentSimSec ? next + FLIGHT_INTERVAL_SIM_SEC : next;
}
