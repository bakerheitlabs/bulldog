import { allCells, BLOCK_SIZE, ROAD_WIDTH } from './cityLayout';

const ROAD_COLOR = '#2d2d33';
const LINE_COLOR = '#d8c46a';

export default function Roads() {
  const cells = allCells();
  return (
    <group>
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind !== 'road') return null;
        const [x, , z] = center;
        return (
          <group key={`road_${col}_${row}`} position={[x, 0.01, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[BLOCK_SIZE, BLOCK_SIZE]} />
              <meshStandardMaterial color={ROAD_COLOR} />
            </mesh>
            {/* yellow centerline */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.4, BLOCK_SIZE * 0.9]} />
              <meshStandardMaterial color={LINE_COLOR} />
            </mesh>
            {/* curbs */}
            <mesh position={[-(ROAD_WIDTH / 2 + 0.1), 0.1, 0]}>
              <boxGeometry args={[0.2, 0.2, BLOCK_SIZE]} />
              <meshStandardMaterial color="#444" />
            </mesh>
            <mesh position={[ROAD_WIDTH / 2 + 0.1, 0.1, 0]}>
              <boxGeometry args={[0.2, 0.2, BLOCK_SIZE]} />
              <meshStandardMaterial color="#444" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
