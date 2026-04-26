import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useCityModel, useFitLength } from '@/game/world/cityAssets';
import { AIRPLANE_TARGET_LENGTH } from './airplaneConstants';

// Wheel nodes in airplane_1.glb are top-level groups named Wheel1…Wheel6
// (six landing-gear discs). Anchored to a regex so any extra non-wheel
// node containing the word "wheel" wouldn't be flipped off accidentally.
const WHEEL_NAME_RE = /^Wheel\d+$/i;

// Gear-bay split: legs and fuselage belly overlap in Y (the fuselage tube
// extends down to ~y=-130 while legs span y=-180→-30), so a pure Y cut
// either keeps legs visible or hacks off the belly. We instead split by
// XZ proximity to any wheel — legs are thin columns directly above their
// wheels, while fuselage belly is at all Z along the tube and stays at the
// outer X edge (±280). Triangles below LEG_TRIANGLE_MAX_Y whose centroid
// sits within a wheel's XZ footprint (plus a small tolerance for the strut
// being slightly wider than the wheel) are gear-bay material.
const LEG_TRIANGLE_MAX_Y = -30;
const LEG_XZ_TOLERANCE = 30;
const GEAR_BAY_USERDATA_FLAG = 'gearBaySplit';

// Loads the airplane GLB, scales it to a consistent target length so every
// parked plane reads the same size regardless of the model's authored scale,
// and parents into the rigid body's group so transforms apply correctly. The
// GLB is authored with +Z as nose-forward (matching cars), so no extra
// rotation is applied here — yaw on the rigid body rotates the visible nose
// the same way it rotates the physics velocity vector.
//
// `gearOut` toggles the landing-gear visuals (six Wheel* meshes plus the
// gear-bay split-out from the fuselage) on/off. Defaults to true so parked
// and ambient planes always show their gear; only the player-flown plane
// retracts via DrivableAirplane wiring.
export default function AirplaneModel({ gearOut = true }: { gearOut?: boolean }) {
  const scene = useCityModel('airplane1');
  const { scale, yOffset } = useFitLength(scene, AIRPLANE_TARGET_LENGTH);
  const legMeshRef = useRef<THREE.Mesh | null>(null);

  // Once per scene clone: split out the gear-bay triangles from the fuselage
  // mesh into a sibling mesh whose visibility we can toggle independently.
  // Idempotent via a userData flag so StrictMode dev re-runs don't double-split.
  useEffect(() => {
    // Find the fuselage mesh: any Mesh whose name is NOT a wheel. GLTFLoader
    // names loaded objects after the GLTF *node* name (`Airplane1`), not the
    // mesh-data name (`Airplane1_1`) — matching the node name directly is
    // brittle, so we just take the first non-wheel Mesh in the tree.
    let airplaneMesh: THREE.Mesh | null = null;
    scene.traverse((obj) => {
      if (airplaneMesh) return;
      if (!(obj as THREE.Mesh).isMesh) return;
      if (WHEEL_NAME_RE.test(obj.name)) return;
      airplaneMesh = obj as THREE.Mesh;
    });
    if (!airplaneMesh) return;
    const fuselage: THREE.Mesh = airplaneMesh;
    if (fuselage.userData[GEAR_BAY_USERDATA_FLAG]) {
      legMeshRef.current = fuselage.userData.gearBayMesh ?? null;
      return;
    }
    // Collect wheel XZ footprints: each leg sits directly above its wheel,
    // so any low-Y fuselage triangle clustered near a wheel's XZ is leg
    // material. Read the wheel meshes' geometry bounding boxes; this is in
    // mesh-local space, which equals scene-local here because every node in
    // the airplane GLB is at translation=0,scale=1.
    type WheelFootprint = { x: number; z: number; rx: number; rz: number };
    const wheels: WheelFootprint[] = [];
    scene.traverse((obj) => {
      if (!WHEEL_NAME_RE.test(obj.name)) return;
      const wmesh = obj as THREE.Mesh;
      if (!wmesh.isMesh || !wmesh.geometry) return;
      if (!wmesh.geometry.boundingBox) wmesh.geometry.computeBoundingBox();
      const bb = wmesh.geometry.boundingBox;
      if (!bb) return;
      wheels.push({
        x: (bb.min.x + bb.max.x) / 2,
        z: (bb.min.z + bb.max.z) / 2,
        rx: (bb.max.x - bb.min.x) / 2 + LEG_XZ_TOLERANCE,
        rz: (bb.max.z - bb.min.z) / 2 + LEG_XZ_TOLERANCE,
      });
    });
    const origGeom = fuselage.geometry as THREE.BufferGeometry;
    const pos = origGeom.attributes.position as THREE.BufferAttribute;
    const indices: number[] = origGeom.index
      ? Array.from(origGeom.index.array as ArrayLike<number>)
      : Array.from({ length: pos.count }, (_, i) => i);
    const fuselageIdx: number[] = [];
    const legIdx: number[] = [];
    const isNearWheel = (x: number, z: number): boolean => {
      for (const w of wheels) {
        const dx = (x - w.x) / w.rx;
        const dz = (z - w.z) / w.rz;
        if (dx * dx + dz * dz <= 1) return true;
      }
      return false;
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      const ya = pos.getY(a);
      const yb = pos.getY(b);
      const yc = pos.getY(c);
      const yMax = Math.max(ya, yb, yc);
      if (yMax >= LEG_TRIANGLE_MAX_Y) {
        fuselageIdx.push(a, b, c);
        continue;
      }
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (isNearWheel(cx, cz)) {
        legIdx.push(a, b, c);
      } else {
        fuselageIdx.push(a, b, c);
      }
    }
    if (legIdx.length === 0) {
      // Nothing to split (model swapped, threshold wrong, etc). Bail without
      // mutating geometry so we don't damage the fuselage on a bad asset.
      fuselage.userData[GEAR_BAY_USERDATA_FLAG] = true;
      return;
    }
    // Clone the geometry so we don't mutate the buffer that other airplane
    // instances share via gltf.scene.clone(true) (clone shares geometry by
    // default — modifying setIndex on the shared one would affect every plane).
    const fuselageGeom = origGeom.clone();
    fuselageGeom.setIndex(fuselageIdx);
    fuselage.geometry = fuselageGeom;
    const legGeom = new THREE.BufferGeometry();
    legGeom.setAttribute('position', fuselageGeom.attributes.position);
    if (fuselageGeom.attributes.normal) {
      legGeom.setAttribute('normal', fuselageGeom.attributes.normal);
    }
    if (fuselageGeom.attributes.uv) {
      legGeom.setAttribute('uv', fuselageGeom.attributes.uv);
    }
    legGeom.setIndex(legIdx);
    const legMesh = new THREE.Mesh(legGeom, fuselage.material);
    legMesh.name = 'AirplaneLegs';
    legMesh.castShadow = fuselage.castShadow;
    legMesh.receiveShadow = fuselage.receiveShadow;
    fuselage.parent?.add(legMesh);
    fuselage.userData[GEAR_BAY_USERDATA_FLAG] = true;
    fuselage.userData.gearBayMesh = legMesh;
    legMeshRef.current = legMesh;
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      if (WHEEL_NAME_RE.test(obj.name)) obj.visible = gearOut;
    });
    if (legMeshRef.current) legMeshRef.current.visible = gearOut;
  }, [scene, gearOut]);

  return (
    <primitive object={scene} scale={[scale, scale, scale]} position={[0, yOffset, 0]} />
  );
}
