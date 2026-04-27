// Per-vehicle interpolation buffer (mirrors remotePlayersStore for cars).
// Updated by hostLoop / clientLoop from snapshot vehicle entries; read by
// useRemoteCarPose in useFrame.
//
// Module-level state (not zustand) for the same reason as remotePlayersStore:
// useFrame consumers don't need React re-renders on every sample.

import type { Vec3 } from './protocol';

export interface VehiclePoseSample {
  serverTime: number;
  pos: Vec3;
  yaw: number;
  driverId: string;
}

const BUFFER_LIMIT = 8;
const buffers = new Map<string, VehiclePoseSample[]>();

export function applyVehicleSample(carId: string, sample: VehiclePoseSample): void {
  let buf = buffers.get(carId);
  if (!buf) {
    buf = [];
    buffers.set(carId, buf);
  }
  if (buf.length > 0 && sample.serverTime <= buf[buf.length - 1].serverTime) return;
  buf.push(sample);
  if (buf.length > BUFFER_LIMIT) buf.splice(0, buf.length - BUFFER_LIMIT);
}

export function removeVehicle(carId: string): void {
  buffers.delete(carId);
}

export function clearRemoteVehicles(): void {
  buffers.clear();
}

export interface InterpolatedVehiclePose {
  pos: Vec3;
  yaw: number;
  driverId: string;
}

const SHORT_ANGLE = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function readInterpolatedVehicle(
  carId: string,
  renderTime: number,
): InterpolatedVehiclePose | null {
  const buf = buffers.get(carId);
  if (!buf || buf.length === 0) return null;
  if (buf.length === 1) {
    const s = buf[0];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, driverId: s.driverId };
  }
  let i = 0;
  for (; i < buf.length; i++) {
    if (buf[i].serverTime >= renderTime) break;
  }
  if (i === 0) {
    const s = buf[0];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, driverId: s.driverId };
  }
  if (i >= buf.length) {
    const s = buf[buf.length - 1];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, driverId: s.driverId };
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
    driverId: b.driverId,
  };
}
