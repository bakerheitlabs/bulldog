// Zustand store of who's currently driving which car across the network.
// Distinct from useVehicleStore.drivenCarId, which is the LOCAL driver flag —
// remoteDrivers tracks PEER drivers so React-rendering components (Car.tsx)
// can switch a vehicle into "remotely driven, follow snapshot pose" mode.
//
// Host owns the truth: it processes vehicle-enter-req / vehicle-exit-req,
// validates them against this map, and broadcasts vehicle-enter/exit events
// that update this map on every client.

import { create } from 'zustand';

interface VehicleOwnershipState {
  // carId -> peerId of the driver. The local player's own car is NOT in this
  // map (their drivenCarId in useVehicleStore covers that).
  remoteDrivers: Record<string, string>;

  setRemoteDriver(carId: string, driverId: string): void;
  clearRemoteDriver(carId: string): void;
  clearAll(): void;
}

export const useVehicleOwnershipStore = create<VehicleOwnershipState>((set) => ({
  remoteDrivers: {},

  setRemoteDriver(carId, driverId) {
    set((s) => ({ remoteDrivers: { ...s.remoteDrivers, [carId]: driverId } }));
  },
  clearRemoteDriver(carId) {
    set((s) => {
      if (!(carId in s.remoteDrivers)) return {};
      const next = { ...s.remoteDrivers };
      delete next[carId];
      return { remoteDrivers: next };
    });
  },
  clearAll() {
    set({ remoteDrivers: {} });
  },
}));
