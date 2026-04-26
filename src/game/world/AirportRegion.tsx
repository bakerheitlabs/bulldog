import { CuboidCollider, RigidBody } from '@react-three/rapier';
import DrivableAirplane from '@/game/airplanes/DrivableAirplane';
import ScheduledFlight from '@/game/airplanes/ScheduledFlight';
import type {
  AirportSpec,
  HangarSpec,
  TerminalSpec,
  TowerSpec,
} from './airport';
import { AIRPORTS } from './splineRegions';

const PAD_COLOR = '#3f4147';
const APRON_COLOR = '#4a4d54';
const RUNWAY_COLOR = '#1f2126';
const TAXIWAY_COLOR = '#26282d';
const PARKING_COLOR = '#46464d';
const RUNWAY_PAINT = '#f1f1f1';
const TAXI_PAINT = '#d8c46a';
const HANGAR_BODY = '#7c8089';
const HANGAR_DOOR = '#3a3d44';

// Y offsets so coplanar surfaces don't z-fight with the ground.
const PAD_Y = 0.03;
const APRON_Y = 0.04;
const TAXIWAY_Y = 0.05;
const RUNWAY_Y = 0.05;
const PARKING_Y = 0.04;
const PAINT_Y = 0.07;

function FlatRect({
  x,
  z,
  width,
  depth,
  y,
  color,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  color: string;
}) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// For axis='z' airports, the runway's long axis is Z (so `depth` is the long
// extent). For axis='x', the long axis is X (so `width` is long). The
// markings functions use this to lay out centerline dashes and threshold
// stripes along the correct axis.
function RunwayMarkings({ spec }: { spec: AirportSpec }) {
  const { centerX, centerZ, width, depth } = spec.runway;
  const long = spec.axis === 'z' ? depth : width;
  const dashLen = 12;
  const gap = 12;
  const halfLong = long / 2 - 30; // leave room for thresholds at each end
  const dashes: React.ReactNode[] = [];
  for (let s = -halfLong; s <= halfLong; s += dashLen + gap) {
    if (spec.axis === 'z') {
      dashes.push(
        <FlatRect
          key={`rwc_${s}`}
          x={centerX}
          z={centerZ + s}
          width={1.2}
          depth={dashLen}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
    } else {
      dashes.push(
        <FlatRect
          key={`rwc_${s}`}
          x={centerX + s}
          z={centerZ}
          width={dashLen}
          depth={1.2}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
    }
  }
  // Threshold blocks at each runway end (8 stripes side by side, perpendicular
  // to the runway long axis).
  const threshold: React.ReactNode[] = [];
  const thrW = 2.5;
  const thrLen = 18;
  for (let i = -3; i <= 3; i++) {
    const off = i * (thrW + 1.2);
    if (spec.axis === 'z') {
      threshold.push(
        <FlatRect
          key={`thrA_${i}`}
          x={centerX + off}
          z={centerZ - depth / 2 + thrLen / 2 + 4}
          width={thrW}
          depth={thrLen}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
      threshold.push(
        <FlatRect
          key={`thrB_${i}`}
          x={centerX + off}
          z={centerZ + depth / 2 - thrLen / 2 - 4}
          width={thrW}
          depth={thrLen}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
    } else {
      threshold.push(
        <FlatRect
          key={`thrA_${i}`}
          x={centerX - width / 2 + thrLen / 2 + 4}
          z={centerZ + off}
          width={thrLen}
          depth={thrW}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
      threshold.push(
        <FlatRect
          key={`thrB_${i}`}
          x={centerX + width / 2 - thrLen / 2 - 4}
          z={centerZ + off}
          width={thrLen}
          depth={thrW}
          y={PAINT_Y}
          color={RUNWAY_PAINT}
        />,
      );
    }
  }
  return (
    <group>
      {dashes}
      {threshold}
    </group>
  );
}

function TaxiwayMarkings({ spec }: { spec: AirportSpec }) {
  const { centerX, centerZ, width, depth } = spec.taxiway;
  if (spec.axis === 'z') {
    return (
      <FlatRect
        x={centerX}
        z={centerZ}
        width={0.3}
        depth={depth - 8}
        y={PAINT_Y}
        color={TAXI_PAINT}
      />
    );
  }
  return (
    <FlatRect
      x={centerX}
      z={centerZ}
      width={width - 8}
      depth={0.3}
      y={PAINT_Y}
      color={TAXI_PAINT}
    />
  );
}

function Terminal({ spec }: { spec: TerminalSpec }) {
  const { centerX, centerZ, width, depth, height, color } = spec;
  const halfH = height / 2;
  const trim = 4;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[width / 2, halfH, depth / 2]} position={[centerX, halfH, centerZ]} />
      <mesh position={[centerX, halfH, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Window strip along the long sides — single dark band at mid height. */}
      <mesh position={[centerX + width / 2 + 0.01, halfH, centerZ]} castShadow>
        <boxGeometry args={[0.05, Math.min(3, height - 2), Math.max(1, depth - trim)]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      <mesh position={[centerX - width / 2 - 0.01, halfH, centerZ]} castShadow>
        <boxGeometry args={[0.05, Math.min(3, height - 2), Math.max(1, depth - trim)]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      {/* Roof line accent. */}
      <mesh position={[centerX, height + 0.4, centerZ]} castShadow>
        <boxGeometry args={[width + 1, 0.8, depth + 1]} />
        <meshStandardMaterial color="#5a5d63" />
      </mesh>
    </RigidBody>
  );
}

function ControlTower({ spec }: { spec: TowerSpec }) {
  const { centerX, centerZ, width, depth, shaftHeight, cabinHeight, cabinWidth, color, cabinColor } =
    spec;
  const shaftHalf = shaftHeight / 2;
  const cabinY = shaftHeight + cabinHeight / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Shaft */}
      <CuboidCollider
        args={[width / 2, shaftHalf, depth / 2]}
        position={[centerX, shaftHalf, centerZ]}
      />
      <mesh position={[centerX, shaftHalf, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[width, shaftHeight, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Cabin (wider than shaft, tinted glass) */}
      <CuboidCollider
        args={[cabinWidth / 2, cabinHeight / 2, cabinWidth / 2]}
        position={[centerX, cabinY, centerZ]}
      />
      <mesh position={[centerX, cabinY, centerZ]} castShadow>
        <boxGeometry args={[cabinWidth, cabinHeight, cabinWidth]} />
        <meshStandardMaterial color={cabinColor} />
      </mesh>
      {/* Cabin roof cap */}
      <mesh position={[centerX, shaftHeight + cabinHeight + 0.5, centerZ]} castShadow>
        <boxGeometry args={[cabinWidth + 1, 1, cabinWidth + 1]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
    </RigidBody>
  );
}

function Hangar({ spec }: { spec: HangarSpec }) {
  const { centerX, centerZ, width, depth, height, doorFacing = '-x' } = spec;
  const halfH = height / 2;
  // Position the door panel just outside the hangar on the chosen face.
  let doorX = centerX;
  let doorZ = centerZ;
  let doorW = 0.1;
  let doorD = depth - 4;
  let doorH = height * 0.85;
  if (doorFacing === '-x') {
    doorX = centerX - width / 2 - 0.05;
    doorD = depth - 4;
    doorW = 0.1;
  } else if (doorFacing === '+x') {
    doorX = centerX + width / 2 + 0.05;
    doorD = depth - 4;
    doorW = 0.1;
  } else if (doorFacing === '-z') {
    doorZ = centerZ - depth / 2 - 0.05;
    doorW = width - 4;
    doorD = 0.1;
  } else {
    // +z
    doorZ = centerZ + depth / 2 + 0.05;
    doorW = width - 4;
    doorD = 0.1;
  }
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[width / 2, halfH, depth / 2]} position={[centerX, halfH, centerZ]} />
      {/* Body */}
      <mesh position={[centerX, halfH, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={HANGAR_BODY} />
      </mesh>
      {/* Hangar door panel facing the apron. */}
      <mesh position={[doorX, halfH * 0.85, doorZ]} castShadow>
        <boxGeometry args={[doorW, doorH, doorD]} />
        <meshStandardMaterial color={HANGAR_DOOR} />
      </mesh>
      {/* Roof ridge */}
      <mesh position={[centerX, height + 0.5, centerZ]} castShadow>
        <boxGeometry args={[width + 1, 1, depth + 1]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
    </RigidBody>
  );
}

function Airport({ spec, paused }: { spec: AirportSpec; paused: boolean }) {
  const padCx = (spec.pad.minX + spec.pad.maxX) / 2;
  const padCz = (spec.pad.minZ + spec.pad.maxZ) / 2;
  const padW = spec.pad.maxX - spec.pad.minX;
  const padD = spec.pad.maxZ - spec.pad.minZ;

  return (
    <group>
      <FlatRect x={padCx} z={padCz} width={padW} depth={padD} y={PAD_Y} color={PAD_COLOR} />
      <FlatRect
        x={spec.apron.centerX}
        z={spec.apron.centerZ}
        width={spec.apron.width}
        depth={spec.apron.depth}
        y={APRON_Y}
        color={APRON_COLOR}
      />
      <FlatRect
        x={spec.taxiway.centerX}
        z={spec.taxiway.centerZ}
        width={spec.taxiway.width}
        depth={spec.taxiway.depth}
        y={TAXIWAY_Y}
        color={TAXIWAY_COLOR}
      />
      <FlatRect
        x={spec.runway.centerX}
        z={spec.runway.centerZ}
        width={spec.runway.width}
        depth={spec.runway.depth}
        y={RUNWAY_Y}
        color={RUNWAY_COLOR}
      />
      <RunwayMarkings spec={spec} />
      <TaxiwayMarkings spec={spec} />
      <FlatRect
        x={spec.parkingLot.centerX}
        z={spec.parkingLot.centerZ}
        width={spec.parkingLot.width}
        depth={spec.parkingLot.depth}
        y={PARKING_Y}
        color={PARKING_COLOR}
      />
      <Terminal spec={spec.terminal} />
      <ControlTower spec={spec.tower} />
      {spec.hangars.map((h, i) => (
        <Hangar key={`${spec.id}_hangar_${i}`} spec={h} />
      ))}
      {spec.planes.map((p, i) => (
        <DrivableAirplane
          key={`${spec.id}_plane_${i}`}
          id={`${spec.id}_plane_${i}`}
          initialPos={[p.x, 0, p.z]}
          initialYaw={p.headingY}
          paused={paused}
        />
      ))}
      {spec.hostsScheduledFlight && <ScheduledFlight paused={paused} />}
    </group>
  );
}

export default function AirportRegion({ paused }: { paused: boolean }) {
  return (
    <group>
      {AIRPORTS.map((spec) => (
        <Airport key={spec.id} spec={spec} paused={paused} />
      ))}
    </group>
  );
}
