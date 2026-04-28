import { create } from 'zustand';
import type { VehicleIdentityKey } from './vehicleIdentity';

// Vehicles spawned via the dev console (`spawn <name>`). Rendered by
// SpawnedVehicles as plain drivable cars with no AI or parking-slot logic.
export type SpawnedVehicle = {
  key: number;
  variant: VehicleIdentityKey;
  pos: [number, number, number];
  rotY: number;
};

type Store = {
  vehicles: SpawnedVehicle[];
  spawn: (variant: VehicleIdentityKey, pos: [number, number, number], rotY: number) => void;
  clear: () => void;
};

let nextKey = 1;

export const useSpawnedVehiclesStore = create<Store>((set) => ({
  vehicles: [],
  spawn: (variant, pos, rotY) =>
    set((s) => ({
      vehicles: [...s.vehicles, { key: nextKey++, variant, pos, rotY }],
    })),
  clear: () => set({ vehicles: [] }),
}));
