// Per-peer interpolation buffer for remote player poses. Updated by either:
//   - hostLoop (when a peer's input message arrives, with serverTime = now)
//   - clientLoop (from each snapshot's player entries)
//
// Read by RemotePlayer in useFrame: takes the two samples surrounding
// (serverNow - INTERP_DELAY_MS), lerps position, and snaps action/equipped
// to the latest sample (step changes, not interpolated).
//
// Module-level state — not zustand — because reads happen 60 times/sec per
// remote player and would thrash React re-renders. RemotePlayer subscribes to
// the netStore.peers list to know what to mount; sample updates are silent.

import type { ActionId, EquippedId, Vec3 } from './protocol';

export interface PoseSample {
  serverTime: number;
  pos: Vec3;
  yaw: number;
  action: ActionId;
  equipped: EquippedId;
  vehicleId?: string;
}

const BUFFER_LIMIT = 8;
const buffers = new Map<string, PoseSample[]>();

export const INTERP_DELAY_MS = 100;

export function applySample(peerId: string, sample: PoseSample): void {
  let buf = buffers.get(peerId);
  if (!buf) {
    buf = [];
    buffers.set(peerId, buf);
  }
  // Reject out-of-order samples (UDP-style reordering shouldn't happen on TCP
  // WebSockets, but defensive code is cheap).
  if (buf.length > 0 && sample.serverTime <= buf[buf.length - 1].serverTime) return;
  buf.push(sample);
  if (buf.length > BUFFER_LIMIT) buf.splice(0, buf.length - BUFFER_LIMIT);
}

export function removePeer(peerId: string): void {
  buffers.delete(peerId);
}

export function clearRemotePlayers(): void {
  buffers.clear();
}

export interface InterpolatedPose {
  pos: Vec3;
  yaw: number;
  action: ActionId;
  equipped: EquippedId;
  vehicleId?: string;
}

const SHORT_ANGLE = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function readInterpolated(peerId: string, renderTime: number): InterpolatedPose | null {
  const buf = buffers.get(peerId);
  if (!buf || buf.length === 0) return null;
  if (buf.length === 1) {
    const s = buf[0];
    return {
      pos: [...s.pos] as Vec3,
      yaw: s.yaw,
      action: s.action,
      equipped: s.equipped,
      vehicleId: s.vehicleId,
    };
  }

  // Find the first sample with serverTime >= renderTime.
  let i = 0;
  for (; i < buf.length; i++) {
    if (buf[i].serverTime >= renderTime) break;
  }
  if (i === 0) {
    const s = buf[0];
    return {
      pos: [...s.pos] as Vec3,
      yaw: s.yaw,
      action: s.action,
      equipped: s.equipped,
      vehicleId: s.vehicleId,
    };
  }
  if (i >= buf.length) {
    const s = buf[buf.length - 1];
    return {
      pos: [...s.pos] as Vec3,
      yaw: s.yaw,
      action: s.action,
      equipped: s.equipped,
      vehicleId: s.vehicleId,
    };
  }
  const a = buf[i - 1];
  const b = buf[i];
  const span = b.serverTime - a.serverTime;
  const t = span > 0 ? (renderTime - a.serverTime) / span : 0;
  const dy = SHORT_ANGLE(b.yaw - a.yaw);
  return {
    pos: [
      a.pos[0] + (b.pos[0] - a.pos[0]) * t,
      a.pos[1] + (b.pos[1] - a.pos[1]) * t,
      a.pos[2] + (b.pos[2] - a.pos[2]) * t,
    ],
    yaw: a.yaw + dy * t,
    // Step changes — snap to the most recent sample so animation flips happen
    // at the moment they actually occurred rather than crossfading via lerp.
    action: b.action,
    equipped: b.equipped,
    vehicleId: b.vehicleId,
  };
}
