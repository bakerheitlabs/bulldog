// Typed wrapper around window.bulldogMP exposed by the Electron preload script.
// In a plain browser context, window.bulldogMP is undefined and `isAvailable()`
// returns false. Multiplayer UI gates on this.

export interface NetworkInfo {
  lanIps: string[];
  wanIp: string | null;
  defaultPort: number;
}

export type StartResult = { ok: true } | { ok: false; error: string };

export type MpTransportEvent =
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }
  | { type: 'recv'; from: string; data: string }
  | { type: 'host-down' }
  | { type: 'transport-error'; message: string };

interface BulldogMP {
  available: true;
  getNetworkInfo(): Promise<NetworkInfo>;
  hostStart(port: number): Promise<StartResult>;
  hostStop(): Promise<void>;
  join(host: string, port: number): Promise<StartResult>;
  disconnect(): Promise<void>;
  send(data: string, to?: string): Promise<void>;
  onEvent(cb: (event: MpTransportEvent) => void): () => void;
}

declare global {
  interface Window {
    bulldogMP?: BulldogMP;
  }
}

export function isAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.bulldogMP?.available;
}

function api(): BulldogMP {
  const a = window.bulldogMP;
  if (!a) throw new Error('Multiplayer requires the desktop app (Electron).');
  return a;
}

export const mpIpc = {
  isAvailable,
  getNetworkInfo: () => api().getNetworkInfo(),
  hostStart: (port: number) => api().hostStart(port),
  hostStop: () => api().hostStop(),
  join: (host: string, port: number) => api().join(host, port),
  disconnect: () => api().disconnect(),
  send: (data: string, to?: string) => api().send(data, to),
  onEvent: (cb: (event: MpTransportEvent) => void) => api().onEvent(cb),
};
