// Runs on the host only. Aggregates each peer's latest pose (received via
// `input` messages) plus the host's own pose into a `snapshot` broadcast at
// SNAPSHOT_HZ. The host also writes peer poses straight into its local
// remotePlayersStore so its own renderer sees them without round-tripping a
// snapshot to itself.

import { useGameStore } from '@/state/gameStore';
import { readLocalAction, readLocalYaw } from '@/game/player/playerLocalState';
import {
  useVehicleStore,
  readDrivenCarPos,
  readDrivenCarYaw,
} from '@/game/vehicles/vehicleState';
import { forEachNpc } from '@/game/npcs/npcRegistry';
import { Transport } from './transport';
import {
  HOST_ID,
  NPC_KIND_PED,
  NPC_KIND_COP,
  actionToId,
  equippedToId,
  type NpcSample,
  type PlayerSample,
  type VehicleSample,
} from './protocol';
import { applySample } from './remotePlayersStore';
import { applyVehicleSample } from './remoteVehiclesStore';

const SNAPSHOT_HZ = 20;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;

interface PeerState {
  pos: [number, number, number];
  yaw: number;
  action: number;
  equipped: number;
  vehicleId?: string;
  lastSeen: number;
}

let timer: ReturnType<typeof setInterval> | null = null;
let tick = 0;
const peers = new Map<string, PeerState>();
let transportRef: Transport | null = null;
let prevNpcIds: Set<string> = new Set();

export function startHostLoop(transport: Transport): void {
  if (timer) return;
  transportRef = transport;
  tick = 0;

  timer = setInterval(() => {
    if (!transportRef) return;
    const players: PlayerSample[] = [];
    const vehicles: VehicleSample[] = [];

    // Host's own pose. If the host is driving a car, the player avatar sits
    // at the car's pose and action='drive'; the vehicle entry covers the car.
    const gs = useGameStore.getState();
    const hostDrivenCar = useVehicleStore.getState().drivenCarId;
    let hostPos: [number, number, number];
    let hostYaw: number;
    let hostAction: number;
    if (hostDrivenCar) {
      const cp = readDrivenCarPos();
      const cy = readDrivenCarYaw();
      hostPos = cp ? [cp.x, cp.y, cp.z] : [...gs.player.position] as [number, number, number];
      hostYaw = cy;
      hostAction = actionToId('drive');
    } else {
      hostPos = [...gs.player.position] as [number, number, number];
      hostYaw = readLocalYaw();
      hostAction = actionToId(readLocalAction());
    }
    const hostSample: PlayerSample = {
      id: HOST_ID,
      pos: hostPos,
      yaw: hostYaw,
      action: hostAction,
      equipped: equippedToId(gs.inventory.equipped),
      vehicleId: hostDrivenCar ?? undefined,
    };
    players.push(hostSample);
    if (hostDrivenCar) {
      vehicles.push({
        id: hostDrivenCar,
        driverId: HOST_ID,
        pos: hostPos,
        yaw: hostYaw,
      });
    }

    // Each peer's latest reported pose.
    for (const [peerId, st] of peers.entries()) {
      players.push({
        id: peerId,
        pos: [...st.pos] as [number, number, number],
        yaw: st.yaw,
        action: st.action,
        equipped: st.equipped,
        vehicleId: st.vehicleId,
      });
      if (st.vehicleId) {
        vehicles.push({
          id: st.vehicleId,
          driverId: peerId,
          pos: [...st.pos] as [number, number, number],
          yaw: st.yaw,
        });
      }
    }

    // NPCs from the local registry. No culling yet — bandwidth is fine on
    // LAN at the current 100-ish NPC count. Diff against the previous tick
    // so clients can despawn cleanly without waiting on interp timeouts.
    const npcs: NpcSample[] = [];
    const seenNpcIds = new Set<string>();
    forEachNpc((n) => {
      seenNpcIds.add(n.id);
      const p = n.getPosition();
      npcs.push({
        id: n.id,
        kind: n.kind === 'cop' ? NPC_KIND_COP : NPC_KIND_PED,
        variantIdx: n.variantIdx,
        pos: [p.x, p.y, p.z],
        yaw: n.getYaw(),
        hp: n.getHp(),
        action: actionToId(n.getAction()),
      });
    });
    const npcsGone: string[] = [];
    for (const id of prevNpcIds) {
      if (!seenNpcIds.has(id)) npcsGone.push(id);
    }
    prevNpcIds = seenNpcIds;

    transportRef.send({
      t: 'snapshot',
      serverTime: Date.now(),
      tick: ++tick,
      players,
      vehicles,
      npcs,
      npcsGone,
      worldTime: gs.time.seconds,
      worldDate: { y: gs.time.year, m: gs.time.month, d: gs.time.day },
      weather: gs.weather.type,
      stockPrices: Object.fromEntries(
        Object.entries(gs.stocks.prices).map(([k, v]) => [k, v.price]),
      ),
    });
  }, SNAPSHOT_INTERVAL_MS);
}

export function stopHostLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  peers.clear();
  transportRef = null;
  tick = 0;
  prevNpcIds = new Set();
}

// Called by netStore when an `input` message lands. peerId is the game-level
// id assigned in the welcome handshake.
export function onPeerInput(
  peerId: string,
  pos: [number, number, number],
  yaw: number,
  action: number,
  equipped: number,
  vehicleId: string | undefined,
): void {
  peers.set(peerId, { pos, yaw, action, equipped, vehicleId, lastSeen: Date.now() });
  // Update host's local view of this peer immediately so the host's renderer
  // sees them without waiting for the next snapshot tick.
  applySample(peerId, {
    serverTime: Date.now(),
    pos,
    yaw,
    action,
    equipped,
    vehicleId,
  });
  // If the peer is driving a car, also pump a vehicle sample so host's
  // useRemoteCarPose follows the car immediately.
  if (vehicleId) {
    applyVehicleSample(vehicleId, {
      serverTime: Date.now(),
      pos,
      yaw,
      driverId: peerId,
    });
  }
}

export function dropPeerInput(peerId: string): void {
  peers.delete(peerId);
}
