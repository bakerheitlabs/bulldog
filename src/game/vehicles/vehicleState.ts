import { create } from 'zustand';
import * as THREE from 'three';

type VehicleState = {
  drivenCarId: string | null;
  enterCar: (id: string) => void;
  exitCar: () => void;
};

export const useVehicleStore = create<VehicleState>((set) => ({
  drivenCarId: null,
  enterCar: (id) => set({ drivenCarId: id }),
  exitCar: () => set({ drivenCarId: null }),
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
