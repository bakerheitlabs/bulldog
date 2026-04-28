// Module-level registry of axis-aligned interior regions where the player
// counts as "indoors" — used so weather visuals (rain, snow, …) can hide when
// the camera is sheltered while audio continues to play. Buildings register
// their interior bounds on mount and unregister on unmount/chunk eviction.

export type ShelterRegion = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
};

const regions = new Map<string, ShelterRegion>();

export function registerShelter(id: string, region: ShelterRegion) {
  regions.set(id, region);
}

export function unregisterShelter(id: string) {
  regions.delete(id);
}

export function isPointSheltered(x: number, y: number, z: number): boolean {
  for (const r of regions.values()) {
    if (
      x >= r.minX &&
      x <= r.maxX &&
      z >= r.minZ &&
      z <= r.maxZ &&
      y >= r.minY &&
      y <= r.maxY
    ) {
      return true;
    }
  }
  return false;
}
