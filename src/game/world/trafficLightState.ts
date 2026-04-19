import type { LaneDir } from './cityLayout';

export type Light = 'red' | 'yellow' | 'green';

const GREEN_S = 6;
const YELLOW_S = 1.5;
export const CYCLE_S = (GREEN_S + YELLOW_S) * 2; // NS green, NS yellow, EW green, EW yellow

// Single global clock — all lights read the same time and apply their own
// phase offset. Advanced by a useFrame hook from <TrafficLights/>.
const clock = { t: 0 };

export function tickTrafficClock(dt: number) {
  clock.t = (clock.t + dt) % CYCLE_S;
}

export function getTrafficClock() {
  return clock.t;
}

export function lightFor(dir: LaneDir, phaseOffset: number): Light {
  const local = (clock.t + phaseOffset) % CYCLE_S;
  const isNS = dir === 'N' || dir === 'S';
  if (local < GREEN_S) return isNS ? 'green' : 'red';
  if (local < GREEN_S + YELLOW_S) return isNS ? 'yellow' : 'red';
  if (local < GREEN_S * 2 + YELLOW_S) return isNS ? 'red' : 'green';
  return isNS ? 'red' : 'yellow';
}

// Returns true if a car with this direction must stop at the intersection
// (red or yellow). Green only.
export function mustStopAtLight(dir: LaneDir, phaseOffset: number): boolean {
  return lightFor(dir, phaseOffset) !== 'green';
}
