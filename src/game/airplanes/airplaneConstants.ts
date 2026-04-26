// Tunable constants for the arcade flight model. Kept in one file so
// behavior tweaks don't require touching the controller.

// Throttle ramps from 0 → 1 in this many seconds when held.
export const THROTTLE_UP_PER_SEC = 0.45;
export const THROTTLE_DOWN_PER_SEC = 0.65;

// Speed (m/s) reached at full throttle. Roughly 540 km/h — small airliner.
export const MAX_SPEED = 150;
// Speed at which the plane can actually leave the runway. Below this, pitch
// input has no lift effect.
export const TAKEOFF_SPEED = 35;
// Ground roll: throttle accelerates speed but caps lower than air max so
// taxiing doesn't feel like a jet on autobahn.
export const GROUND_MAX_SPEED = 70;

// How fast the speed scalar eases toward (throttle * MAX_SPEED).
export const SPEED_LERP_PER_SEC = 0.5;

// Angular rates (radians per second of input held).
export const PITCH_RATE = 0.9;
export const ROLL_RATE = 1.6;
export const YAW_RATE = 0.55; // direct rudder yaw
// Banked turn: when rolled, the nose drifts in the direction of the bank.
// rad/s of yaw applied per radian of roll. Multiplied by speed factor so
// stationary plane doesn't yaw from a static roll.
export const YAW_FROM_ROLL = 0.85;

// Hard limits so the plane can't flip onto its back or pitch past vertical.
export const PITCH_LIMIT = Math.PI / 2 - 0.1;
export const ROLL_LIMIT = Math.PI / 2 - 0.1;

// Auto-level rates when no input is given (per second).
export const PITCH_RECOVER = 0.6;
export const ROLL_RECOVER = 1.2;

// Ground constraints. y of the plane's body when sitting on the runway.
export const GROUND_Y = 1.4;
// Vertical speed below which a touchdown is "soft" and we just snap to ground.
export const SOFT_LAND_VSPEED = 18;

// Player must be slowed below this to exit the cockpit. Prevents jumping out
// at takeoff speed and falling from the sky.
export const EXIT_SPEED_LIMIT = 12;

// How close the player needs to be to a parked plane to enter (matches the
// spec for cars — vehicles use 3.5m, planes are physically larger so we go
// wider).
export const ENTER_RANGE = 8;

// Visual scale: target length for the airplane GLB along its longest axis.
// Set to roughly the apron-spaced parked-plane footprint we authored.
export const AIRPLANE_TARGET_LENGTH = 30;
