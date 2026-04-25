import { create } from 'zustand';

// Debug AI car spawned via the dev console (`traffic spawn N`). Each is a
// regular DrivenCar with `debug=true`, started at an explicit waypoint near
// the player so we can watch and log its path.
export type DebugCar = {
  // Stable per-instance key — both React key and used to derive the in-world
  // id (`debug_car_<key>`).
  key: number;
  // Spawn waypoint id (LANE_WAYPOINTS).
  startId: string;
};

type Store = {
  cars: DebugCar[];
  spawn: (startId: string) => void;
  clear: () => void;
};

let nextKey = 1;

export const useDebugTrafficStore = create<Store>((set) => ({
  cars: [],
  spawn: (startId) =>
    set((s) => ({ cars: [...s.cars, { key: nextKey++, startId }] })),
  clear: () => set({ cars: [] }),
}));
