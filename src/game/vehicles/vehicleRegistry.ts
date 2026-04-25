import * as THREE from 'three';

export type VehicleEntry = {
  id: string;
  getPosition: () => THREE.Vector3;
};

const vehicles = new Map<string, VehicleEntry>();

export function registerVehicle(entry: VehicleEntry) {
  vehicles.set(entry.id, entry);
  return () => {
    vehicles.delete(entry.id);
  };
}

export function findNearestVehicle(
  playerPos: { x: number; z: number },
  maxDist: number,
): { entry: VehicleEntry; dist: number } | null {
  let best: { entry: VehicleEntry; dist: number } | null = null;
  for (const v of vehicles.values()) {
    const p = v.getPosition();
    const dx = p.x - playerPos.x;
    const dz = p.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { entry: v, dist: d };
  }
  return best;
}

// Is any registered vehicle (other than `selfId`) within `maxDist` and
// inside a forward cone of half-angle `halfAngleCos` (precomputed cosine)?
// `yaw` follows the +Z-forward convention used by car bodies — i.e.
// forward = (sin yaw, 0, cos yaw). Used by AI cars to yield to whatever's
// directly in front of them so they don't pile up at intersections.
export function isVehicleAhead(
  selfId: string,
  selfPos: { x: number; z: number },
  yaw: number,
  maxDist: number,
  halfAngleCos: number,
): boolean {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const v of vehicles.values()) {
    if (v.id === selfId) continue;
    const op = v.getPosition();
    const dx = op.x - selfPos.x;
    const dz = op.z - selfPos.z;
    const dist = Math.hypot(dx, dz);
    // < 0.5 means we're already touching/overlapping — both cars would
    // see each other "ahead" and both would pin, deadlocking the pile.
    // Skip the cone, let them keep driving, and they'll naturally
    // separate as their target waypoints diverge.
    if (dist < 0.5 || dist > maxDist) continue;
    if ((dx * fx + dz * fz) / dist >= halfAngleCos) return true;
  }
  return false;
}
