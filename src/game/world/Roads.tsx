import { BLOCK_SIZE, ROAD_WIDTH } from './cityLayout';
import { useVisibleCells } from './Chunks';

const ROAD_COLOR = '#2d2d33';
const LINE_COLOR = '#d8c46a';
const EDGE_COLOR = '#f2f2f2';
const CURB_COLOR = '#444';
const LINE_WIDTH = 0.3;
const EDGE_LINE_WIDTH = 0.15;
const STOP_LINE_WIDTH = 0.5;

function SurfaceSegment() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[BLOCK_SIZE, BLOCK_SIZE]} />
      <meshStandardMaterial color={ROAD_COLOR} />
    </mesh>
  );
}

function VerticalRoad({ parkingSide }: { parkingSide: 'none' | 'left' | 'right' | 'both' }) {
  // N-S road: centerline along z; curbs along z on ±x.
  // parkingSide 'both' → street parking on both curb sides (visual only; slots handled elsewhere).
  void parkingSide;
  return (
    <group>
      <SurfaceSegment />
      {/* Yellow centerline */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LINE_WIDTH, BLOCK_SIZE * 0.9]} />
        <meshStandardMaterial color={LINE_COLOR} />
      </mesh>
      {/* White edge stripes */}
      <mesh position={[-ROAD_WIDTH / 2 + 0.2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[EDGE_LINE_WIDTH, BLOCK_SIZE * 0.95]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2 - 0.2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[EDGE_LINE_WIDTH, BLOCK_SIZE * 0.95]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      {/* Curbs */}
      <mesh position={[-(ROAD_WIDTH / 2 + 0.1), 0.1, 0]}>
        <boxGeometry args={[0.2, 0.2, BLOCK_SIZE]} />
        <meshStandardMaterial color={CURB_COLOR} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2 + 0.1, 0.1, 0]}>
        <boxGeometry args={[0.2, 0.2, BLOCK_SIZE]} />
        <meshStandardMaterial color={CURB_COLOR} />
      </mesh>
    </group>
  );
}

function HorizontalRoad({ parkingSide }: { parkingSide: 'none' | 'left' | 'right' | 'both' }) {
  void parkingSide;
  return (
    <group>
      <SurfaceSegment />
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[LINE_WIDTH, BLOCK_SIZE * 0.9]} />
        <meshStandardMaterial color={LINE_COLOR} />
      </mesh>
      <mesh position={[0, 0.01, -ROAD_WIDTH / 2 + 0.2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[EDGE_LINE_WIDTH, BLOCK_SIZE * 0.95]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[0, 0.01, ROAD_WIDTH / 2 - 0.2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[EDGE_LINE_WIDTH, BLOCK_SIZE * 0.95]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[0, 0.1, -(ROAD_WIDTH / 2 + 0.1)]}>
        <boxGeometry args={[BLOCK_SIZE, 0.2, 0.2]} />
        <meshStandardMaterial color={CURB_COLOR} />
      </mesh>
      <mesh position={[0, 0.1, ROAD_WIDTH / 2 + 0.1]}>
        <boxGeometry args={[BLOCK_SIZE, 0.2, 0.2]} />
        <meshStandardMaterial color={CURB_COLOR} />
      </mesh>
    </group>
  );
}

function Intersection() {
  // No curbs / centerline — just asphalt + stop lines on each approach and
  // faint crosswalk stripes.
  const half = ROAD_WIDTH / 2;
  const crosswalk = (angle: number, offset: number) => (
    <group rotation={[0, angle, 0]} position={[0, 0.012, 0]}>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={i}
          position={[-3.5 + i * 1.75, 0, offset]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.8, 1.4]} />
          <meshStandardMaterial color={EDGE_COLOR} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group>
      <SurfaceSegment />
      {/* Stop lines for each approach (drivers about to enter the intersection). */}
      <mesh position={[0, 0.013, half + 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROAD_WIDTH, STOP_LINE_WIDTH]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[0, 0.013, -half - 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROAD_WIDTH, STOP_LINE_WIDTH]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[half + 0.2, 0.013, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[ROAD_WIDTH, STOP_LINE_WIDTH]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      <mesh position={[-half - 0.2, 0.013, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[ROAD_WIDTH, STOP_LINE_WIDTH]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
      {crosswalk(0, half + 1.2)}
      {crosswalk(0, -half - 1.2)}
      {crosswalk(Math.PI / 2, half + 1.2)}
      {crosswalk(Math.PI / 2, -half - 1.2)}
    </group>
  );
}

export default function Roads() {
  const cells = useVisibleCells();
  return (
    <group>
      {cells.map(({ col, row, cell, center }) => {
        if (cell.kind !== 'road') return null;
        const [x, , z] = center;
        return (
          <group key={`road_${col}_${row}`} position={[x, 0.01, z]}>
            {cell.isIntersection ? (
              <Intersection />
            ) : cell.carriesNS ? (
              <VerticalRoad parkingSide={cell.parkingLane} />
            ) : (
              <HorizontalRoad parkingSide={cell.parkingLane} />
            )}
          </group>
        );
      })}
    </group>
  );
}
