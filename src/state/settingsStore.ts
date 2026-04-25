import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SpeedUnit = 'mph' | 'kph';

type Settings = {
  mouseSensitivity: number;
  fov: number;
  masterVolume: number;
  speedUnit: SpeedUnit;
  setMouseSensitivity: (n: number) => void;
  setFov: (n: number) => void;
  setMasterVolume: (n: number) => void;
  setSpeedUnit: (u: SpeedUnit) => void;
};

export const useSettingsStore = create<Settings>()(
  persist(
    (set) => ({
      mouseSensitivity: 1.0,
      fov: 70,
      masterVolume: 0.7,
      speedUnit: 'mph',
      setMouseSensitivity: (n) => set({ mouseSensitivity: n }),
      setFov: (n) => set({ fov: n }),
      setMasterVolume: (n) => set({ masterVolume: n }),
      setSpeedUnit: (u) => set({ speedUnit: u }),
    }),
    { name: 'bulldog.settings' },
  ),
);
