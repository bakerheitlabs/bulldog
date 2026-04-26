import { CuboidCollider, RigidBody } from '@react-three/rapier';
import DrivableAirplane from '@/game/airplanes/DrivableAirplane';
import { AIRPORT } from './airport';

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

function RunwayMarkings() {
  const { centerX, centerZ, depth } = AIRPORT.runway;
  // Dashed centerline along the runway's long axis (Z).
  const dashLen = 12;
  const gap = 12;
  const halfDepth = depth / 2 - 30; // leave room for thresholds at each end
  const dashes: React.ReactNode[] = [];
  for (let z = -halfDepth; z <= halfDepth; z += dashLen + gap) {
    dashes.push(
      <FlatRect
        key={`rwc_${z}`}
        x={centerX}
        z={centerZ + z}
        width={1.2}
        depth={dashLen}
        y={PAINT_Y}
        color={RUNWAY_PAINT}
      />,
    );
  }
  // Threshold blocks at each runway end (8 stripes side by side).
  const threshold: React.ReactNode[] = [];
  const thrW = 2.5;
  const thrLen = 18;
  for (let i = -3; i <= 3; i++) {
    const x = centerX + i * (thrW + 1.2);
    threshold.push(
      <FlatRect
        key={`thrN_${i}`}
        x={x}
        z={centerZ - depth / 2 + thrLen / 2 + 4}
        width={thrW}
        depth={thrLen}
        y={PAINT_Y}
        color={RUNWAY_PAINT}
      />,
    );
    threshold.push(
      <FlatRect
        key={`thrS_${i}`}
        x={x}
        z={centerZ + depth / 2 - thrLen / 2 - 4}
        width={thrW}
        depth={thrLen}
        y={PAINT_Y}
        color={RUNWAY_PAINT}
      />,
    );
  }
  return (
    <group>
      {dashes}
      {threshold}
    </group>
  );
}

function TaxiwayMarkings() {
  const { centerX, centerZ, depth } = AIRPORT.taxiway;
  // Continuous yellow centerline (one long thin strip).
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

function Terminal() {
  const { centerX, centerZ, width, depth, height, color } = AIRPORT.terminal;
  const halfH = height / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[width / 2, halfH, depth / 2]} position={[centerX, halfH, centerZ]} />
      <mesh position={[centerX, halfH, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Window strip along the long sides — single dark band at mid height. */}
      <mesh position={[centerX + width / 2 + 0.01, halfH, centerZ]} castShadow>
        <boxGeometry args={[0.05, 3, depth - 4]} />
        <meshStandardMaterial color="#1d2530" />
      </mesh>
      <mesh position={[centerX - width / 2 - 0.01, halfH, centerZ]} castShadow>
        <boxGeometry args={[0.05, 3, depth - 4]} />
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

function ControlTower() {
  const { centerX, centerZ, width, depth, shaftHeight, cabinHeight, cabinWidth, color, cabinColor } =
    AIRPORT.tower;
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

function Hangar({
  centerX,
  centerZ,
  width,
  depth,
  height,
}: {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
}) {
  const halfH = height / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[width / 2, halfH, depth / 2]} position={[centerX, halfH, centerZ]} />
      {/* Body */}
      <mesh position={[centerX, halfH, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={HANGAR_BODY} />
      </mesh>
      {/* Hangar door panel facing the apron (west side, -x). */}
      <mesh
        position={[centerX - width / 2 - 0.05, halfH * 0.85, centerZ]}
        castShadow
      >
        <boxGeometry args={[0.1, height * 0.85, depth - 4]} />
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


export default function AirportRegion({ paused }: { paused: boolean }) {
  const padCx = (AIRPORT.pad.minX + AIRPORT.pad.maxX) / 2;
  const padCz = (AIRPORT.pad.minZ + AIRPORT.pad.maxZ) / 2;
  const padW = AIRPORT.pad.maxX - AIRPORT.pad.minX;
  const padD = AIRPORT.pad.maxZ - AIRPORT.pad.minZ;

  return (
    <group>
      {/* Base pad — flat developed land underneath everything else. Acts as
          the "ground" for the whole airport so it doesn't read as grass. */}
      <FlatRect x={padCx} z={padCz} width={padW} depth={padD} y={PAD_Y} color={PAD_COLOR} />

      {/* Apron, taxiway, runway in increasing west position. */}
      <FlatRect
        x={AIRPORT.apron.centerX}
        z={AIRPORT.apron.centerZ}
        width={AIRPORT.apron.width}
        depth={AIRPORT.apron.depth}
        y={APRON_Y}
        color={APRON_COLOR}
      />
      <FlatRect
        x={AIRPORT.taxiway.centerX}
        z={AIRPORT.taxiway.centerZ}
        width={AIRPORT.taxiway.width}
        depth={AIRPORT.taxiway.depth}
        y={TAXIWAY_Y}
        color={TAXIWAY_COLOR}
      />
      <FlatRect
        x={AIRPORT.runway.centerX}
        z={AIRPORT.runway.centerZ}
        width={AIRPORT.runway.width}
        depth={AIRPORT.runway.depth}
        y={RUNWAY_Y}
        color={RUNWAY_COLOR}
      />
      <RunwayMarkings />
      <TaxiwayMarkings />

      {/* Terminal-front parking lot — adjacent to highway terminus. */}
      <FlatRect
        x={AIRPORT.parkingLot.centerX}
        z={AIRPORT.parkingLot.centerZ}
        width={AIRPORT.parkingLot.width}
        depth={AIRPORT.parkingLot.depth}
        y={PARKING_Y}
        color={PARKING_COLOR}
      />

      <Terminal />
      <ControlTower />
      {AIRPORT.hangars.map((h, i) => (
        <Hangar key={`hangar_${i}`} {...h} />
      ))}
      {AIRPORT.planes.map((p, i) => (
        <DrivableAirplane
          key={`plane_${i}`}
          id={`airport_plane_${i}`}
          initialPos={[p.x, 0, p.z]}
          initialYaw={p.headingY}
          paused={paused}
        />
      ))}
    </group>
  );
}
