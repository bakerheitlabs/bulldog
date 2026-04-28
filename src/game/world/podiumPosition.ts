// Module-level singleton for the church pulpit's exact world position.
// Church.tsx publishes here once it has the GLB-scaled bounding box; the
// ChurchPodium interaction reads it every frame to drive the "Press E to
// read" prompt. Cleared when the church unmounts (chunk eviction).

export type PodiumPos = { x: number; z: number };

let pos: PodiumPos | null = null;

export function setPodiumPosition(p: PodiumPos | null) {
  pos = p;
}

export function getPodiumPosition(): PodiumPos | null {
  return pos;
}
