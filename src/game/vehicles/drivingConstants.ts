// Single source of truth for car tuning. Imported by Car, useCarDriver,
// useAiWaypointDriver, and specific car variants — so changes here apply
// uniformly to parked, traffic, and police cars.

// Fallback top speed used when no per-variant value is supplied. Real
// per-car limits live on `VehicleIdentity.topSpeed` in vehicleIdentity.ts.
export const MAX_SPEED = 24;
export const REVERSE_SPEED = 8;
export const ACCEL = 13;
export const BRAKE = 18;
export const COAST_DRAG = 2.2;
export const MAX_YAW_RATE = 1.6;

export const RUN_OVER_SPEED = 5;
export const RUN_OVER_RADIUS = 1.5;
export const RUN_OVER_DAMAGE = 120;

// Shared rigid body / collider tuning.
export const CAR_MASS = 800;
export const CAR_LINEAR_DAMPING = 0.4;
export const CAR_ANGULAR_DAMPING = 4;
// Cuboid half-extents matching the 4m-long car model.
export const CAR_COLLIDER_HALF: [number, number, number] = [0.9, 0.45, 2];
export const CAR_SPAWN_Y = 0.6;

// Per-variant size multiplier applied to both the visual fit-length and the
// physics collider so the two stay in sync. 1.0 = standard 4m car. The
// Floord Enforcer (carPolice) is intentionally beefier than civilian traffic.
const CAR_SIZE_SCALE: Record<string, number> = {
  carPolice: 1.15,
};
export function getCarSizeScale(variant: string): number {
  return CAR_SIZE_SCALE[variant] ?? 1;
}

// Speed at which an onHit damages the car / hurts the player it collides with.
export const CAR_IMPACT_THRESHOLD = 4;
// Hood offset used by smoke + fire emitters (model's +Z is forward).
export const CAR_HOOD_FORWARD = 1.6;
export const CAR_HOOD_UP = 0.3;
