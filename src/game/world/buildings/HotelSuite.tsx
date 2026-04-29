import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo } from 'react';
import { useGameStore, hotelRoomActive } from '@/state/gameStore';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { clearPrompt, setPrompt } from '@/game/interactions/interactionState';
import { startElevator } from './elevatorState';
import { HOTEL_TIERS } from './hotelTiers';
import type { HotelRoomTier } from '@/save/schema';

const SUITE_H = 3;
const WALL_T = 0.3;
const ELEV_DOOR_W = 1.4;

// One rented suite, drawn at the floor altitude `y`. Walls + colliders form
// a closed room with a single gap on the north wall for the elevator. The
// elevator-down trigger is a sensor inside that gap, and bed/desk/wardrobe
// each use a useFrame proximity check to publish their own E-prompt.
export default function HotelSuite({
  centerX,
  centerZ,
  y,
  tier,
  lobbyEntryPos,
  onOpenSleep,
  onOpenStash,
  onSave,
}: {
  centerX: number;
  centerZ: number;
  y: number;
  tier: HotelRoomTier;
  lobbyEntryPos: [number, number, number];
  onOpenSleep: () => void;
  onOpenStash: () => void;
  onSave: () => void;
}) {
  const def = HOTEL_TIERS[tier];
  const w = def.size.w;
  const d = def.size.d;

  const halfW = w / 2;
  const halfD = d / 2;

  // Room bounds (outer wall faces). The north wall is fully solid — the
  // elevator's "door" is purely a visual panel and the descent sensor sits
  // just south of it. A real doorway gap let the camera raycast escape
  // through the wall (same problem we solved for the church) since the
  // wall-pushback ray would find no collider in the gap.
  const northZ = centerZ - halfD;
  const southZ = centerZ + halfD;
  const westX = centerX - halfW;
  const eastX = centerX + halfW;

  // Bed: south wall, head against the wall, foot facing north.
  const bedW = tier === 'penthouse' ? 2.4 : tier === 'deluxe' ? 2.0 : 1.4;
  const bedD = 2.0;
  const bedX = centerX - halfW * 0.4;
  const bedZ = southZ - bedD / 2 - 0.2;

  // Desk: west wall.
  const deskW = 1.6;
  const deskD = 0.7;
  const deskX = westX + deskD / 2 + 0.25;
  const deskZ = centerZ + halfD * 0.25;

  // Wardrobe: east wall, between bed and elevator door.
  const wardW = 0.8;
  const wardD = 1.4;
  const wardX = eastX - wardW / 2 - 0.15;
  const wardZ = centerZ + halfD * 0.1;

  // Elevator-down sensor sits inside the northern doorway, just inside the
  // suite. Stepping into it returns the player to the lobby entry.
  const sensorZ = northZ + 0.6;

  return (
    <group>
      {/* Floor + collider so the player can stand on this level even though
          we're high above ground. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[halfW, 0.05, halfD]} position={[centerX, y + 0.05, centerZ]} />
      </RigidBody>
      <mesh
        position={[centerX, y + 0.06, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={def.carpetColor} />
      </mesh>

      {/* Ceiling — collider keeps the third-person camera from craning up
          through the roof when the player tilts the view skyward. Without
          this, the wall-pushback ray finds no surface above the ceiling
          mesh and the camera exits the suite. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[w / 2, 0.05, d / 2]}
          position={[centerX, y + SUITE_H + 0.05, centerZ]}
        />
      </RigidBody>
      <mesh
        position={[centerX, y + SUITE_H, centerZ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#cfc4a6" side={THREE.DoubleSide} />
      </mesh>

      {/* South wall */}
      <SolidWall
        cx={centerX}
        cy={y + SUITE_H / 2}
        cz={southZ - WALL_T / 2}
        sx={w}
        sy={SUITE_H}
        sz={WALL_T}
        color="#e8dfca"
      />
      {/* East wall (window opening rendered as emissive panel inset) */}
      <SolidWall
        cx={eastX - WALL_T / 2}
        cy={y + SUITE_H / 2}
        cz={centerZ}
        sx={WALL_T}
        sy={SUITE_H}
        sz={d}
        color="#e8dfca"
      />
      <mesh position={[eastX - WALL_T / 2 - 0.01, y + SUITE_H * 0.55, centerZ - halfD * 0.25]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[Math.min(d * 0.45, 3.5), SUITE_H * 0.55]} />
        <meshStandardMaterial
          color="#1f3550"
          emissive="#86a4ce"
          emissiveIntensity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* West wall */}
      <SolidWall
        cx={westX + WALL_T / 2}
        cy={y + SUITE_H / 2}
        cz={centerZ}
        sx={WALL_T}
        sy={SUITE_H}
        sz={d}
        color="#e8dfca"
      />
      {/* North wall: solid across the full width. The visual elevator door
          panel below is decorative; descent fires from the sensor in front
          of it before the player reaches the wall. */}
      <SolidWall
        cx={centerX}
        cy={y + SUITE_H / 2}
        cz={northZ + WALL_T / 2}
        sx={w}
        sy={SUITE_H}
        sz={WALL_T}
        color="#e8dfca"
      />

      {/* Decorative elevator door panel inside the suite, centered on the
          gap. Marks the return ride visually so players know where to stand. */}
      <mesh position={[centerX, y + 1.3, northZ + 0.05]}>
        <boxGeometry args={[ELEV_DOOR_W * 0.95, 2.4, 0.05]} />
        <meshStandardMaterial color="#7a7d83" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[centerX, y + 2.7, northZ + 0.06]}>
        <planeGeometry args={[0.45, 0.18]} />
        <meshStandardMaterial color="#1a0e08" emissive="#ff5040" emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Bed: frame, mattress, pillow */}
      <mesh position={[bedX, y + 0.25, bedZ]} castShadow>
        <boxGeometry args={[bedW, 0.5, bedD]} />
        <meshStandardMaterial color="#5a3a20" />
      </mesh>
      <mesh position={[bedX, y + 0.6, bedZ]} castShadow>
        <boxGeometry args={[bedW - 0.1, 0.2, bedD - 0.1]} />
        <meshStandardMaterial color="#dcd2bf" />
      </mesh>
      <mesh position={[bedX, y + 0.78, bedZ + bedD / 2 - 0.35]} castShadow>
        <boxGeometry args={[bedW * 0.4, 0.12, 0.4]} />
        <meshStandardMaterial color="#f4eee0" />
      </mesh>
      {/* Headboard against south wall */}
      <mesh position={[bedX, y + 0.9, bedZ + bedD / 2 + 0.05]} castShadow>
        <boxGeometry args={[bedW + 0.2, 1.1, 0.1]} />
        <meshStandardMaterial color="#3e2710" />
      </mesh>

      {/* Bedside table + lamp */}
      <mesh position={[bedX + bedW / 2 + 0.4, y + 0.3, bedZ + bedD / 2 - 0.2]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <meshStandardMaterial color="#3e2710" />
      </mesh>
      <pointLight
        position={[bedX + bedW / 2 + 0.4, y + 0.95, bedZ + bedD / 2 - 0.2]}
        intensity={6}
        distance={4.5}
        decay={1.6}
        color="#ffd9a0"
      />
      <mesh position={[bedX + bedW / 2 + 0.4, y + 0.85, bedZ + bedD / 2 - 0.2]}>
        <coneGeometry args={[0.18, 0.3, 12]} />
        <meshStandardMaterial color="#fff5d8" emissive="#ffd9a0" emissiveIntensity={1} toneMapped={false} />
      </mesh>

      {/* Desk + chair */}
      <mesh position={[deskX, y + 0.55, deskZ]} castShadow>
        <boxGeometry args={[deskD, 0.05, deskW]} />
        <meshStandardMaterial color="#3a2818" />
      </mesh>
      <mesh position={[deskX, y + 0.275, deskZ - deskW / 2 + 0.1]} castShadow>
        <boxGeometry args={[deskD - 0.05, 0.55, 0.08]} />
        <meshStandardMaterial color="#3a2818" />
      </mesh>
      <mesh position={[deskX, y + 0.275, deskZ + deskW / 2 - 0.1]} castShadow>
        <boxGeometry args={[deskD - 0.05, 0.55, 0.08]} />
        <meshStandardMaterial color="#3a2818" />
      </mesh>
      <mesh position={[deskX + 0.5, y + 0.25, deskZ]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#1f1f25" />
      </mesh>

      {/* Wardrobe */}
      <mesh position={[wardX, y + 1.1, wardZ]} castShadow>
        <boxGeometry args={[wardW, 2.2, wardD]} />
        <meshStandardMaterial color="#3e2710" />
      </mesh>
      <mesh position={[wardX - wardW / 2 - 0.01, y + 1.1, wardZ]}>
        <planeGeometry args={[0.02, 1.8]} />
        <meshStandardMaterial color="#caa055" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Ceiling can-light */}
      <pointLight
        position={[centerX, y + SUITE_H - 0.2, centerZ]}
        intensity={50}
        distance={12}
        decay={1.5}
        color="#fff6d0"
      />
      <mesh position={[centerX, y + SUITE_H - 0.05, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff6d0" emissiveIntensity={0.8} />
      </mesh>

      {/* Elevator-down sensor */}
      <ElevatorDownSensor
        cx={centerX}
        cy={y + 1}
        cz={sensorZ}
        targetPos={lobbyEntryPos}
      />

      <BedTrigger x={bedX} y={y} z={bedZ} onOpen={onOpenSleep} />
      <DeskTrigger x={deskX} y={y} z={deskZ} onSave={onSave} />
      <WardrobeTrigger x={wardX} y={y} z={wardZ} onOpen={onOpenStash} />
    </group>
  );
}

function SolidWall({
  cx,
  cy,
  cz,
  sx,
  sy,
  sz,
  color,
}: {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
}) {
  if (sx <= 0 || sy <= 0 || sz <= 0) return null;
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} position={[cx, cy, cz]} />
      </RigidBody>
      <mesh position={[cx, cy, cz]} castShadow receiveShadow>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function ElevatorDownSensor({
  cx,
  cy,
  cz,
  targetPos,
}: {
  cx: number;
  cy: number;
  cz: number;
  targetPos: [number, number, number];
}) {
  // Sensor rather than proximity check: the player explicitly walks into the
  // elevator footprint to descend. onIntersectionEnter fires once per entry.
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[0.6, 1, 0.5]}
        position={[cx, cy, cz]}
        sensor
        onIntersectionEnter={(payload) => {
          // Only react to the player's body. Rapier passes the rigidBody
          // userData; the player is the only dynamic body that walks into
          // suite-floor sensors, but be defensive in case future NPCs ever
          // ride the elevator.
          if (!payload.rigidBody || payload.rigidBody.bodyType() !== 0) return;
          startElevator({ targetPos, label: 'Lobby' });
        }}
      />
    </RigidBody>
  );
}

