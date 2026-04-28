import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';

// Procedural marina block: a small harbormaster building on the inland side
// of the cell, with a pier and 2–3 moored sailboats projecting toward the
// nearest coast. Pier extends in -Z (north) since marina cells are placed
// near the north coast on island 3. Self-contained primitives keep things
// cheap, similar to Dock.tsx but block-scoped instead of shore-spanning.
export default function Marina({
  x,
  z,
  w,
  d,
  h,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}) {
  // Harbormaster building on the south third of the cell.
  const buildingD = d * 0.35;
  const buildingW = w * 0.6;
  const buildingZ = z + d / 2 - buildingD / 2 - 1;
  const buildingX = x;
  const wallColor = '#cdb98a';
  const roofColor = '#7a4a3a';

  // Pier extends into the north half of the cell.
  const pierW = w * 0.18;
  const pierD = d * 0.55;
  const pierX = x;
  const pierZ = z - d / 2 + pierD / 2 + 0.5;
  const pierY = 0.4;

  return (
    <group>
      {/* Sand/grass apron */}
      <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#cdc28a" />
      </mesh>
      {/* Harbormaster building */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[buildingW / 2, h / 2, buildingD / 2]}
          position={[buildingX, h / 2, buildingZ]}
        />
      </RigidBody>
      <mesh position={[buildingX, h / 2, buildingZ]} castShadow receiveShadow>
        <boxGeometry args={[buildingW, h, buildingD]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* Pitched roof (single triangular prism approximation: a wider flat plus a thin ridge) */}
      <mesh position={[buildingX, h + 0.3, buildingZ]} castShadow>
        <boxGeometry args={[buildingW + 0.6, 0.6, buildingD + 0.6]} />
        <meshStandardMaterial color={roofColor} />
      </mesh>
      {/* Sign */}
      <Text
        position={[buildingX, h * 0.6, buildingZ + buildingD / 2 + 0.02]}
        fontSize={0.7}
        color="#1a1a20"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#fff"
      >
        MARINA
      </Text>

      {/* Pier deck (no collider — keep walkable but cheap; visual only) */}
      <mesh position={[pierX, pierY, pierZ]} castShadow receiveShadow>
        <boxGeometry args={[pierW, 0.2, pierD]} />
        <meshStandardMaterial color="#8a6a48" />
      </mesh>
      {/* Pier railings */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`rail_${sx}`}
          position={[pierX + sx * (pierW / 2 - 0.1), pierY + 0.55, pierZ]}
          castShadow
        >
          <boxGeometry args={[0.1, 0.5, pierD]} />
          <meshStandardMaterial color="#a08060" />
        </mesh>
      ))}

      {/* Sailboats moored east and west of pier */}
      {[-1, 1].map((sx) => (
        <group
          key={`boat_${sx}`}
          position={[pierX + sx * (pierW / 2 + 2.2), 0.1, pierZ + 1]}
        >
          {/* Hull */}
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[1.6, 0.5, 4]} />
            <meshStandardMaterial color="#e8ecef" />
          </mesh>
          {/* Cabin */}
          <mesh position={[0, 0.7, -0.3]} castShadow>
            <boxGeometry args={[0.9, 0.4, 1.4]} />
            <meshStandardMaterial color="#7c5b3b" />
          </mesh>
          {/* Mast */}
          <mesh position={[0, 2.6, 0.3]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 4.5, 8]} />
            <meshStandardMaterial color="#cccccc" />
          </mesh>
          {/* Sail (furled) */}
          <mesh position={[0, 2.0, 0.32]} castShadow>
            <boxGeometry args={[0.15, 3.5, 0.15]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
