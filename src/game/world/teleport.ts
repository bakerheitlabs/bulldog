// Dev-console teleport: a one-shot module-level signal Player.tsx polls
// from useFrame. We don't put this in a Zustand store because it's a single
// transient action — making every consumer subscribe + re-render would be
// noise, and Player.tsx already runs every frame anyway.

import { findCellByTag, getPlayerSpawn, type Vec3 } from './cityLayout';
import { AIRPORTS } from './splineRegions';
import { DOCK_ENTRY } from './Dock';

export const TELEPORT_DESTINATIONS = [
  'airport',
  'island2',
  'dock',
  'hospital',
  'gunstore',
  'gun_store',
  'mechanic',
  'range',
  'spawn',
] as const;

export type TeleportDestination = (typeof TELEPORT_DESTINATIONS)[number];

export function isTeleportDestination(s: string): s is TeleportDestination {
  return (TELEPORT_DESTINATIONS as readonly string[]).includes(s);
}

// Resolve a name to a world position the player should appear at — generally
// outdoors next to (not inside) the destination building so they don't spawn
// stuck in geometry.
export function resolveDestination(name: TeleportDestination): Vec3 | null {
  if (name === 'spawn') return getPlayerSpawn();
  if (name === 'airport') {
    // Drop the player on the main airport's terminal-front parking lot, just
    // east of the terminal so they land on asphalt rather than inside it.
    const lot = AIRPORTS[0].parkingLot;
    return [lot.centerX, 1, lot.centerZ];
  }
  if (name === 'island2') {
    // Drop the player on island 2's airport parking lot.
    const lot = AIRPORTS[1].parkingLot;
    return [lot.centerX, 1, lot.centerZ];
  }
  if (name === 'dock') {
    // Land-side foot of the pier on the main island's north shore.
    return DOCK_ENTRY;
  }
  // Tagged grid landmarks: re-use the same "stand on the east-face sidewalk"
  // formula as getPlayerSpawn / getHospitalRespawn.
  const tag =
    name === 'gunstore' || name === 'gun_store'
      ? 'gunstore'
      : name === 'hospital'
        ? 'hospital'
        : name === 'mechanic'
          ? 'mechanic'
          : 'range';
  const info = findCellByTag(tag);
  if (!info) return null;
  const [x, , z] = info.center;
  return [x + info.size.width / 2 - 2, 1, z];
}

let _pending: Vec3 | null = null;

export function requestTeleport(pos: Vec3) {
  _pending = pos;
}

// Read without consuming — Player.tsx peeks first, exits any vehicle, and
// only consumes once the body is back under its control.
export function peekTeleport(): Vec3 | null {
  return _pending;
}

export function consumeTeleport(): Vec3 | null {
  const v = _pending;
  _pending = null;
  return v;
}
