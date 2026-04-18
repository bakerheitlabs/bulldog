// Lightweight runtime registry for shootable targets.
// Each TargetDummy registers itself with bbox + hit handler. The weapon
// controller raycasts against this registry (separate from Rapier physics
// so we don't pay collider overhead for hitscan).

import * as THREE from 'three';

export type TargetEntry = {
  id: string;
  position: THREE.Vector3;
  radius: number;
  height: number;
  takeHit: (damage: number) => void;
  alive: boolean;
};

const targets = new Map<string, TargetEntry>();

export function registerTarget(entry: TargetEntry) {
  targets.set(entry.id, entry);
  return () => {
    targets.delete(entry.id);
  };
}

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function raycastTargets(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
): { entry: TargetEntry; dist: number } | null {
  _origin.copy(origin);
  _dir.copy(dir).normalize();
  let best: { entry: TargetEntry; dist: number } | null = null;
  for (const t of targets.values()) {
    if (!t.alive) continue;
    const dx = t.position.x - _origin.x;
    const dz = t.position.z - _origin.z;
    const along = dx * _dir.x + dz * _dir.z;
    if (along < 0 || along > maxDist) continue;
    const px = _origin.x + _dir.x * along;
    const pz = _origin.z + _dir.z * along;
    const dxc = t.position.x - px;
    const dzc = t.position.z - pz;
    if (dxc * dxc + dzc * dzc > t.radius * t.radius) continue;
    const py = _origin.y + _dir.y * along;
    if (py < t.position.y || py > t.position.y + t.height) continue;
    if (!best || along < best.dist) best = { entry: t, dist: along };
  }
  return best;
}
