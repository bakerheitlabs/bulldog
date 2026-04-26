import { create } from 'zustand';
import * as THREE from 'three';

// Transient "you entered a Brand Model" banner. The `at` timestamp is what
// the HUD subscribes to: re-entering the same car still produces a fresh
// reference so the banner re-shows.
export type EnteredBanner = { brand: string; model: string; at: number };

type VehicleState = {
  drivenCarId: string | null;
  // Cars and planes use the same enter/exit ergonomics (E key, single-vehicle
  // restriction) but their physics/HUD diverge. They live in the same store
  // so mutual exclusion (entering a plane auto-exits the car, and vice versa)
  // can be expressed as a single setter without cross-store coordination.
  drivenPlaneId: string | null;
  carColors: Record<string, string>;
  carDamage: Record<string, number>;
  // Per-vehicle police-siren on/off. Drives flashing lights (always) and the
  // siren tone (only for the player-driven cruiser — AI cruisers stay silent
  // to avoid an always-on chorus when multiple are pursuing).
  sirenActive: Record<string, boolean>;
  lastEnteredBanner: EnteredBanner | null;
  enterCar: (id: string) => void;
  exitCar: () => void;
  enterPlane: (id: string) => void;
  exitPlane: () => void;
  setCarColor: (id: string, color: string) => void;
  damageCarBy: (id: string, amount: number) => void;
  resetCarDamage: (id: string) => void;
  toggleSiren: (id: string) => void;
  setSiren: (id: string, on: boolean) => void;
  showVehicleEntered: (brand: string, model: string) => void;
};

export const useVehicleStore = create<VehicleState>((set) => ({
  drivenCarId: null,
  drivenPlaneId: null,
  carColors: {},
  carDamage: {},
  sirenActive: {},
  lastEnteredBanner: null,
  enterCar: (id) => set({ drivenCarId: id, drivenPlaneId: null }),
  exitCar: () => set({ drivenCarId: null }),
  enterPlane: (id) => set({ drivenPlaneId: id, drivenCarId: null }),
  exitPlane: () => set({ drivenPlaneId: null }),
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
  toggleSiren: (id) =>
    set((s) => ({
      sirenActive: { ...s.sirenActive, [id]: !s.sirenActive[id] },
    })),
  setSiren: (id, on) =>
    set((s) => {
      if (!!s.sirenActive[id] === on) return {};
      return { sirenActive: { ...s.sirenActive, [id]: on } };
    }),
  showVehicleEntered: (brand, model) =>
    set({ lastEnteredBanner: { brand, model, at: Date.now() } }),
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

// Module-level pose mirror for the currently flown airplane. Planes have an
// extra two angular DOFs (pitch + roll) on top of yaw, so we keep a separate
// mirror rather than overloading the car one.
const _drivenPlanePos = new THREE.Vector3();
let _hasDrivenPlanePos = false;
let _drivenPlaneYaw = 0;
let _drivenPlanePitch = 0;
let _drivenPlaneRoll = 0;

export function writeDrivenPlanePose(
  pos: THREE.Vector3,
  yaw: number,
  pitch: number,
  roll: number,
) {
  _drivenPlanePos.copy(pos);
  _drivenPlaneYaw = yaw;
  _drivenPlanePitch = pitch;
  _drivenPlaneRoll = roll;
  _hasDrivenPlanePos = true;
}

export function clearDrivenPlanePose() {
  _hasDrivenPlanePos = false;
}

export function readDrivenPlanePos(): THREE.Vector3 | null {
  return _hasDrivenPlanePos ? _drivenPlanePos : null;
}

export function readDrivenPlaneYaw(): number {
  return _drivenPlaneYaw;
}

export function readDrivenPlanePitch(): number {
  return _drivenPlanePitch;
}

export function readDrivenPlaneRoll(): number {
  return _drivenPlaneRoll;
}
