import { Text } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { allCells, BLOCK_SIZE, SIDEWALK_WIDTH } from './cityLayout';

const FOOTPRINT = BLOCK_SIZE - 2 * SIDEWALK_WIDTH - 4;

function GunstoreFront({ x, z, w, h }: { x: number; z: number; w: number; h: number }) {
  // The gunstore faces east (positive X) — that's where the road and player are.
  const faceX = x + FOOTPRINT / 2 + 0.01;
  return (
    <group>
      {/* awning */}
      <mesh position={[faceX + 0.5, h * 0.55, z]}>
        <boxGeometry args={[1, 0.4, w * 0.7]} />
        <meshStandardMaterial color="#c9302c" />
      </mesh>
      {/* sign panel */}
      <mesh position={[faceX, h * 0.7, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[w * 0.8, 2.4]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>
      <Text
        position={[faceX + 0.02, h * 0.7, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={1.6}
        color="#f5cb5c"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000"
      >
        GUNS
      </Text>
      {/* big window */}
      <mesh position={[faceX, h * 0.35, z + 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5, h * 0.45]} />
        <meshStandardMaterial color="#3a4a55" emissive="#1a2a30" />
      </mesh>
      {/* door */}
      <mesh position={[faceX, h * 0.22, z - 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2, h * 0.42]} />
        <meshStandardMaterial color="#2a1a0e" />
      </mesh>
      {/* door frame */}
      <mesh position={[faceX + 0.01, h * 0.45, z - 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 0.2]} />
        <meshStandardMaterial color="#c9302c" />
      </mesh>
    </group>
  );
}

export default function Buildings() {
  const cells = allCells();
  return (
    <group>
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind !== 'building') return null;
        const [x, , z] = center;
        const w = FOOTPRINT;
        const d = FOOTPRINT;
        const h = cell.height;
        const isGunstore = cell.tag === 'gunstore';
        const bodyColor = isGunstore ? '#a83a2c' : cell.color;
        return (
          <group key={`b_${col}_${row}`}>
            <RigidBody type="fixed" colliders="cuboid">
              <mesh position={[x, h / 2, z]} castShadow receiveShadow>
                <boxGeometry args={[w, h, d]} />
                <meshStandardMaterial color={bodyColor} />
              </mesh>
            </RigidBody>
            {/* roof accent */}
            <mesh position={[x, h + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#222" />
            </mesh>
            {isGunstore && <GunstoreFront x={x} z={z} w={w} h={h} />}
            {cell.tag === 'range' && (
              <Text
                position={[x, h + 1.5, z]}
                fontSize={1.2}
                color="#fff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.04}
                outlineColor="#000"
              >
                FIRING RANGE
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}
