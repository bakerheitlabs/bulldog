import { WebSocket } from 'ws';

export type ClientEvent =
  | { type: 'recv'; from: 'host'; data: string }
  | { type: 'host-down' }
  | { type: 'transport-error'; message: string };

export type EventListener = (event: ClientEvent) => void;

const CONNECT_TIMEOUT_MS = 5000;

export class JoinClient {
  private socket: WebSocket | null = null;
  private listener: EventListener | null = null;

  connect(host: string, port: number): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      if (this.socket) return resolve({ ok: false, error: 'already-connected' });

      const url = `ws://${host}:${port}`;
      const sock = new WebSocket(url, { handshakeTimeout: CONNECT_TIMEOUT_MS });
      let settled = false;

      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        try { sock.close(); } catch { /* ignore */ }
        this.socket = null;
        resolve({ ok: false, error: msg });
      };

      sock.on('open', () => {
        if (settled) return;
        settled = true;
        this.socket = sock;
        resolve({ ok: true });
      });
      sock.on('error', (err) => fail((err as Error).message));
      sock.on('message', (raw) => {
        const data = typeof raw === 'string' ? raw : raw.toString('utf8');
        this.listener?.({ type: 'recv', from: 'host', data });
      });
      sock.on('close', () => {
        if (!settled) return fail('connection-closed');
        if (this.socket === sock) {
          this.socket = null;
          this.listener?.({ type: 'host-down' });
        }
      });
    });
  }

  send(data: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  setListener(fn: EventListener | null): void {
    this.listener = fn;
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      const sock = this.socket;
      this.socket = null;
      if (!sock) return resolve();
      sock.once('close', () => resolve());
      try { sock.close(); } catch { resolve(); }
    });
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}
