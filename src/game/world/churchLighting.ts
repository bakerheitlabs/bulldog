import { create } from 'zustand';

// Brightness multiplier for the church interior lights (point fill + sconces).
// Lives in a tiny store so the lightswitch popup can dim every relevant light
// in one write and the lights re-render via subscription. The fixture's own
// emissive glow scales with the same factor so a dim sconce stops looking
// hot. Candles are emissive flames (independent of building wiring) and are
// intentionally NOT scaled here.
type ChurchLightingStore = {
  dimmer: number;
  setDimmer: (v: number) => void;
};

export const useChurchLightingStore = create<ChurchLightingStore>((set) => ({
  dimmer: 1,
  setDimmer: (v) => set({ dimmer: Math.max(0, Math.min(1, v)) }),
}));

// Module-level position of the wall-mounted lightswitch, mirroring the
// podiumPosition pattern. Church.tsx publishes once it has scaled bounds so
// ChurchLightSwitch.tsx can drive the "Press E" prompt without coupling to
// React rendering order.
export type LightSwitchPos = { x: number; y: number; z: number };

let switchPos: LightSwitchPos | null = null;

export function setLightSwitchPosition(p: LightSwitchPos | null) {
  switchPos = p;
}

export function getLightSwitchPosition(): LightSwitchPos | null {
  return switchPos;
}
