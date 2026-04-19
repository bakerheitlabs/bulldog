import { useAnimations, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODEL_PATHS, useFitHeight, type ModelKey } from '@/game/world/cityAssets';

const DEFAULT_HEIGHT = 1.8;
const FADE = 0.18;

export type CharacterAction =
  | 'idle'
  | 'walk'
  | 'sprint'
  | 'die'
  | 'drive'
  | 'holding-right'
  | 'holding-right-shoot'
  | 'armed-walk'
  | 'armed-sprint';

// Kenney Mini Character is authored in T-pose: `arm-right` has no hand bone
// and the arm mesh extends along the bone's local -X axis (outward, not down).
// `holding-right` then rotates the bone +60° around local +Y, which swings the
// arm forward and to the left. Pre-rotating the weapon by -60° around Y makes
// the barrel end up pointing the character's forward direction after the clip
// applies its rotation.
const WEAPON_OFFSET = new THREE.Vector3(-0.26, 0.05, 0.15);
const WEAPON_EULER = new THREE.Euler(0, (2 * Math.PI) / 3, 0);
const WEAPON_SCALE = 0.035;

// Keep the right arm pose from `holding-right` while the rest of the body plays
// walk/sprint — otherwise the native locomotion clips swing the arm and the
// attached weapon follows it down to the feet.
const WEAPON_ARM_BONES = new Set(['arm-right']);

function combineClips(
  name: string,
  body: THREE.AnimationClip,
  arms: THREE.AnimationClip,
): THREE.AnimationClip {
  const bodyTracks = body.tracks.filter(
    (t) => !WEAPON_ARM_BONES.has(t.name.split('.')[0]),
  );
  const armTracks = arms.tracks.filter((t) => WEAPON_ARM_BONES.has(t.name.split('.')[0]));
  return new THREE.AnimationClip(name, body.duration, [...bodyTracks, ...armTracks]);
}

export default function CharacterModel({
  variant,
  action = 'idle',
  targetHeight = DEFAULT_HEIGHT,
  yBase = 0,
  weaponVariant,
}: {
  variant: ModelKey;
  action?: CharacterAction;
  targetHeight?: number;
  yBase?: number;
  weaponVariant?: ModelKey | null;
}) {
  const gltf = useGLTF(MODEL_PATHS[variant]) as unknown as {
    scene: THREE.Object3D;
    animations: THREE.AnimationClip[];
  };
  const scene = useMemo(() => {
    const cloned = skeletonClone(gltf.scene) as THREE.Object3D;
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [gltf.scene]);

  const animations = useMemo(() => {
    const list = [...gltf.animations];
    const walk = list.find((c) => c.name === 'walk');
    const sprint = list.find((c) => c.name === 'sprint');
    const hold = list.find((c) => c.name === 'holding-right');
    if (walk && hold) list.push(combineClips('armed-walk', walk, hold));
    if (sprint && hold) list.push(combineClips('armed-sprint', sprint, hold));
    return list;
  }, [gltf.animations]);

  const { actions } = useAnimations(animations, scene);
  const prevAction = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    const next = actions[action];
    if (!next) return;
    const clamp = action === 'die';
    next.reset();
    if (clamp) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.fadeIn(FADE).play();
    if (prevAction.current && prevAction.current !== next) {
      prevAction.current.fadeOut(FADE);
    }
    prevAction.current = next;
    return () => {
      next.fadeOut(FADE);
    };
  }, [action, actions]);

  const weaponPath = weaponVariant ? MODEL_PATHS[weaponVariant] : null;
  const weaponGltf = useGLTF(weaponPath ?? MODEL_PATHS.weaponPistol) as unknown as {
    scene: THREE.Object3D;
  };
  const weaponScene = useMemo(() => {
    if (!weaponVariant) return null;
    const cloned = weaponGltf.scene.clone(true);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    cloned.position.copy(WEAPON_OFFSET);
    cloned.rotation.copy(WEAPON_EULER);
    cloned.scale.setScalar(WEAPON_SCALE);
    return cloned;
  }, [weaponVariant, weaponGltf.scene]);

  useEffect(() => {
    if (!weaponScene) return;
    const arm = scene.getObjectByName('arm-right');
    if (!arm) return;
    arm.add(weaponScene);
    return () => {
      arm.remove(weaponScene);
    };
  }, [scene, weaponScene]);

  const { scale, yOffset } = useFitHeight(scene, targetHeight);
  return <primitive object={scene} position={[0, yBase + yOffset, 0]} scale={scale} />;
}
