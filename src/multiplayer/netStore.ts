import { create } from 'zustand';
import { mpIpc } from './ipc';
import { Transport } from './transport';
import {
  HOST_ID,
  PROTOCOL_VERSION,
  type C2H,
  type H2C,
  type NetEvent,
  type PeerInfo,
} from './protocol';
import { seedClock, resetClock } from './clock';
import { startHostLoop, stopHostLoop, onPeerInput, dropPeerInput } from './hostLoop';
import {
  startClientLoop,
  stopClientLoop,
  applySnapshotPlayers,
  applySnapshotVehicles,
  applySnapshotNpcs,
} from './clientLoop';
import * as THREE from 'three';
import { raycastNpcs } from '@/game/npcs/npcRegistry';
import { spawnTracer } from '@/game/weapons/HitFx';
import { WEAPONS } from '@/game/weapons/weapons';
import { useGameStore } from '@/state/gameStore';
import type { WeaponId } from '@/save/schema';
import { clearRemotePlayers, removePeer as removeRemotePlayer } from './remotePlayersStore';
import { clearRemoteVehicles, removeVehicle as removeRemoteVehicle } from './remoteVehiclesStore';
import { clearRemoteNpcs, useRemoteNpcsList } from './remoteNpcsStore';
import { useVehicleOwnershipStore } from './vehicleOwnership';
import { useVehicleStore } from '@/game/vehicles/vehicleState';

export type NetStatus =
  | 'idle'
  | 'starting'
  | 'lobby-host'
  | 'lobby-client'
  | 'in-game'
  | 'error';

export interface ChatEntry {
  id: number;
  from: string;
  name: string;
  text: string;
  at: number;
}

interface NetState {
  status: NetStatus;
  isHost: boolean;
  inGame: boolean;
  selfId: string | null;
  hostId: string | null;
  peers: Record<string, PeerInfo>;
  port: number;
  playerName: string;
  errorMessage: string | null;
  chatLog: ChatEntry[];

  startHost(port: number, name: string): Promise<void>;
  stopHost(): Promise<void>;
  join(host: string, port: number, name: string): Promise<void>;
  disconnect(): Promise<void>;
  launchWorld(): void;
  sendChat(text: string): void;
  setPlayerName(name: string): void;
  setPort(port: number): void;
  clearError(): void;

  // Vehicle interaction funnel — useVehicleInteraction calls these in MP so
  // the host can validate ownership and broadcast the resulting state. In
  // single-player these aren't called (the hook bypasses to local enterCar).
  requestEnterCar(carId: string): void;
  requestExitCar(): void;

  // Fire funnel — weapon controller calls this in MP to apply NPC damage
  // authoritatively. Returns true if the call was handled (in-MP); false
  // means the caller should fall back to local raycast/damage.
  fireWeapon(weapon: string, origin: [number, number, number], dir: [number, number, number]): boolean;
}

const NAME_KEY = 'bulldog.mp.name';
const PORT_KEY = 'bulldog.mp.port';
const DEFAULT_PORT = 7777;

const transport = new Transport();
let chatSeq = 0;

// Host-only: maps transport socket id -> game peer info (set on hello).
const hostSockets = new Map<string, PeerInfo>();
let hostNextId = 1;
// Host-only: tracks which game peerId currently drives each car. Mirrors the
// fanned-out vehicleOwnership store but is the source of truth on the host
// (vehicleOwnership.remoteDrivers excludes the host's own car).
const hostVehicleOwnership = new Map<string, string>();
const hostPeerToCar = new Map<string, string>();

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? 'Player';
  } catch {
    return 'Player';
  }
}

