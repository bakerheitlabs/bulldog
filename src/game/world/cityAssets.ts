import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EngineProfile } from '@/game/audio/synth';

// NOTE: Kenney GLBs reference an external `Textures/colormap.png` relative to
// the GLB's location. Each kit has its own colormap, so the building and car
// GLBs live in separate subfolders with their own Textures/ sibling — don't
// flatten this structure or the models will lose their colors and render gray.
export const MODEL_PATHS = {
  buildingGeneric: '/models/city/building_generic.glb',
  buildingGunstore: '/models/city/building_gunstore.glb',
  trafficLight: '/models/city/Traffic Light.glb',
  carSedan: '/models/cars/car_sedan.glb',
  carSedanSports: '/models/cars/car_sedan_sports.glb',
  carHatchbackSports: '/models/cars/car_hatchback_sports.glb',
  carSportsCoupe: '/models/cars/car_apex_rush.glb',
  carSuv: '/models/cars/car_suv.glb',
  carSuvLuxury: '/models/cars/car_suv_luxury.glb',
  carTaxi: '/models/cars/car_taxi.glb',
  carVan: '/models/cars/car_van.glb',
  carPolice: '/models/cars/Police Car.glb',
  characterMaleA: '/models/characters/character_male_a.glb',
  characterMaleC: '/models/characters/character_male_c.glb',
  characterMaleD: '/models/characters/character_male_d.glb',
  characterMaleE: '/models/characters/character_male_e.glb',
  characterMaleF: '/models/characters/character_male_f.glb',
  characterFemaleA: '/models/characters/character_female_a.glb',
  characterFemaleC: '/models/characters/character_female_c.glb',
  characterFemaleD: '/models/characters/character_female_d.glb',
  characterFemaleE: '/models/characters/character_female_e.glb',
  characterFemaleF: '/models/characters/character_female_f.glb',
  weaponPistol: '/models/weapons/Pistol.glb',
  weaponSmg: '/models/weapons/Submachine Gun.glb',
  airplane1: '/models/airplanes/airplane_1.glb',
} as const;

export type ModelKey = keyof typeof MODEL_PATHS;

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
    topSpeed: 29,
    engine: {
      bassFreq: 49,
      rpmRange: 1.4,
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
    topSpeed: 30,
    engine: {
      bassFreq: 30,
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

export const PEDESTRIAN_VARIANTS = [
  'characterMaleA',
  'characterMaleC',
  'characterMaleD',
  'characterMaleE',
  'characterMaleF',
  'characterFemaleA',
  'characterFemaleC',
  'characterFemaleD',
  'characterFemaleE',
  'characterFemaleF',
] as const satisfies readonly ModelKey[];

export type PedestrianVariant = (typeof PEDESTRIAN_VARIANTS)[number];

export const PLAYER_VARIANT: ModelKey = 'characterMaleA';

export function pickPedestrianVariantBySeed(seed: number): PedestrianVariant {
  const idx = Math.abs(Math.floor(seed)) % PEDESTRIAN_VARIANTS.length;
  return PEDESTRIAN_VARIANTS[idx];
}

export const WEAPON_MODEL: Record<'handgun' | 'shotgun' | 'smg', ModelKey | null> = {
  handgun: 'weaponPistol',
  shotgun: null,
  smg: 'weaponSmg',
};

function hasSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) found = true;
  });
  return found;
}

export function useCityModel(key: ModelKey) {
  const gltf = useGLTF(MODEL_PATHS[key]) as unknown as { scene: THREE.Object3D };
  const scene = useMemo(() => {
    // SkeletonUtils.clone rebinds bones correctly for skinned meshes (Mini
    // Characters). For non-skinned (buildings, cars), plain clone is fine and
    // cheaper.
    const cloned = hasSkinnedMesh(gltf.scene)
      ? (skeletonClone(gltf.scene) as THREE.Object3D)
      : gltf.scene.clone(true);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [gltf.scene]);
  return scene;
}

export function useFitHeight(scene: THREE.Object3D, targetHeight: number) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y === 0) return { scale: 1, yOffset: 0 };
    const scale = targetHeight / size.y;
    const yOffset = -box.min.y * scale;
    return { scale, yOffset };
  }, [scene, targetHeight]);
}

export function useFitLength(scene: THREE.Object3D, targetLength: number) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const length = Math.max(size.x, size.z);
    if (length === 0) return { scale: 1, yOffset: 0 };
    const scale = targetLength / length;
    const yOffset = -box.min.y * scale;
    return { scale, yOffset };
  }, [scene, targetLength]);
}

export function useFitToBox(scene: THREE.Object3D, target: { w: number; h: number; d: number }) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if (size.x === 0 || size.y === 0 || size.z === 0) {
      return {
        scale: [1, 1, 1] as [number, number, number],
        offset: [0, 0, 0] as [number, number, number],
      };
    }
    const scale: [number, number, number] = [
      target.w / size.x,
      target.h / size.y,
      target.d / size.z,
    ];
    const offset: [number, number, number] = [
      -center.x * scale[0],
      -box.min.y * scale[1],
      -center.z * scale[2],
    ];
    return { scale, offset };
  }, [scene, target.w, target.h, target.d]);
}

// Kick off GLB downloads as soon as this module is imported. Without this, the
// first time a Pedestrian / Car / Building mounts a not-yet-loaded variant, its
// GltfBoundary's <Suspense> shows the primitive fallback (capsule for peds,
// box for cars) until the GLB resolves — which reads as "stuck in low LOD"
// when you turn a corner and a fresh ped/car comes into view. Preloading
// guarantees the cache is warm before any consumer renders.
for (const path of Object.values(MODEL_PATHS)) {
  useGLTF.preload(path);
}

export function useLogGltfLoadErrors() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (e.message?.includes('.glb')) {
        console.warn('[cityAssets] GLB load failed, using primitive fallback:', e.message);
      }
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);
}
