// Thin JSON encode/decode layer over the IPC transport. Owns the single
// `mp:event` subscription and routes parsed messages back through callbacks.

import { mpIpc, type MpTransportEvent } from './ipc';
import type { C2H, H2C } from './protocol';

type IncomingMessage = (C2H | H2C) & { _from: string };

export interface TransportHandlers {
  onIncoming(msg: IncomingMessage): void;
  onPeerJoin?(peerId: string): void;
  onPeerLeave?(peerId: string): void;
  onHostDown?(): void;
  onTransportError?(message: string): void;
}

export class Transport {
  private unsub: (() => void) | null = null;

  attach(handlers: TransportHandlers): void {
    if (this.unsub) this.unsub();
    this.unsub = mpIpc.onEvent((event: MpTransportEvent) => {
      switch (event.type) {
        case 'recv': {
          let parsed: C2H | H2C;
          try {
            parsed = JSON.parse(event.data) as C2H | H2C;
          } catch {
            return;
          }
          handlers.onIncoming({ ...parsed, _from: event.from });
          return;
        }
        case 'peer-join':
          handlers.onPeerJoin?.(event.peerId);
          return;
        case 'peer-leave':
          handlers.onPeerLeave?.(event.peerId);
          return;
        case 'host-down':
          handlers.onHostDown?.();
          return;
        case 'transport-error':
          handlers.onTransportError?.(event.message);
          return;
      }
    });
  }

  detach(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
  }

  send(message: C2H | H2C, to?: string): void {
    void mpIpc.send(JSON.stringify(message), to);
  }
}
