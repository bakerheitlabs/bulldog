import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  INTERSECTIONS,
  lightPostPos,
  type Intersection,
  type LaneDir,
} from './cityLayout';
import { useCityModel, useFitHeight } from './cityAssets';
import GltfBoundary from './GltfBoundary';
import { lightFor, tickTrafficClock, type Light } from './trafficLightState';
import { useVisibleCells } from './Chunks';

const POST_HEIGHT = 6;

// Fallback panel offsets used by the primitive post when the GLB fails. The
// GLB-driven path computes its own positions from the model's geometry —
// see findBulbAnchors below.
const PANEL_X = -4.85;
const FALLBACK_BULB_BASE_Y = 4.54;
const FALLBACK_BULB_SPACING = 0.35;
// Z position of bulbs in the fallback path (no GLB or detection rejected).
// Tweak this to slide all three bulbs forward/back relative to the panel.
const FALLBACK_BULB_Z = 0.15;
const BULB_RADIUS = 0.14;
// Tiny additive buffer used only by the GLB-driven path to keep circles
// from z-fighting with the detected lamp face. The fallback path ignores
// this — use FALLBACK_BULB_Z above to move fallback bulbs in/out.
const FACE_OFFSET = 0.02;

// Per-bulb fine-tuning offsets applied on top of the auto-detected position.
// Local space: +X = away from road centerline, +Y = up, +Z = toward driver.
const RED_TWEAK: [number, number, number] = [0, 0, 0];
const YELLOW_TWEAK: [number, number, number] = [0, 0, 0];
const GREEN_TWEAK: [number, number, number] = [0, 0, 0];

type BulbAnchor = {
  pos: [number, number, number]; // local to TrafficLightPost group, post-fit
  faceNormal: [number, number, number]; // unit vector facing the driver
};

type BulbAnchors = {
  red: BulbAnchor;
  yellow: BulbAnchor;
  green: BulbAnchor;
};

let _loggedGlbStructure = false;

// Find the three bulb meshes in the loaded GLB by scanning for the three
// smallest meshes (bulbs are typically the smallest distinct meshes in a
// traffic-light model). Returns positions in the post's local space, with
// the GLB's fit transform applied.
function findBulbAnchors(
  scene: THREE.Object3D,
  fitScale: number,
  fitYOffset: number,
): BulbAnchors | null {
  scene.updateMatrixWorld(true);
  type Candidate = { name: string; pos: THREE.Vector3; size: THREE.Vector3; vol: number };
  const all: Candidate[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    const center = new THREE.Vector3();
    bb.getCenter(center).applyMatrix4(mesh.matrixWorld);
    all.push({
      name: mesh.name || '<unnamed>',
      pos: center,
      size,
      vol: Math.max(0.0001, size.x) * Math.max(0.0001, size.y) * Math.max(0.0001, size.z),
    });
  });
  if (!_loggedGlbStructure) {
    _loggedGlbStructure = true;
    console.log(
      '[TrafficLights] GLB meshes:',
      all
        .slice()
        .sort((a, b) => a.vol - b.vol)
        .map((c) => ({
          name: c.name,
          pos: [c.pos.x.toFixed(2), c.pos.y.toFixed(2), c.pos.z.toFixed(2)],
          size: [c.size.x.toFixed(2), c.size.y.toFixed(2), c.size.z.toFixed(2)],
        })),
    );
  }
  if (all.length < 3) return null;

  // Smallest 3 by volume → assume they're the bulbs. Sort top→bottom.
  const small = all.slice().sort((a, b) => a.vol - b.vol).slice(0, 3);
  small.sort((a, b) => b.pos.y - a.pos.y);
  // Sanity check: bulbs should be vertically stacked (similar X/Z, varying Y).
  const xs = small.map((c) => c.pos.x);
  const zs = small.map((c) => c.pos.z);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const zSpread = Math.max(...zs) - Math.min(...zs);
  const ys = small.map((c) => c.pos.y);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  if (ySpread < 0.1 || xSpread > 0.5 || zSpread > 0.5) return null;

  // Determine which face the panel presents to the driver. The post is
  // oriented so the driver sits on local +Z (see lightPostPos comments).
  // We push circles forward in the +Z direction relative to the bulb's
  // half-size on that axis.
  const transform = (c: Candidate): BulbAnchor => {
    const halfDepthZ = c.size.z / 2;
    return {
      pos: [
        c.pos.x * fitScale,
        c.pos.y * fitScale + fitYOffset,
        (c.pos.z + halfDepthZ) * fitScale + FACE_OFFSET,
      ],
      faceNormal: [0, 0, 1],
    };
  };
  const apply = (a: BulbAnchor, t: [number, number, number]): BulbAnchor => ({
    ...a,
    pos: [a.pos[0] + t[0], a.pos[1] + t[1], a.pos[2] + t[2]],
  });
  return {
    red: apply(transform(small[0]), RED_TWEAK),
    yellow: apply(transform(small[1]), YELLOW_TWEAK),
    green: apply(transform(small[2]), GREEN_TWEAK),
  };
}

