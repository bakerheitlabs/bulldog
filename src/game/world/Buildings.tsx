import { Text } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { SIDEWALK_WIDTH, type BlockType } from './cityLayout';
import { useCityModel, useFitToBox, type ModelKey } from './cityAssets';
import GltfBoundary from './GltfBoundary';
import { useVisibleCells } from './Chunks';

const ALLEY_WIDTH = 2;
const ALLEY_COLOR = '#3a3d44';
const PLAZA_PAVING_COLOR = '#7a7b82';
const PLAZA_GRASS_COLOR = '#4b7a4a';
const WALL_COLOR = '#53565c';

const BUILDING_COLORS = [
  '#6a7280',
  '#7f6a4d',
  '#5f6b73',
  '#8b6f47',
  '#4a5a6a',
  '#7c5b3b',
  '#5a4f6c',
  '#3f524a',
];

// Tiny hashed RNG so sub-lot heights/colors are stable per (col,row,slot).
function hashRand(col: number, row: number, salt: number): number {
  let x = (col * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function GunstoreFront({ x, z, w, h }: { x: number; z: number; w: number; h: number }) {
  const faceX = x + w / 2 + 0.01;
  return (
    <group>
      <mesh position={[faceX + 0.5, h * 0.55, z]}>
        <boxGeometry args={[1, 0.4, w * 0.7]} />
        <meshStandardMaterial color="#c9302c" />
      </mesh>
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
      <mesh position={[faceX, h * 0.35, z + 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5, h * 0.45]} />
        <meshStandardMaterial color="#3a4a55" emissive="#1a2a30" />
      </mesh>
      <mesh position={[faceX, h * 0.22, z - 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2, h * 0.42]} />
        <meshStandardMaterial color="#2a1a0e" />
      </mesh>
      <mesh position={[faceX + 0.01, h * 0.45, z - 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 0.2]} />
        <meshStandardMaterial color="#c9302c" />
      </mesh>
    </group>
  );
}

type BuildingVisualProps = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  isGunstore: boolean;
};

function PrimitiveBuilding({ x, z, w, d, h, color, isGunstore }: BuildingVisualProps) {
  return (
    <group>
      <mesh position={[x, h / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[x, h + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {isGunstore && <GunstoreFront x={x} z={z} w={w} h={h} />}
    </group>
  );
}

function GltfBuilding({
  x,
  z,
  w,
  d,
  h,
  modelKey,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  modelKey: ModelKey;
}) {
  const scene = useCityModel(modelKey);
  const { scale, offset } = useFitToBox(scene, { w, h, d });
  return (
    <primitive
      object={scene}
      position={[x + offset[0], offset[1], z + offset[2]]}
      scale={scale}
    />
  );
}

type Lot = { x: number; z: number; w: number; d: number; h: number; color: string };

function subdivideLots(col: number, row: number, x: number, z: number, w: number, d: number): Lot[] {
  const lots: Lot[] = [];
  const rollSplit = hashRand(col, row, 7);
  // Aspect-driven split: long cells go 2x1 on long axis; squarish go 2x2.
  const ratio = w / d;
  let mode: '2x1' | '1x2' | '2x2';
  if (ratio > 1.25) mode = '2x1';
  else if (ratio < 0.8) mode = '1x2';
  else mode = rollSplit < 0.5 ? '2x1' : '2x2';

  const cellSeed = (slot: number) => {
    const rh = hashRand(col, row, 11 + slot);
    const rc = hashRand(col, row, 29 + slot);
    return {
      h: 8 + Math.floor(rh * 18),
      color: BUILDING_COLORS[Math.floor(rc * BUILDING_COLORS.length)],
    };
  };

  const pushLot = (lx: number, lz: number, lw: number, ld: number, slot: number) => {
    const { h, color } = cellSeed(slot);
    lots.push({ x: lx, z: lz, w: lw, d: ld, h, color });
  };

  if (mode === '2x1') {
    const subW = (w - ALLEY_WIDTH) / 2;
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z, subW, d, 0);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z, subW, d, 1);
  } else if (mode === '1x2') {
    const subD = (d - ALLEY_WIDTH) / 2;
    pushLot(x, z - subD / 2 - ALLEY_WIDTH / 2, w, subD, 0);
    pushLot(x, z + subD / 2 + ALLEY_WIDTH / 2, w, subD, 1);
  } else {
    const subW = (w - ALLEY_WIDTH) / 2;
    const subD = (d - ALLEY_WIDTH) / 2;
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z - subD / 2 - ALLEY_WIDTH / 2, subW, subD, 0);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z - subD / 2 - ALLEY_WIDTH / 2, subW, subD, 1);
    pushLot(x - subW / 2 - ALLEY_WIDTH / 2, z + subD / 2 + ALLEY_WIDTH / 2, subW, subD, 2);
    pushLot(x + subW / 2 + ALLEY_WIDTH / 2, z + subD / 2 + ALLEY_WIDTH / 2, subW, subD, 3);
  }
  return lots;
}

