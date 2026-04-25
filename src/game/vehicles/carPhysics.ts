import {
  ACCEL,
  BRAKE,
  COAST_DRAG,
  MAX_SPEED,
  MAX_YAW_RATE,
  REVERSE_SPEED,
} from './drivingConstants';
import type { RapierRigidBody } from '@react-three/rapier';

// Steering steers more crisply once the car is past ~4 m/s; below that it
// coasts without instantly spinning in place.
const STEER_SPEED_SCALE = 4;

export type CarControls = { throttle: number; steer: number; brake: number };
export type CarKinState = { yaw: number; speed: number };

// Throttle/brake/coast → speed; steer (speed-scaled) → yaw delta. Same model
// the player uses; AI calls this with throttle=1 + steer derived from
// heading error so visuals stay consistent across all cars.
export function advanceCarState(
  prev: CarKinState,
  controls: CarControls,
  dt: number,
  destroyed: boolean,
  maxSpeed: number = MAX_SPEED,
): CarKinState {
  if (destroyed) return { yaw: prev.yaw, speed: 0 };

  let sp = prev.speed;
  if (controls.throttle > 0) {
    sp += ACCEL * dt;
  } else if (controls.brake > 0) {
    if (sp > 0) sp -= BRAKE * dt;
    else sp -= ACCEL * 0.6 * dt;
  } else {
    if (sp > 0) sp = Math.max(0, sp - COAST_DRAG * dt);
    else if (sp < 0) sp = Math.min(0, sp + COAST_DRAG * dt);
  }
  sp = Math.max(-REVERSE_SPEED, Math.min(maxSpeed, sp));

  const speedFactor = Math.min(1, Math.abs(sp) / STEER_SPEED_SCALE);
  const yaw =
    prev.yaw +
    -controls.steer * MAX_YAW_RATE * speedFactor * Math.sign(sp || 1) * dt;

  return { yaw, speed: sp };
}

// Smallest signed delta from `from` to `to` in (-π, π].
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Read yaw (rotation about Y) from a Rapier rotation quaternion.
// Equivalent to extracting the Y component of the YXZ Euler decomposition,
// but allocation-free.
export function quatToYaw(q: { x: number; y: number; z: number; w: number }): number {
  const siny_cosp = 2 * (q.w * q.y + q.x * q.z);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.x * q.x);
  return Math.atan2(siny_cosp, cosy_cosp);
}

// Project the body's linear velocity onto its current forward axis.
// Forward is +Z in the model frame, so worldForward = (sin yaw, 0, cos yaw).
export function currentForwardSpeed(r: RapierRigidBody, yaw: number): number {
  const v = r.linvel();
  return v.x * Math.sin(yaw) + v.z * Math.cos(yaw);
}