function PrimitivePost() {
  return (
    <group>
      <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, POST_HEIGHT]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[PANEL_X / 2, POST_HEIGHT - 0.2, 0]} castShadow>
        <boxGeometry args={[Math.abs(PANEL_X), 0.18, 0.18]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[PANEL_X, FALLBACK_BULB_BASE_Y + FALLBACK_BULB_SPACING, 0]} castShadow>
        <boxGeometry args={[0.7, 1.9, 0.5]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function fallbackAnchors(): BulbAnchors {
  const z = FALLBACK_BULB_Z;
  const apply = (base: [number, number, number], t: [number, number, number]): [number, number, number] => [
    base[0] + t[0],
    base[1] + t[1],
    base[2] + t[2],
  ];
  return {
    red:    { pos: apply([PANEL_X, FALLBACK_BULB_BASE_Y + 2 * FALLBACK_BULB_SPACING, z], RED_TWEAK),    faceNormal: [0, 0, 1] },
    yellow: { pos: apply([PANEL_X, FALLBACK_BULB_BASE_Y + FALLBACK_BULB_SPACING,     z], YELLOW_TWEAK), faceNormal: [0, 0, 1] },
    green:  { pos: apply([PANEL_X, FALLBACK_BULB_BASE_Y,                              z], GREEN_TWEAK),  faceNormal: [0, 0, 1] },
  };
}

function GltfPost({ onAnchors }: { onAnchors: (a: BulbAnchors | null) => void }) {
  const scene = useCityModel('trafficLight');
  const { scale, yOffset } = useFitHeight(scene, POST_HEIGHT);
  useEffect(() => {
    onAnchors(findBulbAnchors(scene, scale, yOffset));
  }, [scene, scale, yOffset, onAnchors]);
  return <primitive object={scene} position={[0, yOffset, 0]} scale={scale} />;
}

function TrafficLightPost({ intersection, dir }: { intersection: Intersection; dir: LaneDir }) {
  const placement = lightPostPos(intersection, dir);
  const [anchors, setAnchors] = useState<BulbAnchors>(() => fallbackAnchors());
  const redRef = useRef<THREE.Mesh>(null);
  const yelRef = useRef<THREE.Mesh>(null);
  const grnRef = useRef<THREE.Mesh>(null);
  const stateRef = useRef<Light | null>(null);

  useFrame(() => {
    const next = lightFor(dir, intersection.phaseOffset);
    if (next === stateRef.current) return;
    stateRef.current = next;
    const apply = (ref: React.RefObject<THREE.Mesh>, color: string, on: boolean) => {
      if (!ref.current) return;
      const mat = ref.current.material as THREE.MeshStandardMaterial;
      mat.color.set(on ? color : '#1a1a1a');
      mat.emissive.set(on ? color : '#000');
      mat.emissiveIntensity = on ? 1.8 : 0;
    };
    apply(redRef, '#e53935', next === 'red');
    apply(yelRef, '#f6c050', next === 'yellow');
    apply(grnRef, '#58c474', next === 'green');
  });

  const onAnchors = useMemo(
    () => (a: BulbAnchors | null) => setAnchors(a ?? fallbackAnchors()),
    [],
  );

  if (!placement) return null;
  const [px, , pz] = placement.pos;
  return (
    <group position={[px, 0, pz]} rotation={[0, placement.rotY, 0]}>
      <GltfBoundary fallback={<PrimitivePost />}>
        <GltfPost onAnchors={onAnchors} />
      </GltfBoundary>
      <mesh ref={redRef} position={anchors.red.pos}>
        <circleGeometry args={[BULB_RADIUS, 24]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={yelRef} position={anchors.yellow.pos}>
        <circleGeometry args={[BULB_RADIUS, 24]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={grnRef} position={anchors.green.pos}>
        <circleGeometry args={[BULB_RADIUS, 24]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

export default function TrafficLights() {
  useFrame((_, dt) => tickTrafficClock(dt));
  const visible = useVisibleCells();
  const visibleIntersections = INTERSECTIONS.filter((it) =>
    visible.some((v) => v.col === it.col && v.row === it.row),
  );
  return (
    <group>
      {visibleIntersections.map((it) => (
        <group key={it.id}>
          {(['N', 'S', 'E', 'W'] as const).map((d) => (
            <TrafficLightPost key={`${it.id}_${d}`} intersection={it} dir={d} />
          ))}
        </group>
      ))}
    </group>
  );
}