function AlleySurface({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={ALLEY_COLOR} />
    </mesh>
  );
}

function SubdividedBlock({
  col,
  row,
  x,
  z,
  w,
  d,
}: {
  col: number;
  row: number;
  x: number;
  z: number;
  w: number;
  d: number;
}) {
  const lots = subdivideLots(col, row, x, z, w, d);
  return (
    <group>
      {/* alley surface covers the full interior; sub-lot ground color shows through via buildings. */}
      <AlleySurface x={x} z={z} w={w} d={d} />
      {lots.map((lot, i) => (
        <group key={`sub_${col}_${row}_${i}`}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[lot.w / 2, lot.h / 2, lot.d / 2]}
              position={[lot.x, lot.h / 2, lot.z]}
            />
          </RigidBody>
          <PrimitiveBuilding
            x={lot.x}
            z={lot.z}
            w={lot.w}
            d={lot.d}
            h={lot.h}
            color={lot.color}
            isGunstore={false}
          />
        </group>
      ))}
    </group>
  );
}

function MixedBlock({
  col,
  row,
  x,
  z,
  w,
  d,
  h,
  color,
}: {
  col: number;
  row: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}) {
  // Split along the longer axis: one half building, other half lot.
  const alongX = w >= d;
  const halfW = alongX ? w / 2 - 0.4 : w;
  const halfD = alongX ? d : d / 2 - 0.4;
  const buildingOnFirstHalf = hashRand(col, row, 91) < 0.5;
  const sign = buildingOnFirstHalf ? -1 : 1;
  const bx = alongX ? x + sign * (w / 4 + 0.2) : x;
  const bz = alongX ? z : z + sign * (d / 4 + 0.2);
  const lx = alongX ? x - sign * (w / 4 + 0.2) : x;
  const lz = alongX ? z : z - sign * (d / 4 + 0.2);
  const lotW = alongX ? w / 2 - 0.4 : w;
  const lotD = alongX ? d : d / 2 - 0.4;

  // Low wall between building and lot, centered on the split line.
  const wallW = alongX ? 0.2 : w;
  const wallD = alongX ? d : 0.2;
  const wallX = alongX ? x + (buildingOnFirstHalf ? -0.4 : 0.4) * 0.5 : x;
  const wallZ = alongX ? z : z + (buildingOnFirstHalf ? -0.4 : 0.4) * 0.5;

  return (
    <group>
      {/* parking lot ground */}
      <mesh position={[lx, 0.03, lz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[lotW, lotD]} />
        <meshStandardMaterial color="#46464d" />
      </mesh>
      {/* low dividing wall */}
      <mesh position={[wallX, 0.5, wallZ]} castShadow>
        <boxGeometry args={[wallW, 1, wallD]} />
        <meshStandardMaterial color={WALL_COLOR} />
      </mesh>
      {/* building half */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[halfW / 2, h / 2, halfD / 2]} position={[bx, h / 2, bz]} />
      </RigidBody>
      <PrimitiveBuilding
        x={bx}
        z={bz}
        w={halfW}
        d={halfD}
        h={h}
        color={color}
        isGunstore={false}
      />
    </group>
  );
}

function PlazaBlock({
  col,
  row,
  x,
  z,
  w,
  d,
}: {
  col: number;
  row: number;
  x: number;
  z: number;
  w: number;
  d: number;
}) {
  const trees: React.ReactNode[] = [];
  const margin = 2;
  const usableW = w - margin * 2;
  const usableD = d - margin * 2;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Arrange around the perimeter of the interior.
    let tx: number;
    let tz: number;
    if (t < 0.25) {
      tx = x - usableW / 2 + (t / 0.25) * usableW;
      tz = z - usableD / 2;
    } else if (t < 0.5) {
      tx = x + usableW / 2;
      tz = z - usableD / 2 + ((t - 0.25) / 0.25) * usableD;
    } else if (t < 0.75) {
      tx = x + usableW / 2 - ((t - 0.5) / 0.25) * usableW;
      tz = z + usableD / 2;
    } else {
      tx = x - usableW / 2;
      tz = z + usableD / 2 - ((t - 0.75) / 0.25) * usableD;
    }
    trees.push(
      <group key={`plaza_tree_${col}_${row}_${i}`} position={[tx, 0, tz]}>
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
  // Paved plaza floor and a central fountain.
  return (
    <group>
      <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={PLAZA_PAVING_COLOR} />
      </mesh>
      <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[Math.min(w, d) * 0.18, Math.min(w, d) * 0.28, 20]} />
        <meshStandardMaterial color={PLAZA_GRASS_COLOR} />
      </mesh>
      <mesh position={[x, 0.5, z]} castShadow>
        <cylinderGeometry args={[1.2, 1.4, 1]} />
        <meshStandardMaterial color="#9ea3a8" />
      </mesh>
      <mesh position={[x, 1.4, z]} castShadow>
        <coneGeometry args={[0.4, 0.8, 8]} />
        <meshStandardMaterial color="#5b7a8c" />
      </mesh>
      {trees}
    </group>
  );
}

function StandardBlock({
  x,
  z,
  w,
  d,
  h,
  color,
  isGunstore,
  isRange,
  modelKey,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
  isGunstore: boolean;
  isRange: boolean;
  modelKey: ModelKey;
}) {
  const primitive = (
    <PrimitiveBuilding x={x} z={z} w={w} d={d} h={h} color={color} isGunstore={isGunstore} />
  );
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[x, h / 2, z]} />
      </RigidBody>
      <GltfBoundary fallback={primitive}>
        <GltfBuilding x={x} z={z} w={w} d={d} h={h} modelKey={modelKey} />
      </GltfBoundary>
      {isRange && (
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
}

export default function Buildings() {
  const cells = useVisibleCells();
  return (
    <group>
      {cells.map(({ col, row, cell, center, size }) => {
        if (cell.kind !== 'building') return null;
        if (cell.mergedInto) return null;
        let x = center[0];
        let z = center[2];
        let cw = size.width;
        let cd = size.depth;
        if (cell.mergedBounds) {
          const b = cell.mergedBounds;
          x = (b.minX + b.maxX) / 2;
          z = (b.minZ + b.maxZ) / 2;
          cw = b.maxX - b.minX;
          cd = b.maxZ - b.minZ;
        }
        const w = cw - SIDEWALK_WIDTH * 2;
        const d = cd - SIDEWALK_WIDTH * 2;
        const h = cell.height;
        const isGunstore = cell.tag === 'gunstore';
        const isRange = cell.tag === 'range';
        const bodyColor = isGunstore ? '#a83a2c' : cell.color;
        const modelKey: ModelKey = isGunstore ? 'buildingGunstore' : 'buildingGeneric';
        const type: BlockType = cell.blockType;
        return (
          <group key={`b_${col}_${row}`}>
            {type === 'standard' && (() => {
              // Per-building footprint and setback jitter so neighbors don't
              // read as a uniform wall. Tagged landmarks keep their full
              // footprint so the gunstore/range always sit where expected.
              let bx = x;
              let bz = z;
              let bw = w;
              let bd = d;
              if (!isGunstore && !isRange) {
                const scaleW = 0.65 + hashRand(col, row, 131) * 0.3;
                const scaleD = 0.65 + hashRand(col, row, 149) * 0.3;
                bw = w * scaleW;
                bd = d * scaleD;
                const slackX = w - bw;
                const slackZ = d - bd;
                bx = x + (hashRand(col, row, 157) - 0.5) * 0.5 * slackX;
                bz = z + (hashRand(col, row, 173) - 0.5) * 0.5 * slackZ;
              }
              return (
                <StandardBlock
                  x={bx}
                  z={bz}
                  w={bw}
                  d={bd}
                  h={h}
                  color={bodyColor}
                  isGunstore={isGunstore}
                  isRange={isRange}
                  modelKey={modelKey}
                />
              );
            })()}
            {type === 'subdivided' && (
              <SubdividedBlock col={col} row={row} x={x} z={z} w={w} d={d} />
            )}
            {type === 'mixed' && (
              <MixedBlock
                col={col}
                row={row}
                x={x}
                z={z}
                w={w}
                d={d}
                h={h}
                color={bodyColor}
              />
            )}
            {type === 'plaza' && (
              <PlazaBlock col={col} row={row} x={x} z={z} w={w} d={d} />
            )}
          </group>
        );
      })}
    </group>
  );
}
