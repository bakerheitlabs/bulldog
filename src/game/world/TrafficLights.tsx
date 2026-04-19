import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import {
  BLOCK_SIZE,
  INTERSECTIONS,
  LANE_OFFSET,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  type Intersection,
  type LaneDir,
} from './cityLayout';
import { useCityModel, useFitHeight } from './cityAssets';
import GltfBoundary from './GltfBoundary';
import { lightFor, tickTrafficClock, type Light } from './trafficLightState';
import { useVisibleCells } from './Chunks';

const POST_HEIGHT = 6;
const BULB_RADIUS = 0.35;
const BULB_BASE_Y = POST_HEIGHT - 1.8;
const HALF_BLOCK = BLOCK_SIZE / 2;
const SIDE_INSET = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;

// Where each approach's controlling light is placed relative to the
// intersection cell center. The light sits on the far side of the intersection
// from the approaching driver and faces back toward them.
function lightTransform(dir: LaneDir): { pos: [number, number, number]; rotY: number } {
  const outer = HALF_BLOCK - SIDE_INSET;
  switch (dir) {
    case 'N':
      return { pos: [LANE_OFFSET, 0, -outer], rotY: 0 };
    case 'S':
      return { pos: [-LANE_OFFSET, 0, outer], rotY: Math.PI };
    case 'E':
      return { pos: [outer, 0, -LANE_OFFSET], rotY: -Math.PI / 2 };
    case 'W':
      return { pos: [-outer, 0, LANE_OFFSET], rotY: Math.PI / 2 };
  }
}

function GltfPost() {
  const scene = useCityModel('trafficLight');
  const { scale, yOffset } = useFitHeight(scene, POST_HEIGHT);
  return <primitive object={scene} position={[0, yOffset, 0]} scale={scale} />;
}

function PrimitivePost() {
  return (
    <group>
      <mesh position={[0, POST_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, POST_HEIGHT]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, POST_HEIGHT - 0.8, 0]} castShadow>
        <boxGeometry args={[0.5, 1.8, 0.4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

function TrafficLightPost({ intersection, dir }: { intersection: Intersection; dir: LaneDir }) {
  const { pos, rotY } = lightTransform(dir);
  const [cx, , cz] = intersection.center;
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

  return (
    <group position={[cx + pos[0], 0, cz + pos[2]]} rotation={[0, rotY, 0]}>
      <GltfBoundary fallback={<PrimitivePost />}>
        <GltfPost />
      </GltfBoundary>
      <mesh ref={redRef} position={[0, BULB_BASE_Y + 1.1, 0.22]}>
        <sphereGeometry args={[BULB_RADIUS, 10, 10]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={yelRef} position={[0, BULB_BASE_Y + 0.55, 0.22]}>
        <sphereGeometry args={[BULB_RADIUS, 10, 10]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={grnRef} position={[0, BULB_BASE_Y, 0.22]}>
        <sphereGeometry args={[BULB_RADIUS, 10, 10]} />
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
