import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCityModel, useFitLength, type CarVariant } from '@/game/world/cityAssets';

const TARGET_LENGTH = 4;

// Police-cruiser siren caps. The GLB ships dedicated materials named
// `TailLights` (red) and `BlueLights` (blue) that are bound to the actual
// roof caps — driving emissive on the named materials guarantees the right
// caps light up on the right side of the roof.
const SIREN_FLASH_HZ = 3.5;
const SIREN_RED_NAME = 'TailLights';
const SIREN_BLUE_NAME = 'BlueLights';
const SIREN_RED_EMISSIVE = '#ff1020';
const SIREN_BLUE_EMISSIVE = '#1860ff';
const SIREN_PEAK_INTENSITY = 4;
const SIREN_OFF_INTENSITY = 0.05;

type WheelEntry = { pivot: THREE.Group; radius: number };

type SirenMat = {
  mat: THREE.MeshStandardMaterial;
  origEmissive: THREE.Color;
  origIntensity: number;
};

export default function CarModel({
  variant,
  tint,
  getSpeed,
  siren = false,
}: {
  variant: CarVariant | 'carPolice';
  tint?: string;
  // Signed forward speed in world units per second. Positive when the car
  // moves along its local +Z; negative in reverse. Wheels stay still when
  // omitted.
  getSpeed?: () => number;
  // When true, the GLB's red and blue cap materials pulse in alternation.
  // Only meaningful for `carPolice`.
  siren?: boolean;
}) {
  const scene = useCityModel(variant);
  const { scale, yOffset } = useFitLength(scene, TARGET_LENGTH);
  // Per-instance material clones so color edits don't leak to other cars
  // sharing the cached Kenney material.
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const originalColorsRef = useRef<THREE.Color[]>([]);
  const wheelsRef = useRef<WheelEntry[]>([]);
  const sirenRedRef = useRef<SirenMat | null>(null);
  const sirenBlueRef = useRef<SirenMat | null>(null);

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
        if (variant === 'carPolice') {
          if (c.name === SIREN_RED_NAME) {
            sirenRedRef.current = {
              mat: c,
              origEmissive: c.emissive.clone(),
              origIntensity: c.emissiveIntensity,
            };
          } else if (c.name === SIREN_BLUE_NAME) {
            sirenBlueRef.current = {
              mat: c,
              origEmissive: c.emissive.clone(),
              origIntensity: c.emissiveIntensity,
            };
          }
        }
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

    // Find wheel nodes and reparent each under a pivot Group whose origin
    // sits at the wheel's geometric center, so rotating the pivot spins
    // the wheel in place. Some kits (Police Car) have wheel meshes whose
    // local origin isn't at the wheel center, which is why the pivot is
    // necessary rather than rotating the mesh directly.
    scene.updateMatrixWorld(true);
    const wheels: WheelEntry[] = [];
    const worldCenter = new THREE.Vector3();
    const worldSize = new THREE.Vector3();

    // Idempotent: if this effect already ran on this scene (StrictMode dev
    // re-invocation, or any future re-init path), the wheels are already
    // wrapped in `*_spinPivot` Groups. Re-wrapping nests pivots, and on
    // assets whose wheel nodes carry a non-identity rotation quaternion
    // (e.g. `car_apex_rush.glb` rotates wheels -90° on X) the nested pivot
    // stack composes rotations against a rotated child frame — shifting the
    // effective rotation axis off the wheel center, so the wheel orbits the
    // car instead of spinning in place.
    const existing: THREE.Group[] = [];
    scene.traverse((obj) => {
      if (!obj.name.endsWith('_spinPivot')) return;
      if (!(obj as THREE.Group).isGroup) return;
      existing.push(obj as THREE.Group);
    });
    if (existing.length > 0) {
      for (const pivot of existing) {
        const wheel = pivot.children.find(
          (c) => /wheel/i.test(c.name) && !c.name.endsWith('_spinPivot'),
        );
        if (!wheel) continue;
        const wbox = new THREE.Box3().setFromObject(wheel);
        wbox.getSize(worldSize);
        const radius = Math.max(worldSize.y / 2, 0.05);
        wheels.push({ pivot, radius });
      }
      wheelsRef.current = wheels;
      return;
    }

    const targets: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (!/wheel/i.test(obj.name)) return;
      // Drivable wheels always carry a side qualifier (`wheel-front-left`,
      // `Cop_FrontLeftWheel_Cylinder…`) or are a plural-merged axle (the
      // Police `Cop_BackWheels_Cylinder…`). The Karin Pathway's rear-mounted
      // spare is just `wheel-back` — no side, no plural — so this filter
      // skips it and keeps it visually static.
      if (!/(left|right)/i.test(obj.name) && !/wheels/i.test(obj.name)) return;
      targets.push(obj);
    });
    for (const obj of targets) {
      const parent = obj.parent;
      if (!parent) continue;
      const wbox = new THREE.Box3().setFromObject(obj);
      wbox.getCenter(worldCenter);
      wbox.getSize(worldSize);
      // Wheel radius ≈ vertical extent / 2, with a small floor so a flat
      // mesh doesn't divide-by-near-zero.
      const radius = Math.max(worldSize.y / 2, 0.05);
      const localCenter = parent.worldToLocal(worldCenter.clone());
      const pivot = new THREE.Group();
      pivot.name = `${obj.name}_spinPivot`;
      pivot.position.copy(localCenter);
      parent.add(pivot);
      parent.remove(obj);
      obj.position.sub(localCenter);
      pivot.add(obj);
      wheels.push({ pivot, radius });
    }
    wheelsRef.current = wheels;
  }, [scene]);

  useFrame(({ clock }, delta) => {
    const wheels = wheelsRef.current;
    if (wheels.length > 0 && getSpeed) {
      const speed = getSpeed();
      if (Math.abs(speed) >= 0.01) {
        for (const w of wheels) {
          w.pivot.rotation.x += (speed * delta) / w.radius;
        }
      }
    }

    const red = sirenRedRef.current;
    const blue = sirenBlueRef.current;
    if (!red && !blue) return;
    if (siren) {
      const phase = (clock.getElapsedTime() * SIREN_FLASH_HZ) % 1;
      // Red leads the half-cycle, blue trails. The two never peak together
      // so the eye reads it as two alternating beacons.
      const redOn = phase < 0.5;
      const blueOn = !redOn;
      if (red) {
        red.mat.emissive.set(SIREN_RED_EMISSIVE);
        red.mat.emissiveIntensity = redOn ? SIREN_PEAK_INTENSITY : SIREN_OFF_INTENSITY;
      }
      if (blue) {
        blue.mat.emissive.set(SIREN_BLUE_EMISSIVE);
        blue.mat.emissiveIntensity = blueOn ? SIREN_PEAK_INTENSITY : SIREN_OFF_INTENSITY;
      }
    } else {
      // Restore baseline when the siren is off so brake lights / blue caps
      // look like their non-flashing GLB defaults.
      if (red) {
        red.mat.emissive.copy(red.origEmissive);
        red.mat.emissiveIntensity = red.origIntensity;
      }
      if (blue) {
        blue.mat.emissive.copy(blue.origEmissive);
        blue.mat.emissiveIntensity = blue.origIntensity;
      }
    }
  });

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
