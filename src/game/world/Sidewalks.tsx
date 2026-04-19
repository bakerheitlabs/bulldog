import { BLOCK_SIZE, SIDEWALK_WIDTH } from './cityLayout';
import { useVisibleCells } from './Chunks';

const SIDEWALK_COLOR = '#9a9aa3';

export default function Sidewalks() {
  const cells = useVisibleCells();
  const strip = BLOCK_SIZE;
  const o = BLOCK_SIZE / 2 - SIDEWALK_WIDTH / 2;

  return (
    <group>
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind === 'road') return null;
        const [x, , z] = center;
        return (
          <group key={`sw_${col}_${row}`} position={[x, 0.05, z]}>
            <mesh position={[0, 0, -o]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[strip, SIDEWALK_WIDTH]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[0, 0, o]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[strip, SIDEWALK_WIDTH]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[-o, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[SIDEWALK_WIDTH, strip]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
            <mesh position={[o, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[SIDEWALK_WIDTH, strip]} />
              <meshStandardMaterial color={SIDEWALK_COLOR} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
