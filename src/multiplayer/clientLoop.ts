// Runs on a non-host client only. Sends an `input` message at INPUT_HZ with
// the local player's pose so the host can authoritatively rebroadcast it. Also
// applies incoming snapshot players (excluding self) into remotePlayersStore.

import { useGameStore } from '@/state/gameStore';
import { readLocalAction, readLocalYaw } from '@/game/player/playerLocalState';
import {
  useVehicleStore,
  readDrivenCarPos,
  readDrivenCarYaw,
} from '@/game/vehicles/vehicleState';
import { Transport } from './transport';
import {
  actionToId,
  equippedToId,
  type NpcSample,
  type PlayerSample,
  type VehicleSample,
} from './protocol';
import { applySample, removePeer } from './remotePlayersStore';
import { applyVehicleSample } from './remoteVehiclesStore';
import {
  applyNpcSample,
  removeNpc,
  useRemoteNpcsList,
} from './remoteNpcsStore';

const INPUT_HZ = 30;
const INPUT_INTERVAL_MS = 1000 / INPUT_HZ;

let timer: ReturnType<typeof setInterval> | null = null;
let transportRef: Transport | null = null;
let seq = 0;

export function startClientLoop(transport: Transport): void {
  if (timer) return;
  transportRef = transport;
  seq = 0;

  timer = setInterval(() => {
    if (!transportRef) return;
    const gs = useGameStore.getState();
    const drivenCarId = useVehicleStore.getState().drivenCarId;

    let pos: [number, number, number];
    let yaw: number;
    let action: number;
    if (drivenCarId) {
      const cp = readDrivenCarPos();
      const cy = readDrivenCarYaw();
      pos = cp ? [cp.x, cp.y, cp.z] : [...gs.player.position] as [number, number, number];
      yaw = cy;
      action = actionToId('drive');
    } else {
      pos = [...gs.player.position] as [number, number, number];
      yaw = readLocalYaw();
      action = actionToId(readLocalAction());
    }

    transportRef.send({
      t: 'input',
      seq: ++seq,
      clientTime: Date.now(),
      pos,
      yaw,
      action,
      equipped: equippedToId(gs.inventory.equipped),
      vehicleId: drivenCarId ?? undefined,
    });
  }, INPUT_INTERVAL_MS);
}

export function stopClientLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  transportRef = null;
  seq = 0;
}

// Apply a snapshot's player entries to remotePlayersStore, skipping self.
export function applySnapshotPlayers(
  serverTime: number,
  selfId: string | null,
  players: PlayerSample[],
): void {
  for (const p of players) {
    if (p.id === selfId) continue;
    applySample(p.id, {
      serverTime,
      pos: p.pos,
      yaw: p.yaw,
      action: p.action,
      equipped: p.equipped,
      vehicleId: p.vehicleId,
    });
  }
}

// Apply a snapshot's vehicle entries, skipping cars driven by self.
export function applySnapshotVehicles(
  serverTime: number,
  selfId: string | null,
  vehicles: VehicleSample[],
): void {
  for (const v of vehicles) {
    if (v.driverId === selfId) continue;
    applyVehicleSample(v.id, {
      serverTime,
      pos: v.pos,
      yaw: v.yaw,
      driverId: v.driverId,
    });
  }
}

export function dropRemotePlayer(peerId: string): void {
  removePeer(peerId);
}

// Apply a snapshot's NPC entries to remoteNpcsStore. New NPCs trigger an
// upsert into the React-visible list (so RemoteNpcs mounts a renderer);
// poses go straight into the interpolation buffer.
export function applySnapshotNpcs(
  serverTime: number,
  npcs: NpcSample[],
  gone: string[],
): void {
  const listStore = useRemoteNpcsList.getState();
  for (const n of npcs) {
    listStore.upsert({ id: n.id, kind: n.kind, variantIdx: n.variantIdx });
    applyNpcSample(n.id, {
      serverTime,
      pos: n.pos,
      yaw: n.yaw,
      action: n.action,
      hp: n.hp,
    });
  }
  for (const id of gone) {
    listStore.remove(id);
    removeNpc(id);
  }
}
