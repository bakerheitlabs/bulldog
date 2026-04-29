import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type StartResult = { ok: true } | { ok: false; error: string };

interface NetworkInfo {
  lanIps: string[];
  wanIp: string | null;
  defaultPort: number;
}

type MpEvent =
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }
  | { type: 'recv'; from: string; data: string }
  | { type: 'host-down' }
  | { type: 'transport-error'; message: string };

const api = {
  available: true,
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:open-external', url),
  getNetworkInfo: (): Promise<NetworkInfo> => ipcRenderer.invoke('mp:get-network-info'),
  hostStart: (port: number): Promise<StartResult> =>
    ipcRenderer.invoke('mp:host-start', { port }),
  hostStop: (): Promise<void> => ipcRenderer.invoke('mp:host-stop'),
  join: (host: string, port: number): Promise<StartResult> =>
    ipcRenderer.invoke('mp:join', { host, port }),
  disconnect: (): Promise<void> => ipcRenderer.invoke('mp:disconnect'),
  send: (data: string, to?: string): Promise<void> =>
    ipcRenderer.invoke('mp:send', { to, data }),
  onEvent: (cb: (event: MpEvent) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: MpEvent) => cb(payload);
    ipcRenderer.on('mp:event', listener);
    return () => ipcRenderer.removeListener('mp:event', listener);
  },
};

contextBridge.exposeInMainWorld('bulldogMP', api);
