import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BLOCK_SIZE, COLS, ROWS } from './cityLayout';
import { useVisibleCells } from './Chunks';

const GROUND_SIZE = Math.max(COLS, ROWS) * BLOCK_SIZE * 2;
const BUILDING_BLOCK_COLOR = '#55585c';

export default function GroundAndProps() {
  const cells = useVisibleCells();
  return (
    <group>
      {/* infinite-ish ground plane (collider only — visual is per-cell) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[GROUND_SIZE / 2, 0.1, GROUND_SIZE / 2]} position={[0, -0.1, 0]} />
      </RigidBody>
      {/* base grass/asphalt color underneath everything */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#3a4a39" />
      </mesh>
      {/* city blocks, parks, and parking lots get their own surface color */}
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind !== 'building' && cell.kind !== 'park' && cell.kind !== 'parkingLot') {
          return null;
        }
        const [x, , z] = center;
        const color =
          cell.kind === 'building'
            ? BUILDING_BLOCK_COLOR
            : cell.kind === 'park'
              ? '#3e6a3a'
              : '#46464d';
        return (
          <mesh
            key={`surf_${col}_${row}`}
            position={[x, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[BLOCK_SIZE, BLOCK_SIZE]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {/* a few trees in parks */}
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind !== 'park') return null;
        const [x, , z] = center;
        const trees: React.ReactNode[] = [];
        for (let i = 0; i < 6; i++) {
          const tx = x + ((i % 3) - 1) * 12;
          const tz = z + (Math.floor(i / 3) - 0.5) * 14;
          trees.push(
            <group key={`tree_${col}_${row}_${i}`} position={[tx, 0, tz]}>
              <mesh position={[0, 1.5, 0]} castShadow>
                <cylinderGeometry args={[0.25, 0.3, 3]} />
                <meshStandardMaterial color="#553a22" />
              </mesh>
              <mesh position={[0, 4, 0]} castShadow>
                <coneGeometry args={[1.6, 4, 8]} />
                <meshStandardMaterial color="#2e6b34" />
              </mesh>
            </group>,
          );
        }
        return <group key={`trees_${col}_${row}`}>{trees}</group>;
      })}
    </group>
  );
}
