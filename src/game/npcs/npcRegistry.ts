// Runtime registry of damageable NPCs (pedestrians for now).
// Used by punch/melee + weapons hitscan.

import * as THREE from 'three';

export type NpcEntry = {
  id: string;
  getPosition: () => THREE.Vector3;
  radius: number;
  height: number;
  alive: boolean;
  takeHit: (damage: number, dir: THREE.Vector3) => void;
};

const npcs = new Map<string, NpcEntry>();

export function registerNpc(entry: NpcEntry) {
  npcs.set(entry.id, entry);
  return () => {
    npcs.delete(entry.id);
  };
}

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();

export function raycastNpcs(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDist: number,
): { entry: NpcEntry; dist: number } | null {
  _origin.copy(origin);
  _dir.copy(dir).normalize();
  let best: { entry: NpcEntry; dist: number } | null = null;
  for (const n of npcs.values()) {
    if (!n.alive) continue;
    const p = n.getPosition();
    _pos.copy(p);
    const dx = _pos.x - _origin.x;
    const dz = _pos.z - _origin.z;
    const along = dx * _dir.x + dz * _dir.z;
    if (along < 0 || along > maxDist) continue;
    const px = _origin.x + _dir.x * along;
    const pz = _origin.z + _dir.z * along;
    const ddx = _pos.x - px;
    const ddz = _pos.z - pz;
    if (ddx * ddx + ddz * ddz > n.radius * n.radius) continue;
    const py = _origin.y + _dir.y * along;
    if (py < _pos.y || py > _pos.y + n.height) continue;
    if (!best || along < best.dist) best = { entry: n, dist: along };
  }
  return best;
}

// Vehicle running NPCs over — damages any alive npc within `radius` of `pos`.
// NPCs aren't rigid bodies, so car onCollisionEnter never fires for them; the
// caller must poll this every frame while the vehicle is moving fast.
const _vehPos = new THREE.Vector3();
export function vehicleRunOver(pos: THREE.Vector3, radius: number, damage: number): number {
  _vehPos.copy(pos);
  let hits = 0;
  for (const n of npcs.values()) {
    if (!n.alive) continue;
    const p = n.getPosition();
    const dx = p.x - _vehPos.x;
    const dz = p.z - _vehPos.z;
    if (dx * dx + dz * dz > radius * radius) continue;
    const len = Math.hypot(dx, dz) || 1;
    const hitDir = new THREE.Vector3(dx / len, 0, dz / len);
    n.takeHit(damage, hitDir);
    hits++;
  }
  return hits;
}

// Melee: damage all NPCs within a cone in front of the player.
export function meleeHit(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  range: number,
  coneRad: number,
  damage: number,
): number {
  const dirN = forward.clone().setY(0).normalize();
  let hits = 0;
  for (const n of npcs.values()) {
    if (!n.alive) continue;
    const p = n.getPosition();
    const dx = p.x - origin.x;
    const dz = p.z - origin.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > range * range) continue;
    const len = Math.sqrt(distSq);
    if (len < 0.01) continue;
    const dot = (dx / len) * dirN.x + (dz / len) * dirN.z;
    if (dot < Math.cos(coneRad)) continue;
    const hitDir = new THREE.Vector3(dx, 0, dz).normalize();
    n.takeHit(damage, hitDir);
    hits++;
  }
  return hits;
}
