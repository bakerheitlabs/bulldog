// Per-NPC interpolation buffer (mirrors remotePlayersStore). Updated by
// clientLoop from snapshot npc entries; read by RemoteNpc in useFrame.
//
// Module-level (not zustand) for the same per-frame-read reason. Renderer
// subscribes to a separate zustand list of *which* NPC ids are live so it
// can mount/unmount components.

import type { ActionId, NpcKindId, Vec3 } from './protocol';
import { create } from 'zustand';

export interface NpcPoseSample {
  serverTime: number;
  pos: Vec3;
  yaw: number;
  action: ActionId;
  hp: number;
}

const BUFFER_LIMIT = 6;
const buffers = new Map<string, NpcPoseSample[]>();

export const NPC_INTERP_DELAY_MS = 100;

export function applyNpcSample(id: string, sample: NpcPoseSample): void {
  let buf = buffers.get(id);
  if (!buf) {
    buf = [];
    buffers.set(id, buf);
  }
  if (buf.length > 0 && sample.serverTime <= buf[buf.length - 1].serverTime) return;
  buf.push(sample);
  if (buf.length > BUFFER_LIMIT) buf.splice(0, buf.length - BUFFER_LIMIT);
}

export function removeNpc(id: string): void {
  buffers.delete(id);
}

export function clearRemoteNpcs(): void {
  buffers.clear();
}

export interface InterpolatedNpcPose {
  pos: Vec3;
  yaw: number;
  action: ActionId;
  hp: number;
}

const SHORT_ANGLE = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function readInterpolatedNpc(id: string, renderTime: number): InterpolatedNpcPose | null {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return null;
  if (buf.length === 1) {
    const s = buf[0];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, action: s.action, hp: s.hp };
  }
  let i = 0;
  for (; i < buf.length; i++) if (buf[i].serverTime >= renderTime) break;
  if (i === 0) {
    const s = buf[0];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, action: s.action, hp: s.hp };
  }
  if (i >= buf.length) {
    const s = buf[buf.length - 1];
    return { pos: [...s.pos] as Vec3, yaw: s.yaw, action: s.action, hp: s.hp };
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
    action: b.action,
    hp: b.hp,
  };
}

// React-visible list of NPC identities (id + kind + variantIdx). Pose data
// stays in the interpolation buffers above; this store only changes when
// NPCs spawn or despawn.
export interface RemoteNpcIdentity {
  id: string;
  kind: NpcKindId;
  variantIdx: number;
}

interface RemoteNpcsListState {
  list: Record<string, RemoteNpcIdentity>;
  upsert(id: RemoteNpcIdentity): void;
  remove(id: string): void;
  clear(): void;
}

export const useRemoteNpcsList = create<RemoteNpcsListState>((set) => ({
  list: {},
  upsert(id) {
    set((s) => {
      const cur = s.list[id.id];
      if (cur && cur.kind === id.kind && cur.variantIdx === id.variantIdx) return {};
      return { list: { ...s.list, [id.id]: id } };
    });
  },
  remove(id) {
    set((s) => {
      if (!(id in s.list)) return {};
      const next = { ...s.list };
      delete next[id];
      return { list: next };
    });
  },
  clear() {
    set({ list: {} });
  },
}));
