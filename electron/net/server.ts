import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

export type ServerEvent =
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }
  | { type: 'recv'; from: string; data: string }
  | { type: 'transport-error'; message: string };

export type EventListener = (event: ServerEvent) => void;

export class HostServer {
  private wss: WebSocketServer | null = null;
  private sockets = new Map<string, WebSocket>();
  private listener: EventListener | null = null;

  start(port: number): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      if (this.wss) return resolve({ ok: false, error: 'already-hosting' });
      const wss = new WebSocketServer({ port, host: '0.0.0.0' });

      wss.on('listening', () => {
        this.wss = wss;
        resolve({ ok: true });
      });
      wss.on('error', (err: NodeJS.ErrnoException) => {
        if (!this.wss) {
          // Error before listening — fail the start.
          resolve({ ok: false, error: err.code ?? err.message });
        } else {
          this.listener?.({ type: 'transport-error', message: err.message });
        }
      });
      wss.on('connection', (socket) => this.handleSocket(socket));
    });
  }

  private handleSocket(socket: WebSocket): void {
    const peerId = randomUUID();
    this.sockets.set(peerId, socket);
    this.listener?.({ type: 'peer-join', peerId });

    socket.on('message', (raw) => {
      const data = typeof raw === 'string' ? raw : raw.toString('utf8');
      this.listener?.({ type: 'recv', from: peerId, data });
    });
    socket.on('close', () => {
      this.sockets.delete(peerId);
      this.listener?.({ type: 'peer-leave', peerId });
    });
    socket.on('error', () => {
      // Surfaces as close immediately after; nothing extra to do.
    });
  }

  send(to: string | undefined, data: string): void {
    if (to) {
      const sock = this.sockets.get(to);
      if (sock && sock.readyState === WebSocket.OPEN) sock.send(data);
      return;
    }
    for (const sock of this.sockets.values()) {
      if (sock.readyState === WebSocket.OPEN) sock.send(data);
    }
  }

  setListener(fn: EventListener | null): void {
    this.listener = fn;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) return resolve();
      const wss = this.wss;
      this.wss = null;
      for (const sock of this.sockets.values()) {
        try { sock.close(); } catch { /* ignore */ }
      }
      this.sockets.clear();
      wss.close(() => resolve());
    });
  }

  isRunning(): boolean {
    return this.wss !== null;
  }
}
