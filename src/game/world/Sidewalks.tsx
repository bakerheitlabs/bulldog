import { SIDEWALK_WIDTH } from './cityLayout';
import { useVisibleCells } from './Chunks';

const SIDEWALK_COLOR = '#9a9aa3';

export default function Sidewalks() {
  const cells = useVisibleCells();

  return (
    <group>
      {cells.map(({ gridId, col, row, cell, center, size }) => {
        if (cell.kind === 'road') return null;
        if (cell.kind === 'building' && cell.mergedInto) return null;
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
        const offX = w / 2 - SIDEWALK_WIDTH / 2;
        const offZ = d / 2 - SIDEWALK_WIDTH / 2;
        return (
          <group key={`sw_${gridId}_${col}_${row}`} position={[x, 0.05, z]}>
            <mesh position={[0, 0, -offZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[w, SIDEWALK_WIDTH]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[0, 0, offZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[w, SIDEWALK_WIDTH]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[-offX, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[SIDEWALK_WIDTH, d]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[offX, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[SIDEWALK_WIDTH, d]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
