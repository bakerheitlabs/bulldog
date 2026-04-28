// Wire protocol shared between host and client. Phase 1 covers handshake +
// chat. Phase 2 adds input + snapshot for player pose replication and a
// `launch` event that transitions everyone from lobby to game world.
// Phase 3 adds vehicle entry/exit events + per-vehicle pose in snapshots.
// Phase 4 adds NPC pose sync (pedestrians + cops). Host runs AI; clients
// render visual-only from snapshots.
// Phase 5 adds shooting events. Clients send fire-req; host raycasts NPCs
// authoritatively and broadcasts a fire event so other clients render the
// tracer. Targets stay client-local for the range.
// Phase 6 adds world date (year/month/day) to snapshots so clients render
// the same in-game date as the host.
// Phase 7 adds stock prices so clients see the host-authoritative market.

export const PROTOCOL_VERSION = 7;

export interface PeerInfo {
  id: string;
  name: string;
}

export type Vec3 = [number, number, number];

// Animation state mirrors CharacterModel's action enum. Encoded as a small
// integer to keep snapshots compact (we send these many times per second).
export const ACTIONS = [
  'idle',
  'walk',
  'sprint',
  'die',
  'drive',
  'holding-right',
  'holding-right-shoot',
  'armed-walk',
  'armed-sprint',
] as const;
export type ActionId = number; // index into ACTIONS

// Equipped weapon slot. Null = unarmed. Encoded as a small int for the same
// reason as ACTIONS.
export const EQUIPPED = ['handgun', 'shotgun', 'smg'] as const;
export type EquippedId = number | -1; // -1 = unarmed

export interface PlayerSample {
  id: string;
  pos: Vec3;
  yaw: number;
  action: ActionId;
  equipped: EquippedId;
  // Set when the player is occupying a vehicle. Renderers hide the avatar
  // mesh and instead render that vehicle following the same pose.
  vehicleId?: string;
}

export interface VehicleSample {
  id: string;
  driverId: string;
  pos: Vec3;
  yaw: number;
}

// kind: 0 = pedestrian, 1 = cop. Cops always render with characterMaleC and
// equip a pistol; peds use variantIdx into PEDESTRIAN_VARIANTS unarmed.
export type NpcKindId = number;
export const NPC_KIND_PED = 0;
export const NPC_KIND_COP = 1;

export interface NpcSample {
  id: string;
  kind: NpcKindId;
  variantIdx: number;
  pos: Vec3;
  yaw: number;
  hp: number;
  action: ActionId;
}

// Client -> Host
export type C2H =
  | { t: 'hello'; protocol: number; name: string; clientTime: number }
  | { t: 'chat'; text: string }
  | {
      t: 'input';
      seq: number;
      clientTime: number;
      pos: Vec3;
      yaw: number;
      action: ActionId;
      equipped: EquippedId;
      vehicleId?: string;
    }
  | { t: 'vehicle-enter-req'; carId: string }
  | { t: 'vehicle-exit-req' }
  | {
      t: 'fire-req';
      clientTime: number;
      weapon: string; // WeaponId
      origin: Vec3;
      dir: Vec3;
    };

// Host -> Client
export type H2C =
  | {
      t: 'welcome';
      protocol: number;
      selfId: string;
      hostId: string;
      serverTime: number;
      peers: PeerInfo[];
    }
  | { t: 'reject'; reason: string }
  | { t: 'event'; events: NetEvent[] }
  | {
      t: 'snapshot';
      serverTime: number;
      tick: number;
      players: PlayerSample[];
      vehicles: VehicleSample[];
      npcs: NpcSample[];
      // IDs of NPCs that have been removed since the last snapshot. Lets
      // clients drop them from their renderer immediately rather than waiting
      // for an interp timeout.
      npcsGone: string[];
      // World time-of-day in seconds (0..86400). Host's authoritative clock.
      worldTime: number;
      // In-world Gregorian date. Host advances this when seconds wrap past
      // midnight; clients copy it in (they don't tick world time themselves).
      worldDate: { y: number; m: number; d: number };
      // Weather type ('sunny' | 'cloudy' | 'rain' | 'storm').
      weather: string;
      // Current stock prices keyed by symbol. Clients maintain history
      // locally from observed price changes; host owns the simulation.
      stockPrices: Record<string, number>;
    };

export type NetEvent =
  | { e: 'peer-join'; peer: PeerInfo }
  | { e: 'peer-leave'; peerId: string }
  | { e: 'chat'; from: string; text: string }
  | { e: 'launch' }
  | { e: 'vehicle-enter'; carId: string; driverId: string }
  | { e: 'vehicle-exit'; carId: string; driverId: string }
  | {
      e: 'fire';
      shooterId: string;
      weapon: string;
      origin: Vec3;
      dir: Vec3;
      // End point for the visible tracer. Host computes this from the
      // resolved hit (NPC at hit-height, target top, or origin + range).
      end: Vec3;
    };

export const HOST_ID = 'host';

export function actionToId(action: string): ActionId {
  const idx = (ACTIONS as readonly string[]).indexOf(action);
  return idx >= 0 ? idx : 0;
}

export function actionFromId(id: ActionId): (typeof ACTIONS)[number] {
  return ACTIONS[id] ?? 'idle';
}

export function equippedToId(equipped: string | null | undefined): EquippedId {
  if (!equipped) return -1;
  const idx = (EQUIPPED as readonly string[]).indexOf(equipped);
  return idx >= 0 ? idx : -1;
}

export function equippedFromId(id: EquippedId): (typeof EQUIPPED)[number] | null {
  if (id < 0) return null;
  return EQUIPPED[id] ?? null;
}
