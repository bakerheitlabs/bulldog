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
