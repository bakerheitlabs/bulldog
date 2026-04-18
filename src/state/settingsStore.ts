import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Settings = {
  mouseSensitivity: number;
  fov: number;
  masterVolume: number;
  setMouseSensitivity: (n: number) => void;
  setFov: (n: number) => void;
  setMasterVolume: (n: number) => void;
};

export const useSettingsStore = create<Settings>()(
  persist(
    (set) => ({
      mouseSensitivity: 1.0,
      fov: 70,
      masterVolume: 0.7,
      setMouseSensitivity: (n) => set({ mouseSensitivity: n }),
      setFov: (n) => set({ fov: n }),
      setMasterVolume: (n) => set({ masterVolume: n }),
    }),
    { name: 'bulldog.settings' },
  ),
);
