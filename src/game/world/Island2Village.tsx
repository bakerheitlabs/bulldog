// Renders island 2's small village: a handful of free-standing buildings, a
// paved plaza with a fountain + trees, and a small parking lot. Buildings
// are simple boxes with cuboid colliders — no GLTF, no AI peds, no vendor
// interactions. The village is purely visual ambience for the island.

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  ISLAND2_BUILDINGS,
  ISLAND2_PLAZA,
  ISLAND2_VILLAGE_PARKING,
  type IslandBuilding,
} from './island2';

const PARKING_COLOR = '#46464d';
const PARKING_Y = 0.025;
const PLAZA_PAVING_COLOR = '#7a7b82';
const PLAZA_GRASS_COLOR = '#4b7a4a';
const PLAZA_Y = 0.03;
const ROOF_COLOR = '#222';

function VillageBuilding({ b }: { b: IslandBuilding }) {
  const halfH = b.height / 2;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[b.width / 2, halfH, b.depth / 2]}
          position={[b.x, halfH, b.z]}
        />
      </RigidBody>
      <mesh position={[b.x, halfH, b.z]} castShadow receiveShadow>
        <boxGeometry args={[b.width, b.height, b.depth]} />
        <meshStandardMaterial color={b.color} />
      </mesh>
      {/* Flat roof slab — sits a hair above the body for a clean parapet. */}
      <mesh position={[b.x, b.height + 0.05, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[b.width, b.depth]} />
        <meshStandardMaterial color={ROOF_COLOR} />
      </mesh>
    </group>
  );
}

function Plaza() {
  const { centerX, centerZ, width, depth } = ISLAND2_PLAZA;
  const ringInner = Math.min(width, depth) * 0.18;
  const ringOuter = Math.min(width, depth) * 0.28;
  // Ring of trees around the plaza interior.
  const treeMargin = 1.5;
  const usableW = width - treeMargin * 2;
  const usableD = depth - treeMargin * 2;
  const treeCount = 8;
  const trees: React.ReactNode[] = [];
  for (let i = 0; i < treeCount; i++) {
    const t = i / treeCount;
    let tx: number;
    let tz: number;
    if (t < 0.25) {
      tx = centerX - usableW / 2 + (t / 0.25) * usableW;
      tz = centerZ - usableD / 2;
    } else if (t < 0.5) {
      tx = centerX + usableW / 2;
      tz = centerZ - usableD / 2 + ((t - 0.25) / 0.25) * usableD;
    } else if (t < 0.75) {
      tx = centerX + usableW / 2 - ((t - 0.5) / 0.25) * usableW;
      tz = centerZ + usableD / 2;
    } else {
      tx = centerX - usableW / 2;
      tz = centerZ + usableD / 2 - ((t - 0.75) / 0.25) * usableD;
    }
    trees.push(
      <group key={`i2_plaza_tree_${i}`} position={[tx, 0, tz]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.25, 2.4]} />
          <meshStandardMaterial color="#553a22" />
        </mesh>
        <mesh position={[0, 3, 0]} castShadow>
          <sphereGeometry args={[1.4, 10, 10]} />
          <meshStandardMaterial color="#4f9455" />
        </mesh>
      </group>,
    );
  }
  return (
    <group>
      <mesh
        position={[centerX, PLAZA_Y, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={PLAZA_PAVING_COLOR} />
      </mesh>
      <mesh
        position={[centerX, PLAZA_Y + 0.01, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[ringInner, ringOuter, 24]} />
        <meshStandardMaterial color={PLAZA_GRASS_COLOR} />
      </mesh>
      {/* Central fountain — short cylinder + cone tip. */}
      <mesh position={[centerX, 0.5, centerZ]} castShadow>
        <cylinderGeometry args={[1.1, 1.3, 1]} />
        <meshStandardMaterial color="#9ea3a8" />
      </mesh>
      <mesh position={[centerX, 1.4, centerZ]} castShadow>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshStandardMaterial color="#5b7a8c" />
      </mesh>
      {trees}
    </group>
  );
}

function ParkingLot() {
  const { centerX, centerZ, width, depth } = ISLAND2_VILLAGE_PARKING;
  return (
    <mesh
      position={[centerX, PARKING_Y, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={PARKING_COLOR} />
    </mesh>
  );
}

export default function Island2Village() {
  return (
    <group>
      <Plaza />
      <ParkingLot />
      {ISLAND2_BUILDINGS.map((b) => (
        <VillageBuilding key={b.id} b={b} />
      ))}
    </group>
  );
}
