import {
  GROUND_MAX_SPEED,
  GROUND_Y,
  MAX_SPEED,
  PITCH_LIMIT,
  PITCH_RATE,
  PITCH_RECOVER,
  ROLL_LIMIT,
  ROLL_RATE,
  ROLL_RECOVER,
  SPEED_LERP_PER_SEC,
  TAKEOFF_SPEED,
  THROTTLE_DOWN_PER_SEC,
  THROTTLE_UP_PER_SEC,
  YAW_FROM_ROLL,
  YAW_RATE,
} from './airplaneConstants';

export type PlaneControls = {
  throttleUp: number; // 0..1
  throttleDown: number;
  pitchUp: number; // nose up (climb)
  pitchDown: number; // nose down (dive)
  rollLeft: number;
  rollRight: number;
  yawLeft: number;
  yawRight: number;
  brake: number; // ground only
};

export type PlaneState = {
  x: number;
  y: number;
  z: number;
  yaw: number; // around world Y
  pitch: number; // around body X (positive = nose up)
  roll: number; // around body Z (positive = right wing down)
  throttle: number; // 0..1
  speed: number; // forward magnitude (m/s)
  airborne: boolean;
};

export function makeInitialPlaneState(x: number, y: number, z: number, yaw: number): PlaneState {
  return {
    x,
    y,
    z: z,
    yaw,
    pitch: 0,
    roll: 0,
    throttle: 0,
    speed: 0,
    airborne: false,
  };
}

// Returns the unit forward vector for a plane with the given Euler triplet.
// Uses YXZ order: yaw around world Y, then pitch around body X, then roll
// around body Z. Roll has no effect on the forward axis (it spins the body
// around forward), so we ignore it here.
function bodyForward(yaw: number, pitch: number): { fx: number; fy: number; fz: number } {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // World forward when yaw=0, pitch=0 is +Z (matches the car convention so
  // the cab/cockpit camera setup stays consistent).
  const fx = Math.sin(yaw) * cp;
  const fz = Math.cos(yaw) * cp;
  const fy = sp;
  return { fx, fy, fz };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function approach(value: number, target: number, rate: number, dt: number) {
  const delta = target - value;
  const step = rate * dt;
  if (Math.abs(delta) <= step) return target;
  return value + Math.sign(delta) * step;
}

// Advance the plane one frame. Pure function — caller owns the state object.
export function advancePlane(state: PlaneState, controls: PlaneControls, dt: number): void {
  // Throttle ramp.
  const throttleInput = controls.throttleUp - controls.throttleDown;
  const ramp = throttleInput > 0 ? THROTTLE_UP_PER_SEC : THROTTLE_DOWN_PER_SEC;
  state.throttle = clamp(state.throttle + throttleInput * ramp * dt, 0, 1);
  // Brake on ground decays throttle quickly so taxiing can stop.
  if (!state.airborne && controls.brake > 0) {
    state.throttle = Math.max(0, state.throttle - controls.brake * 1.6 * dt);
  }

  // Speed eases toward target. Cap at GROUND_MAX_SPEED while rolling.
  const targetSpeed = state.throttle * (state.airborne ? MAX_SPEED : GROUND_MAX_SPEED);
  const lerp = 1 - Math.exp(-SPEED_LERP_PER_SEC * dt);
  state.speed += (targetSpeed - state.speed) * lerp;
  // Brake also pulls speed toward zero on ground.
  if (!state.airborne && controls.brake > 0) {
    state.speed = Math.max(0, state.speed - controls.brake * 24 * dt);
  }

  // Angular control. Pitch / roll only affect orientation while airborne
  // OR while at high enough ground speed for stick-feel taxiing — but pitch
  // matters on ground because raising the nose at takeoff speed lifts off.
  const pitchInput = controls.pitchUp - controls.pitchDown;
  const rollInput = controls.rollRight - controls.rollLeft;
  const yawInput = controls.yawRight - controls.yawLeft;

  state.pitch = clamp(state.pitch + pitchInput * PITCH_RATE * dt, -PITCH_LIMIT, PITCH_LIMIT);
  if (state.airborne) {
    state.roll = clamp(state.roll + rollInput * ROLL_RATE * dt, -ROLL_LIMIT, ROLL_LIMIT);
  } else {
    // On ground, no rolling — keep the wings level.
    state.roll = approach(state.roll, 0, ROLL_RECOVER * 2, dt);
  }

  // Auto-recover when no input. Banked planes naturally trend toward level
  // when the player lets go — fights the "I just released A but the plane
  // keeps spinning" feeling. Pitch recovers more slowly.
  if (Math.abs(pitchInput) < 0.01) {
    state.pitch = approach(state.pitch, 0, PITCH_RECOVER * dt, 1);
  }
  if (Math.abs(rollInput) < 0.01 && state.airborne) {
    state.roll = approach(state.roll, 0, ROLL_RECOVER * dt, 1);
  }

  // Yaw: rudder + roll-coupled. Roll-coupling is scaled by speed so a
  // stationary plane on the apron doesn't slowly rotate from a residual roll.
  const speedFactor = clamp(state.speed / TAKEOFF_SPEED, 0, 1);
  const rudderYaw = yawInput * YAW_RATE * dt;
  const banked = state.airborne ? state.roll * YAW_FROM_ROLL * speedFactor * dt : 0;
  state.yaw -= rudderYaw + banked;

  // Liftoff check: above takeoff speed AND nose pitched up enough.
  if (!state.airborne && state.speed >= TAKEOFF_SPEED && state.pitch > 0.05) {
    state.airborne = true;
  }

  // Integrate position.
  if (state.airborne) {
    const { fx, fy, fz } = bodyForward(state.yaw, state.pitch);
    state.x += fx * state.speed * dt;
    state.y += fy * state.speed * dt;
    state.z += fz * state.speed * dt;
    if (state.y <= GROUND_Y) {
      // Touchdown. Snap to ground and exit airborne mode. Pitch/roll
      // recover quickly — no crash physics in v1.
      state.y = GROUND_Y;
      state.airborne = false;
      state.pitch = approach(state.pitch, 0, 4, dt);
      state.roll = approach(state.roll, 0, 6, dt);
    }
  } else {
    // Ground roll: forward only along the yaw heading, no Y movement.
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    state.x += fx * state.speed * dt;
    state.z += fz * state.speed * dt;
    state.y = GROUND_Y;
  }
}
