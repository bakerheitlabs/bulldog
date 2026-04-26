import * as THREE from 'three';

// Mirror of vehicleRegistry but for airplanes. Kept separate so the planes'
// larger interaction radius and 3D-position semantics don't bleed into the
// cars' tighter, ground-level proximity rules.

export type AirplaneEntry = {
  id: string;
  getPosition: () => THREE.Vector3;
};

const planes = new Map<string, AirplaneEntry>();

export function registerAirplane(entry: AirplaneEntry) {
  planes.set(entry.id, entry);
  return () => {
    planes.delete(entry.id);
  };
}

export function findNearestAirplane(
  playerPos: { x: number; z: number },
  maxDist: number,
): { entry: AirplaneEntry; dist: number } | null {
  let best: { entry: AirplaneEntry; dist: number } | null = null;
  for (const p of planes.values()) {
    const pos = p.getPosition();
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { entry: p, dist: d };
  }
  return best;
}
