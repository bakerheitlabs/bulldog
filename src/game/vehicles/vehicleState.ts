import { create } from 'zustand';
import * as THREE from 'three';

type VehicleState = {
  drivenCarId: string | null;
  carColors: Record<string, string>;
  carDamage: Record<string, number>;
  enterCar: (id: string) => void;
  exitCar: () => void;
  setCarColor: (id: string, color: string) => void;
  damageCarBy: (id: string, amount: number) => void;
  resetCarDamage: (id: string) => void;
};

export const useVehicleStore = create<VehicleState>((set) => ({
  drivenCarId: null,
  carColors: {},
  carDamage: {},
  enterCar: (id) => set({ drivenCarId: id }),
  exitCar: () => set({ drivenCarId: null }),
  setCarColor: (id, color) =>
    set((s) => ({ carColors: { ...s.carColors, [id]: color } })),
  damageCarBy: (id, amount) =>
    set((s) => {
      const cur = s.carDamage[id] ?? 0;
      const next = Math.max(0, Math.min(100, cur + amount));
      if (next === cur) return {};
      return { carDamage: { ...s.carDamage, [id]: next } };
    }),
  resetCarDamage: (id) =>
    set((s) => {
      if (!(id in s.carDamage)) return {};
      const rest = { ...s.carDamage };
      delete rest[id];
      return { carDamage: rest };
    }),
}));

// Module-level position mirror for the currently driven car. DrivableCar writes
// here every frame while driven; ThirdPersonCamera + Player read without
// re-rendering React.
const _drivenPos = new THREE.Vector3();
let _hasDrivenPos = false;
let _drivenYaw = 0;

export function writeDrivenCarPose(pos: THREE.Vector3, yaw: number) {
  _drivenPos.copy(pos);
  _drivenYaw = yaw;
  _hasDrivenPos = true;
}

export function clearDrivenCarPose() {
  _hasDrivenPos = false;
}

export function readDrivenCarPos(): THREE.Vector3 | null {
  return _hasDrivenPos ? _drivenPos : null;
}

export function readDrivenCarYaw(): number {
  return _drivenYaw;
}
