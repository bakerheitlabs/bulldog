import type { EngineProfile } from '@/game/audio/synth';
import type { ModelKey } from '@/game/world/cityAssets';

export const CAR_VARIANTS = [
  'carSedan',
  'carSedanSports',
  'carHatchbackSports',
  'carSportsCoupe',
  'carSuv',
  'carSuvLuxury',
  'carTaxi',
  'carVan',
] as const satisfies readonly ModelKey[];

export type CarVariant = (typeof CAR_VARIANTS)[number];

export function pickCarVariantBySeed(seed: number): CarVariant {
  const idx = Math.abs(Math.floor(seed)) % CAR_VARIANTS.length;
  return CAR_VARIANTS[idx];
}

// Fictional brand + model name + per-engine tuning per variant. Modeled
// after GTA's brand-naming style — none of these names are real-world.
// `carPolice` is included even though it's not in CAR_VARIANTS (police
// cruisers spawn with a hard-coded variant — see PoliceCruiser.tsx).
export type VehicleIdentity = {
  brand: string;
  model: string;
  engine: EngineProfile;
  // Top speed in world units / second when fully throttled. Drives both the
  // player-driver clamp and the engine-audio RPM normalization, so a faster
  // car feels louder *and* climbs further before redlining.
  topSpeed: number;
};

export type VehicleIdentityKey = CarVariant | 'carPolice';

export const VEHICLE_IDENTITY: Record<VehicleIdentityKey, VehicleIdentity> = {
  carSedan: {
    brand: 'Vapid',
    model: 'Stratum',
    topSpeed: 22,
    engine: {
      bassFreq: 38,
      rpmRange: 0.9,
      masterIdle: 0.07,
      masterPeak: 0.10,
      highGainMax: 0.22,
      noiseGainMax: 0.18,
      filterBaseHz: 380,
      filterOpenRange: 1300,
      filterQPeak: 1.4,
      lfoBaseHz: 9,
      lfoSpeedRange: 16,
      lfoDepth: 0.22,
    },
  },
  carSedanSports: {
    brand: 'Bravado',
    model: 'Razor',
    topSpeed: 32,
    engine: {
      bassFreq: 34,
      rpmRange: 1.2,
      masterIdle: 0.08,
      masterPeak: 0.13,
      highGainMax: 0.30,
      noiseGainMax: 0.22,
      filterBaseHz: 420,
      filterOpenRange: 1600,
      filterQPeak: 1.7,
      lfoBaseHz: 10,
      lfoSpeedRange: 18,
      lfoDepth: 0.28,
    },
  },
  carHatchbackSports: {
    brand: 'Dinka',
    model: 'Asco',
    topSpeed: 40,
    engine: {
      bassFreq: 80,
      rpmRange: 1.9,
      masterIdle: 0.07,
      masterPeak: 0.14,
      highGainMax: 0.32,
      noiseGainMax: 0.16,
      filterBaseHz: 460,
      filterOpenRange: 1500,
      filterQPeak: 1.5,
      lfoBaseHz: 12,
      lfoSpeedRange: 20,
      lfoDepth: 0.22,
    },
  },
  carSportsCoupe: {
    brand: 'Apex',
    model: 'Rush',
    topSpeed: 36,
    engine: {
      bassFreq: 36,
      rpmRange: 1.55,
      masterIdle: 0.08,
      masterPeak: 0.16,
      highGainMax: 0.36,
      noiseGainMax: 0.20,
      filterBaseHz: 480,
      filterOpenRange: 1800,
      filterQPeak: 1.9,
      lfoBaseHz: 11,
      lfoSpeedRange: 22,
      lfoDepth: 0.30,
    },
  },
  carSuv: {
    brand: 'Karin',
    model: 'Pathway',
    topSpeed: 22,
    engine: {
      bassFreq: 32,
      rpmRange: 0.7,
      masterIdle: 0.08,
      masterPeak: 0.10,
      highGainMax: 0.18,
      noiseGainMax: 0.20,
      filterBaseHz: 350,
      filterOpenRange: 1100,
      filterQPeak: 1.2,
      lfoBaseHz: 7,
      lfoSpeedRange: 12,
      lfoDepth: 0.20,
    },
  },
  carSuvLuxury: {
    brand: 'Übermacht',
    model: 'Veneer',
    topSpeed: 25,
    engine: {
      bassFreq: 30,
      rpmRange: 0.85,
      masterIdle: 0.05,
      masterPeak: 0.08,
      highGainMax: 0.16,
      noiseGainMax: 0.10,
      filterBaseHz: 320,
      filterOpenRange: 1000,
      filterQPeak: 1.0,
      lfoBaseHz: 8,
      lfoSpeedRange: 14,
      lfoDepth: 0.16,
    },
  },
  carTaxi: {
    brand: 'Vapid',
    model: 'Cabbie',
    topSpeed: 23,
    engine: {
      bassFreq: 41,
      rpmRange: 0.85,
      masterIdle: 0.09,
      masterPeak: 0.10,
      highGainMax: 0.22,
      noiseGainMax: 0.26,
      filterBaseHz: 360,
      filterOpenRange: 1200,
      filterQPeak: 1.5,
      lfoBaseHz: 10,
      lfoSpeedRange: 14,
      lfoDepth: 0.24,
    },
  },
  carVan: {
    brand: 'Bravado',
    model: 'Hauler',
    topSpeed: 18,
    engine: {
      bassFreq: 29,
      rpmRange: 0.6,
      masterIdle: 0.08,
      masterPeak: 0.10,
      highGainMax: 0.14,
      noiseGainMax: 0.22,
      filterBaseHz: 320,
      filterOpenRange: 950,
      filterQPeak: 1.1,
      lfoBaseHz: 6,
      lfoSpeedRange: 10,
      lfoDepth: 0.20,
    },
  },
  carPolice: {
    brand: 'Floord',
    model: 'Enforcer',
    topSpeed: 40,
    engine: {
      bassFreq: 90,
      rpmRange: 1.3,
      masterIdle: 0.09,
      masterPeak: 0.15,
      highGainMax: 0.28,
      noiseGainMax: 0.24,
      filterBaseHz: 400,
      filterOpenRange: 1700,
      filterQPeak: 1.8,
      lfoBaseHz: 8,
      lfoSpeedRange: 18,
      lfoDepth: 0.30,
    },
  },
};