function loadPort(): number {
  try {
    const v = parseInt(localStorage.getItem(PORT_KEY) ?? '', 10);
    return Number.isFinite(v) && v > 0 && v < 65536 ? v : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function nextChatId(): number {
  return ++chatSeq;
}

export const useNetStore = create<NetState>((set, get) => ({
  status: 'idle',
  isHost: false,
  inGame: false,
  selfId: null,
  hostId: null,
  peers: {},
  port: loadPort(),
  playerName: loadName(),
  errorMessage: null,
  chatLog: [],

  setPlayerName(name) {
    const trimmed = name.trim().slice(0, 24) || 'Player';
    try { localStorage.setItem(NAME_KEY, trimmed); } catch { /* ignore */ }
    set({ playerName: trimmed });
  },

  setPort(port) {
    if (!Number.isFinite(port) || port <= 0 || port >= 65536) return;
    try { localStorage.setItem(PORT_KEY, String(port)); } catch { /* ignore */ }
    set({ port });
  },

  clearError() {
    set({ errorMessage: null, status: get().status === 'error' ? 'idle' : get().status });
  },

  async startHost(port, name) {
    set({ status: 'starting', errorMessage: null });
    get().setPlayerName(name);
    get().setPort(port);

    transport.attach({
      onIncoming: (msg) => handleHostIncoming(msg as C2H & { _from: string }),
      onPeerJoin: (socketId) => {
        // Wait for hello before adding to peers — placeholder name.
        hostSockets.set(socketId, { id: socketId, name: '…' });
      },
      onPeerLeave: (socketId) => {
        const info = hostSockets.get(socketId);
        hostSockets.delete(socketId);
        if (!info || info.name === '…') return;
        const peers = { ...get().peers };
        delete peers[info.id];
        set({ peers });
        dropPeerInput(info.id);
        removeRemotePlayer(info.id);
        // If they were driving, release the car so others can take it.
        hostReleasePeerVehicle(info.id);
        broadcast({ t: 'event', events: [{ e: 'peer-leave', peerId: info.id }] });
      },
      onTransportError: (m) => set({ errorMessage: m }),
    });

    const result = await mpIpc.hostStart(port);
    if (!result.ok) {
      transport.detach();
      set({ status: 'error', errorMessage: friendlyError(result.error) });
      return;
    }

    const selfPeer: PeerInfo = { id: HOST_ID, name: get().playerName };
    set({
      status: 'lobby-host',
      isHost: true,
      inGame: false,
      selfId: HOST_ID,
      hostId: HOST_ID,
      peers: { [HOST_ID]: selfPeer },
      chatLog: [],
    });
  },

  async stopHost() {
    stopHostLoop();
    transport.detach();
    hostSockets.clear();
    hostNextId = 1;
    hostVehicleOwnership.clear();
    hostPeerToCar.clear();
    clearRemotePlayers();
    clearRemoteVehicles();
    clearRemoteNpcs();
    useRemoteNpcsList.getState().clear();
    useVehicleOwnershipStore.getState().clearAll();
    resetClock();
    await mpIpc.hostStop();
    set({
      status: 'idle',
      isHost: false,
      inGame: false,
      selfId: null,
      hostId: null,
      peers: {},
      chatLog: [],
      errorMessage: null,
    });
  },

  async join(host, port, name) {
    set({ status: 'starting', errorMessage: null });
    get().setPlayerName(name);
    get().setPort(port);

    transport.attach({
      onIncoming: (msg) => handleClientIncoming(msg as H2C & { _from: string }),
      onHostDown: () => {
        stopClientLoop();
        clearRemotePlayers();
        clearRemoteVehicles();
        useVehicleOwnershipStore.getState().clearAll();
        resetClock();
        transport.detach();
        set({
          status: 'error',
          errorMessage: 'Host disconnected.',
          isHost: false,
          inGame: false,
          selfId: null,
          hostId: null,
          peers: {},
        });
      },
      onTransportError: (m) => set({ errorMessage: m }),
    });

    const result = await mpIpc.join(host, port);
    if (!result.ok) {
      transport.detach();
      set({ status: 'error', errorMessage: friendlyError(result.error) });
      return;
    }

    transport.send({
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      name: get().playerName,
      clientTime: Date.now(),
    });
  },

  async disconnect() {
    stopHostLoop();
    stopClientLoop();
    hostVehicleOwnership.clear();
    hostPeerToCar.clear();
    clearRemotePlayers();
    clearRemoteVehicles();
    clearRemoteNpcs();
    useRemoteNpcsList.getState().clear();
    useVehicleOwnershipStore.getState().clearAll();
    resetClock();
    transport.detach();
    await mpIpc.disconnect();
    set({
      status: 'idle',
      isHost: false,
      inGame: false,
      selfId: null,
      hostId: null,
      peers: {},
      chatLog: [],
      errorMessage: null,
    });
  },

  launchWorld() {
    const state = get();
    if (!state.isHost) return;
    if (state.inGame) return;
    set({ status: 'in-game', inGame: true });
    startHostLoop(transport);
    broadcast({ t: 'event', events: [{ e: 'launch' }] });
  },

  sendChat(text) {
    const trimmed = text.trim().slice(0, 240);
    if (!trimmed) return;
    const state = get();
    if (state.isHost) {
      appendChat(HOST_ID, state.playerName, trimmed);
      broadcast({
        t: 'event',
        events: [{ e: 'chat', from: HOST_ID, text: trimmed }],
      });
    } else {
      transport.send({ t: 'chat', text: trimmed });
    }
  },

  requestEnterCar(carId) {
    const state = get();
    if (!state.inGame) return;
    if (state.isHost) {
      hostHandleVehicleEnter(HOST_ID, carId);
    } else {
      transport.send({ t: 'vehicle-enter-req', carId });
    }
  },

  requestExitCar() {
    const state = get();
    if (!state.inGame) return;
    if (state.isHost) {
      hostHandleVehicleExit(HOST_ID);
    } else {
      transport.send({ t: 'vehicle-exit-req' });
    }
  },

  fireWeapon(weapon, origin, dir) {
    const state = get();
    if (!state.inGame) return false;
    if (state.isHost) {
      // Host applies its own NPC damage locally + broadcasts a fire event so
      // clients render the tracer for this shot.
      hostApplyFire(HOST_ID, weapon, origin, dir, /*alreadyAppliedLocally*/ true);
    } else {
      transport.send({
        t: 'fire-req',
        clientTime: Date.now(),
        weapon,
        origin,
        dir,
      });
    }
    return true;
  },
}));

function handleHostIncoming(msg: C2H & { _from: string }): void {
  switch (msg.t) {
    case 'hello': {
      if (msg.protocol !== PROTOCOL_VERSION) {
        transport.send(
          { t: 'reject', reason: `protocol-mismatch-host=${PROTOCOL_VERSION}` },
          msg._from,
        );
        return;
      }
      const peerId = `p${hostNextId++}`;
      const safeName = (msg.name || 'Player').trim().slice(0, 24) || 'Player';
      const peer: PeerInfo = { id: peerId, name: safeName };
      hostSockets.set(msg._from, peer);

      const state = useNetStore.getState();
      const peers = { ...state.peers, [peerId]: peer };
      useNetStore.setState({ peers });

      transport.send(
        {
          t: 'welcome',
          protocol: PROTOCOL_VERSION,
          selfId: peerId,
          hostId: HOST_ID,
          serverTime: Date.now(),
          peers: Object.values(peers),
        },
        msg._from,
      );
      broadcastExcept(msg._from, {
        t: 'event',
        events: [{ e: 'peer-join', peer }],
      });
      // If host has already launched, immediately tell the new peer to launch
      // too — they joined the lobby late but are accepted into the running world.
      if (state.inGame) {
        transport.send({ t: 'event', events: [{ e: 'launch' }] }, msg._from);
      }
      return;
    }
    case 'chat': {
      const peer = hostSockets.get(msg._from);
      if (!peer || peer.name === '…') return;
      const text = msg.text.trim().slice(0, 240);
      if (!text) return;
      appendChat(peer.id, peer.name, text);
      broadcast({ t: 'event', events: [{ e: 'chat', from: peer.id, text }] });
      return;
    }
    case 'input': {
      const peer = hostSockets.get(msg._from);
      if (!peer || peer.name === '…') return;
      onPeerInput(peer.id, msg.pos, msg.yaw, msg.action, msg.equipped, msg.vehicleId);
      return;
    }
    case 'vehicle-enter-req': {
      const peer = hostSockets.get(msg._from);
      if (!peer || peer.name === '…') return;
      hostHandleVehicleEnter(peer.id, msg.carId);
      return;
    }
    case 'vehicle-exit-req': {
      const peer = hostSockets.get(msg._from);
      if (!peer || peer.name === '…') return;
      hostHandleVehicleExit(peer.id);
      return;
    }
    case 'fire-req': {
      const peer = hostSockets.get(msg._from);
      if (!peer || peer.name === '…') return;
      hostApplyFire(peer.id, msg.weapon, msg.origin, msg.dir, /*alreadyAppliedLocally*/ false);
      return;
    }
  }
}

function handleClientIncoming(msg: H2C & { _from: string }): void {
  switch (msg.t) {
    case 'welcome': {
      if (msg.protocol !== PROTOCOL_VERSION) {
        useNetStore.setState({
          status: 'error',
          errorMessage: `Host protocol v${msg.protocol}, ours v${PROTOCOL_VERSION}.`,
        });
        return;
      }
      const peers: Record<string, PeerInfo> = {};
      for (const p of msg.peers) peers[p.id] = p;
      if (!peers[msg.hostId]) peers[msg.hostId] = { id: msg.hostId, name: 'Host' };
      seedClock(msg.serverTime);
      useNetStore.setState({
        status: 'lobby-client',
        isHost: false,
        inGame: false,
        selfId: msg.selfId,
        hostId: msg.hostId,
        peers,
        chatLog: [],
      });
      return;
    }
    case 'reject': {
      void useNetStore.getState().disconnect();
      useNetStore.setState({ status: 'error', errorMessage: msg.reason });
      return;
    }
    case 'event': {
      for (const ev of msg.events) applyEvent(ev);
      return;
    }
    case 'snapshot': {
      const selfId = useNetStore.getState().selfId;
      applySnapshotPlayers(msg.serverTime, selfId, msg.players);
      applySnapshotVehicles(msg.serverTime, selfId, msg.vehicles);
      applySnapshotNpcs(msg.serverTime, msg.npcs, msg.npcsGone);
      // World time + weather: host is authoritative. Clients copy in.
      const gs = useGameStore.getState();
      gs.setWorldTimeSeconds(msg.worldTime);
      const w = msg.weather as 'sunny' | 'cloudy' | 'rain' | 'storm';
      if (w === 'sunny' || w === 'cloudy' || w === 'rain' || w === 'storm') {
        gs.setWeather(w);
      }
      return;
    }
  }
}

function applyEvent(ev: NetEvent): void {
  const state = useNetStore.getState();
  switch (ev.e) {
    case 'peer-join': {
      useNetStore.setState({ peers: { ...state.peers, [ev.peer.id]: ev.peer } });
      return;
    }
    case 'peer-leave': {
      const peers = { ...state.peers };
      delete peers[ev.peerId];
      useNetStore.setState({ peers });
      removeRemotePlayer(ev.peerId);
      return;
    }
    case 'chat': {
      const peer = state.peers[ev.from];
      appendChat(ev.from, peer?.name ?? '?', ev.text);
      return;
    }
    case 'launch': {
      if (state.inGame) return;
      useNetStore.setState({ status: 'in-game', inGame: true });
      startClientLoop(transport);
      return;
    }
    case 'vehicle-enter': {
      const selfId = state.selfId;
      if (ev.driverId === selfId) {
        // Host approved my entry — apply it locally now.
        useVehicleStore.getState().enterCar(ev.carId);
      } else {
        useVehicleOwnershipStore.getState().setRemoteDriver(ev.carId, ev.driverId);
      }
      return;
    }
    case 'vehicle-exit': {
      const selfId = state.selfId;
      if (ev.driverId === selfId) {
        useVehicleStore.getState().exitCar();
      } else {
        useVehicleOwnershipStore.getState().clearRemoteDriver(ev.carId);
        removeRemoteVehicle(ev.carId);
      }
      return;
    }
    case 'fire': {
      // Echo of our own shot — we already spawned the tracer locally when
      // the weapon controller fired. Skip to avoid double tracers.
      if (ev.shooterId === state.selfId) return;
      const o = new THREE.Vector3(ev.origin[0], ev.origin[1], ev.origin[2]);
      const e = new THREE.Vector3(ev.end[0], ev.end[1], ev.end[2]);
      const d = new THREE.Vector3(ev.dir[0], ev.dir[1], ev.dir[2]).normalize();
      spawnTracer(o.clone().addScaledVector(d, 0.5), e);
      return;
    }
  }
}

// ===== Host vehicle ownership =====

function hostHandleVehicleEnter(driverId: string, carId: string): void {
  // Reject if the car is already driven by someone else.
  const currentOwner = hostVehicleOwnership.get(carId);
  if (currentOwner && currentOwner !== driverId) return;
  // Reject if this driver is already in another car.
  const currentCar = hostPeerToCar.get(driverId);
  if (currentCar && currentCar !== carId) return;
  if (currentOwner === driverId) return;

  hostVehicleOwnership.set(carId, driverId);
  hostPeerToCar.set(driverId, carId);

  // Apply locally on host.
  if (driverId === HOST_ID) {
    useVehicleStore.getState().enterCar(carId);
  } else {
    useVehicleOwnershipStore.getState().setRemoteDriver(carId, driverId);
  }

  // Fan out to all peers (clients see the event and either enter locally
  // when driverId === selfId, or update remote-driver mapping).
  broadcast({ t: 'event', events: [{ e: 'vehicle-enter', carId, driverId }] });
}

function hostHandleVehicleExit(driverId: string): void {
  const carId = hostPeerToCar.get(driverId);
  if (!carId) return;
  hostPeerToCar.delete(driverId);
  hostVehicleOwnership.delete(carId);

  if (driverId === HOST_ID) {
    useVehicleStore.getState().exitCar();
  } else {
    useVehicleOwnershipStore.getState().clearRemoteDriver(carId);
    removeRemoteVehicle(carId);
  }

  broadcast({ t: 'event', events: [{ e: 'vehicle-exit', carId, driverId }] });
}

// Authoritative fire processing on host. Raycasts NPCs, applies damage,
// computes endpoint for the visible tracer, and broadcasts a fire event.
//
// `alreadyAppliedLocally` is true when the shooter is the host itself —
// in that case the host's own weapon controller already spawned the local
// tracer, so we don't double up. When a peer fires, the host hasn't seen
// the tracer yet and needs to spawn it for its own view.
function hostApplyFire(
  shooterId: string,
  weapon: string,
  origin: [number, number, number],
  dir: [number, number, number],
  alreadyAppliedLocally: boolean,
): void {
  const def = WEAPONS[weapon as WeaponId];
  if (!def) return;
  const o = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();

  const npcHit = raycastNpcs(o, d, def.range);
  let endVec: THREE.Vector3;
  if (npcHit) {
    const p = npcHit.entry.getPosition();
    endVec = p.clone().add(new THREE.Vector3(0, npcHit.entry.height / 2, 0));
    npcHit.entry.takeHit(def.damage, d.clone());
  } else {
    endVec = o.clone().addScaledVector(d, def.range);
  }

  if (!alreadyAppliedLocally) {
    // Show the peer's tracer in the host's window.
    spawnTracer(o.clone().addScaledVector(d, 0.5), endVec);
  }

  broadcast({
    t: 'event',
    events: [{
      e: 'fire',
      shooterId,
      weapon,
      origin: [o.x, o.y, o.z],
      dir: [d.x, d.y, d.z],
      end: [endVec.x, endVec.y, endVec.z],
    }],
  });
}

// Called by netStore when a peer disconnects — release any car they were in.
function hostReleasePeerVehicle(driverId: string): void {
  const carId = hostPeerToCar.get(driverId);
  if (!carId) return;
  hostPeerToCar.delete(driverId);
  hostVehicleOwnership.delete(carId);
  useVehicleOwnershipStore.getState().clearRemoteDriver(carId);
  removeRemoteVehicle(carId);
  broadcast({ t: 'event', events: [{ e: 'vehicle-exit', carId, driverId }] });
}

function appendChat(from: string, name: string, text: string): void {
  const entry: ChatEntry = { id: nextChatId(), from, name, text, at: Date.now() };
  const state = useNetStore.getState();
  const next = state.chatLog.length >= 200
    ? [...state.chatLog.slice(-199), entry]
    : [...state.chatLog, entry];
  useNetStore.setState({ chatLog: next });
}

function broadcast(message: H2C): void {
  transport.send(message);
}

function broadcastExcept(exceptSocketId: string, message: H2C): void {
  for (const socketId of hostSockets.keys()) {
    if (socketId === exceptSocketId) continue;
    transport.send(message, socketId);
  }
}

function friendlyError(code: string): string {
  switch (code) {
    case 'EADDRINUSE': return `Port ${useNetStore.getState().port} is already in use. Try another.`;
    case 'EACCES': return 'Permission denied. Try a port above 1024.';
    case 'ECONNREFUSED': return 'Connection refused. Check the host address and port.';
    case 'ETIMEDOUT': return 'Connection timed out. Is the host online and reachable?';
    case 'connection-closed': return 'Could not connect. Is the host online?';
    case 'already-hosting': return 'This window is already hosting a game.';
    case 'already-joined-as-client': return 'This window is already in a session.';
    case 'already-connected': return 'Already connected.';
    default: return code;
  }
}
