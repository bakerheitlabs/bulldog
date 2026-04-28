import { useVisibleCells } from './Chunks';

// The base grass plane and ground collider live on the Island component now.
// This module just paints per-cell surface colors (block / park / parking
// lot) on top of that grass and scatters trees in parks.
const BUILDING_BLOCK_COLOR = '#55585c';

export default function GroundAndProps() {
  const cells = useVisibleCells();
  return (
    <group>
      {/* city blocks, parks, and parking lots get their own surface color */}
      {cells.map(({ gridId, col, row, cell, center, size }) => {
        if (cell.kind !== 'building' && cell.kind !== 'park' && cell.kind !== 'parkingLot') {
          return null;
        }
        if (cell.kind === 'building' && cell.mergedInto) return null;
        // Plaza blocks paint their own surface; skip the base ground layer.
        if (cell.kind === 'building' && cell.blockType === 'plaza') return null;
        // Stadium / marina paint their own ground in their landmark components.
        if (cell.kind === 'building' && (cell.tag === 'stadium' || cell.tag === 'marina'))
          return null;
        let x = center[0];
        let z = center[2];
        let w = size.width;
        let d = size.depth;
        if (cell.kind === 'building' && cell.mergedBounds) {
          const b = cell.mergedBounds;
          x = (b.minX + b.maxX) / 2;
          z = (b.minZ + b.maxZ) / 2;
          w = b.maxX - b.minX;
          d = b.maxZ - b.minZ;
        }
        const color =
          cell.kind === 'building'
            ? BUILDING_BLOCK_COLOR
            : cell.kind === 'park'
              ? '#3e6a3a'
              : '#46464d';
        return (
          <mesh
            key={`surf_${gridId}_${col}_${row}`}
            position={[x, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {/* a few trees in parks — offsets scale with cell dimensions */}
      {cells.map(({ gridId, col, row, cell, center, size }) => {
        if (cell.kind !== 'park') return null;
        const [x, , z] = center;
        const sx = size.width / 50;
        const sz = size.depth / 50;
        const trees: React.ReactNode[] = [];
        for (let i = 0; i < 6; i++) {
          const tx = x + ((i % 3) - 1) * 12 * sx;
          const tz = z + (Math.floor(i / 3) - 0.5) * 14 * sz;
          trees.push(
            <group key={`tree_${gridId}_${col}_${row}_${i}`} position={[tx, 0, tz]}>
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
        return <group key={`trees_${gridId}_${col}_${row}`}>{trees}</group>;
      })}
    </group>
  );
}
