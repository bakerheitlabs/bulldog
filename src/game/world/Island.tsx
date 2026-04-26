import { ConvexHullCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';
import { getIslandData } from './landBounds';

const WATER_SIZE = 8000; // covers well past the fog horizon from any vantage
// Layering: water sits well below land. The grass plane keeps the existing
// y=0 baseline so road stripes (y=0.01) and per-cell surfaces (y=0.02) layer
// on top with the same offsets they did before. Beach is a hair below grass
// so the inner grass shape cleanly hides the beach where land is dry.
const WATER_Y = -0.02;
const BEACH_Y = -0.005;
const GRASS_Y = 0;

const WATER_COLOR = '#2a4a6e';
const BEACH_COLOR = '#d9c89a';
const GRASS_COLOR = '#3a4a39';

// Renders the entire island: ocean, sandy beach ring, and the green base
// land. The convex-hull collider covers the full beach footprint so vehicles
// can drive onto sand and only fall into water at the actual visible edge.
export default function Island() {
  const { innerShape, outerShape, hullPoints } = useMemo(() => getIslandData(), []);

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <ConvexHullCollider args={[hullPoints]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} receiveShadow>
        <planeGeometry args={[WATER_SIZE, WATER_SIZE]} />
        <meshStandardMaterial color={WATER_COLOR} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BEACH_Y, 0]} receiveShadow>
        <shapeGeometry args={[outerShape]} />
        <meshStandardMaterial color={BEACH_COLOR} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GRASS_Y, 0]} receiveShadow>
        <shapeGeometry args={[innerShape]} />
        <meshStandardMaterial color={GRASS_COLOR} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
