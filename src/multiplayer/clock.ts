// Tracks an estimated server-time offset so client interpolation can request
// poses at "host time minus 100ms". For Phase 2 we use a single seed from the
// welcome message; ping/pong refinement is deferred until WAN play exposes the
// jitter.

let serverTimeOffsetMs = 0;

export function seedClock(serverTime: number): void {
  serverTimeOffsetMs = serverTime - Date.now();
}

export function serverNow(): number {
  return Date.now() + serverTimeOffsetMs;
}

export function resetClock(): void {
  serverTimeOffsetMs = 0;
}
