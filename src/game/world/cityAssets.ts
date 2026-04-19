import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

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
} as const;

export type ModelKey = keyof typeof MODEL_PATHS;

export const CAR_VARIANTS = [
  'carSedan',
  'carSedanSports',
  'carHatchbackSports',
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

export const WEAPON_MODEL: Record<'handgun' | 'shotgun', ModelKey | null> = {
  handgun: 'weaponPistol',
  shotgun: null,
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
    box.getSize(size);
    if (size.x === 0 || size.y === 0 || size.z === 0) {
      return { scale: 1, yOffset: 0 };
    }
    const scale = Math.min(target.w / size.x, target.h / size.y, target.d / size.z);
    const yOffset = -box.min.y * scale;
    return { scale, yOffset };
  }, [scene, target.w, target.h, target.d]);
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
