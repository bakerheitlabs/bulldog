import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useCityModel, useFitLength, type CarVariant } from '@/game/world/cityAssets';

const TARGET_LENGTH = 4;

export default function CarModel({
  variant,
  tint,
}: {
  variant: CarVariant | 'carPolice';
  tint?: string;
}) {
  const scene = useCityModel(variant);
  const { scale, yOffset } = useFitLength(scene, TARGET_LENGTH);
  // Per-instance material clones so color edits don't leak to other cars
  // sharing the cached Kenney material.
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const originalColorsRef = useRef<THREE.Color[]>([]);

  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    const originals: THREE.Color[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const raw = mesh.material;
      const cloneOne = (m: THREE.Material) => {
        const std = m as THREE.MeshStandardMaterial;
        if (!(std as { color?: THREE.Color }).color) return std;
        const c = std.clone() as THREE.MeshStandardMaterial;
        mats.push(c);
        originals.push(c.color.clone());
        return c;
      };
      if (Array.isArray(raw)) {
        mesh.material = raw.map(cloneOne);
      } else if (raw) {
        mesh.material = cloneOne(raw);
      }
    });
    matsRef.current = mats;
    originalColorsRef.current = originals;
  }, [scene]);

  useEffect(() => {
    const mats = matsRef.current;
    const originals = originalColorsRef.current;
    if (!tint) {
      // restore originals if we ever de-tint
      for (let i = 0; i < mats.length; i++) mats[i].color.copy(originals[i]);
      return;
    }
    // Kenney cars sample a shared colormap texture with material.color=white,
    // so setting color multiplies the texture — a uniform tint across the
    // whole car is the cleanest hit without per-UV surgery.
    const next = new THREE.Color(tint);
    for (const mat of mats) mat.color.copy(next);
  }, [tint]);

  return <primitive object={scene} position={[0, yOffset - 0.45, 0]} scale={scale} />;
}