function BedTrigger({ x, y, z, onOpen }: { x: number; y: number; z: number; onOpen: () => void }) {
  const pos = useMemo(() => new THREE.Vector3(x, y, z), [x, y, z]);
  useFrame(() => updateProximityPrompt('hotel-bed', pos, onOpen, 'Press E to sleep'));
  return null;
}

function DeskTrigger({ x, y, z, onSave }: { x: number; y: number; z: number; onSave: () => void }) {
  const pos = useMemo(() => new THREE.Vector3(x, y, z), [x, y, z]);
  useFrame(() => updateProximityPrompt('hotel-desk-save', pos, onSave, 'Press E to save game'));
  return null;
}

function WardrobeTrigger({ x, y, z, onOpen }: { x: number; y: number; z: number; onOpen: () => void }) {
  const pos = useMemo(() => new THREE.Vector3(x, y, z), [x, y, z]);
  useFrame(() => updateProximityPrompt('hotel-wardrobe', pos, onOpen, 'Press E to access stash'));
  return null;
}

const RANGE = 1.6;

function updateProximityPrompt(
  id: string,
  target: THREE.Vector3,
  onActivate: () => void,
  label: string,
) {
  if (useVehicleStore.getState().drivenCarId) {
    clearPrompt(id);
    return;
  }
  const s = useGameStore.getState();
  // Only react when the rented room is current — avoid stale prompts on a
  // tier the player no longer has.
  if (!hotelRoomActive(s)) {
    clearPrompt(id);
    return;
  }
  const pp = s.player.position;
  const dx = pp[0] - target.x;
  const dy = pp[1] - target.y;
  const dz = pp[2] - target.z;
  // Use 3D distance — suites are stacked vertically, so the same XZ point
  // exists on every floor and a 2D check would fire from another level.
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq >= RANGE * RANGE) {
    clearPrompt(id);
    return;
  }
  setPrompt({ id, label, onActivate });
}
