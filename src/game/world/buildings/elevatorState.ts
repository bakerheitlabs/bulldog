// Module-level elevator transition state. The lobby and suite sensors call
// `startElevator(...)`; ElevatorTransition.tsx subscribes to drive the fade
// + teleport. Mirrors the pattern in `interactionState.ts` — no zustand
// store because the only consumers are the overlay + GameRoute pause flag,
// and re-renders need to be tightly scoped.

type Listener = () => void;

export type ElevatorTransition = {
  targetPos: [number, number, number];
  label: string;
};

let pending: ElevatorTransition | null = null;
const listeners = new Set<Listener>();

export function startElevator(t: ElevatorTransition): boolean {
  // Drop the request if a transition is already running — sensors fire
  // every frame the player overlaps, but we only want one ride per entry.
  if (pending) return false;
  pending = t;
  listeners.forEach((l) => l());
  return true;
}

export function endElevator() {
  if (!pending) return;
  pending = null;
  listeners.forEach((l) => l());
}

export function getElevator(): ElevatorTransition | null {
  return pending;
}

export function isElevatorActive(): boolean {
  return pending !== null;
}

export function subscribeElevator(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
