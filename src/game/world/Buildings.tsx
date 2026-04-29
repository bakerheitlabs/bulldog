import { Text } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { SIDEWALK_WIDTH, type BlockType } from './cityLayout';
import { useCityModel, useFitToBox, type ModelKey } from './cityAssets';
import GltfBoundary from './GltfBoundary';
import { useVisibleCells } from './Chunks';
import Church from './buildings/Church';
import Stadium from './buildings/Stadium';
import Marina from './buildings/Marina';
import Hotel from './buildings/Hotel';

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

function MechanicShop({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  // Open-front bay: three walls with the east face (+X) left open so a car
  // can drive in from the road.
  const wallH = 3;
  const wallT = 0.4;
  const roofY = wallH + 0.1;
  const signX = x + w / 2 + 0.05;
  return (
    <group>
      {/* concrete floor */}
      <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#565962" />
      </mesh>
      {/* back wall (west) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[wallT / 2, wallH / 2, d / 2]}
          position={[x - w / 2 + wallT / 2, wallH / 2, z]}
        />
      </RigidBody>
      <mesh position={[x - w / 2 + wallT / 2, wallH / 2, z]} castShadow>
        <boxGeometry args={[wallT, wallH, d]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
      {/* north side wall */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[w / 2, wallH / 2, wallT / 2]}
          position={[x, wallH / 2, z - d / 2 + wallT / 2]}
        />
      </RigidBody>
      <mesh position={[x, wallH / 2, z - d / 2 + wallT / 2]} castShadow>
        <boxGeometry args={[w, wallH, wallT]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
      {/* south side wall */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[w / 2, wallH / 2, wallT / 2]}
          position={[x, wallH / 2, z + d / 2 - wallT / 2]}
        />
      </RigidBody>
      <mesh position={[x, wallH / 2, z + d / 2 - wallT / 2]} castShadow>
        <boxGeometry args={[w, wallH, wallT]} />
        <meshStandardMaterial color="#3a3d44" />
      </mesh>
      {/* roof */}
      <mesh position={[x, roofY, z]} castShadow>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color="#2a2c32" />
      </mesh>
      {/* sign band above bay opening */}
      <mesh position={[signX - 0.3, wallH + 0.5, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[Math.min(d, 8), 1.2]} />
        <meshStandardMaterial color="#1a1a20" />
      </mesh>
      <Text
        position={[signX - 0.25, wallH + 0.5, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.9}
        color="#f5cb5c"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000"
      >
        MECHANIC
      </Text>
      {/* in-bay hint visible when the driver pulls in */}
      <Text
        position={[x - w / 2 + 0.5, 2.4, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.45}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#000"
      >
        PRESS P TO REPAINT
      </Text>
      {/* car lift post inside the bay */}
      <mesh position={[x - w / 4, 0.6, z]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 1.2, 10]} />
        <meshStandardMaterial color="#a6a8ac" />
      </mesh>
      {/* tool cart */}
      <mesh position={[x - w / 2 + 1.2, 0.4, z + d / 2 - 1.2]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.5]} />
        <meshStandardMaterial color="#c94a2a" />
      </mesh>
    </group>
  );
}

function Wall({
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
        <meshStandardMaterial color={color} />
      </mesh>
    </>
  );
}

function HospitalInterior({
  x,
  z,
  w,
  d,
  h,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}) {
  // Real-hospital layout under the exterior shell:
  //   - 4.5m interior ceiling (raised from 3m so rooms don't feel cramped)
  //   - East entrance opens into a lobby with reception + waiting chairs
  //   - A central east-west corridor pierces the lobby wall and reaches the
  //     west end, with four rooms off it: trauma bay + exam 1 on the north
  //     side, nurse station + exam 2 on the south.
  //   - Perimeter walls run full-height so the exterior shell stays solid;
  //     interior partitions only reach the ceiling.
  const wallT = 0.4;
  const doorW = 4;
  const doorHalf = doorW / 2;
  const ceilingH = 4.5;
  const intDoorW = 2.0;
  const intDoorHalf = intDoorW / 2;

  const faceX = x + w / 2;
  const westX = x - w / 2;
  const northZ = z - d / 2;
  const southZ = z + d / 2;
  const innerNorthZ = northZ + wallT;
  const innerSouthZ = southZ - wallT;

  // Lobby sits on the east 7m; medical zone occupies the rest.
  const lobbyDepth = 7;
  const lobbyWallX = faceX - lobbyDepth;
  const medWest = westX + wallT;
  const medEast = lobbyWallX - wallT / 2;
  const medLen = medEast - medWest;
  const medMidX = medWest + medLen / 2;

  const corridorHalf = 1.5;
  const corridorNorth = z - corridorHalf;
  const corridorSouth = z + corridorHalf;

  const traumaDoorX = medWest + medLen / 4;
  const exam1DoorX = medWest + (3 * medLen) / 4;
  const nurseDoorX = traumaDoorX;
  const exam2DoorX = exam1DoorX;

  const traumaCx = (medWest + medMidX) / 2;
  const exam1Cx = (medMidX + medEast) / 2;
  const nurseCx = traumaCx;
  const exam2Cx = exam1Cx;
  const traumaCz = (innerNorthZ + corridorNorth) / 2;
  const exam1Cz = traumaCz;
  const nurseCz = (corridorSouth + innerSouthZ) / 2;
  const exam2Cz = nurseCz;

  // East facade door split.
  const eSegLen = d / 2 - doorHalf;
  const eNorthZ = z - (d / 2 + doorHalf) / 2;
  const eSouthZ = z + (d / 2 + doorHalf) / 2;

  // Lintel above east door (closes the exterior shell above ceiling).
  const lintelH = h - ceilingH;
  const lintelY = ceilingH + lintelH / 2;

  const roofY = h + 0.08;
  const crossArmL = Math.min(w, d) * 0.55;
  const crossArmT = Math.min(w, d) * 0.16;

  const wallColor = '#eef1f4';
  const innerColor = '#f2f4f7';
  const trimColor = '#d93a34';
  const floorColor = '#e4e6ea';
  const ceilingColor = '#c8ccd2';

  // Reception desk — in the lobby, flanking the corridor opening on the
  // north side so patients entering the east door see it to their right.
  const deskX = lobbyWallX + 0.8;
  const deskZ = z - 2.5;

  const ceilingLights: [number, number][] = [
    [faceX - 2, z],
    [(medEast + lobbyWallX) / 2, z],
    [x, z],
    [medWest + 2, z],
    [traumaCx, traumaCz],
    [exam1Cx, exam1Cz],
    [nurseCx, nurseCz],
    [exam2Cx, exam2Cz],
  ];

  return (
    <group>
      {/* floor */}
      <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      {/* red wayfinding stripe down the corridor and out the front door */}
      <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, 0.5]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>

      {/* === Perimeter walls (full h) === */}
      <Wall cx={westX + wallT / 2} cy={h / 2} cz={z} sx={wallT} sy={h} sz={d} color={wallColor} />
      <Wall cx={x} cy={h / 2} cz={northZ + wallT / 2} sx={w} sy={h} sz={wallT} color={wallColor} />
      <Wall cx={x} cy={h / 2} cz={southZ - wallT / 2} sx={w} sy={h} sz={wallT} color={wallColor} />
      <Wall
        cx={faceX - wallT / 2}
        cy={h / 2}
        cz={eNorthZ}
        sx={wallT}
        sy={h}
        sz={eSegLen}
        color={wallColor}
      />
      <Wall
        cx={faceX - wallT / 2}
        cy={h / 2}
        cz={eSouthZ}
        sx={wallT}
        sy={h}
        sz={eSegLen}
        color={wallColor}
      />
      {/* lintel above east doorway (visual only; it's above the ceiling) */}
      <mesh position={[faceX - wallT / 2, lintelY, z]} castShadow>
        <boxGeometry args={[wallT, lintelH, doorW]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* === Lobby wall (N-S at lobbyWallX) with corridor gap at center === */}
      <Wall
        cx={lobbyWallX}
        cy={ceilingH / 2}
        cz={(innerNorthZ + corridorNorth) / 2}
        sx={wallT}
        sy={ceilingH}
        sz={corridorNorth - innerNorthZ}
        color={innerColor}
      />
      <Wall
        cx={lobbyWallX}
        cy={ceilingH / 2}
        cz={(corridorSouth + innerSouthZ) / 2}
        sx={wallT}
        sy={ceilingH}
        sz={innerSouthZ - corridorSouth}
        color={innerColor}
      />

      {/* === North corridor wall (trauma + exam1 doorways) === */}
      <Wall
        cx={(medWest + (traumaDoorX - intDoorHalf)) / 2}
        cy={ceilingH / 2}
        cz={corridorNorth + wallT / 2}
        sx={traumaDoorX - intDoorHalf - medWest}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />
      <Wall
        cx={(traumaDoorX + intDoorHalf + exam1DoorX - intDoorHalf) / 2}
        cy={ceilingH / 2}
        cz={corridorNorth + wallT / 2}
        sx={exam1DoorX - intDoorHalf - (traumaDoorX + intDoorHalf)}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />
      <Wall
        cx={(exam1DoorX + intDoorHalf + medEast) / 2}
        cy={ceilingH / 2}
        cz={corridorNorth + wallT / 2}
        sx={medEast - (exam1DoorX + intDoorHalf)}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />

      {/* === South corridor wall (nurse + exam2 doorways) === */}
      <Wall
        cx={(medWest + (nurseDoorX - intDoorHalf)) / 2}
        cy={ceilingH / 2}
        cz={corridorSouth - wallT / 2}
        sx={nurseDoorX - intDoorHalf - medWest}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />
      <Wall
        cx={(nurseDoorX + intDoorHalf + exam2DoorX - intDoorHalf) / 2}
        cy={ceilingH / 2}
        cz={corridorSouth - wallT / 2}
        sx={exam2DoorX - intDoorHalf - (nurseDoorX + intDoorHalf)}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />
      <Wall
        cx={(exam2DoorX + intDoorHalf + medEast) / 2}
        cy={ceilingH / 2}
        cz={corridorSouth - wallT / 2}
        sx={medEast - (exam2DoorX + intDoorHalf)}
        sy={ceilingH}
        sz={wallT}
        color={innerColor}
      />

      {/* === Room-dividing walls (N-S at medMidX) === */}
      <Wall
        cx={medMidX}
        cy={ceilingH / 2}
        cz={(innerNorthZ + corridorNorth) / 2}
        sx={wallT}
        sy={ceilingH}
        sz={corridorNorth - innerNorthZ}
        color={innerColor}
      />
      <Wall
        cx={medMidX}
        cy={ceilingH / 2}
        cz={(corridorSouth + innerSouthZ) / 2}
        sx={wallT}
        sy={ceilingH}
        sz={innerSouthZ - corridorSouth}
        color={innerColor}
      />

      {/* interior ceiling */}
      <mesh position={[x, ceilingH, z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={ceilingColor} />
      </mesh>
      {/* ceiling light panels */}
      {ceilingLights.map(([lx, lz], i) => (
        <mesh
          key={`light_${i}`}
          position={[lx, ceilingH - 0.02, lz]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1.2, 0.5]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#fff6d0"
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}

      {/* exterior roof */}
      <mesh position={[x, h + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* rooftop red cross */}
      <mesh position={[x, roofY, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[crossArmL, crossArmT]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[x, roofY, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[crossArmT, crossArmL]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>

      {/* === Facade sign + cross + entrance awning === */}
      <mesh position={[faceX + 0.02, h * 0.7, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[w * 0.8, 2.4]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Text
        position={[faceX + 0.04, h * 0.7, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={1.4}
        color="#c03a38"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#fff"
      >
        HOSPITAL
      </Text>
      <mesh position={[faceX + 0.03, h * 0.88, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.2, 0.6]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[faceX + 0.03, h * 0.88, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.6, 2.2]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* entrance awning */}
      <mesh position={[faceX + 1, ceilingH + 0.05, z]} castShadow>
        <boxGeometry args={[2.4, 0.15, 5.5]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[faceX + 2.1, (ceilingH + 0.05) / 2, z - 2.4]} castShadow>
        <boxGeometry args={[0.12, ceilingH + 0.05, 0.12]} />
        <meshStandardMaterial color="#c9ced3" />
      </mesh>
      <mesh position={[faceX + 2.1, (ceilingH + 0.05) / 2, z + 2.4]} castShadow>
        <boxGeometry args={[0.12, ceilingH + 0.05, 0.12]} />
        <meshStandardMaterial color="#c9ced3" />
      </mesh>
      {/* "EMERGENCY" band under the awning */}
      <Text
        position={[faceX + 0.22, ceilingH - 0.5, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.42}
        color="#c03a38"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor="#fff"
      >
        EMERGENCY
      </Text>

      {/* === LOBBY === */}
      {/* reception desk */}
      <mesh position={[deskX, 0.55, deskZ]} castShadow>
        <boxGeometry args={[1.2, 1.1, 4]} />
        <meshStandardMaterial color="#c8cbd0" />
      </mesh>
      <mesh position={[deskX, 1.15, deskZ]} castShadow>
        <boxGeometry args={[1.6, 0.08, 4.4]} />
        <meshStandardMaterial color="#8a8d92" />
      </mesh>
      {/* red cross facing the entrance */}
      <mesh position={[deskX + 0.62, 0.55, deskZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 0.28]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[deskX + 0.62, 0.55, deskZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.28, 0.9]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* receptionist monitor */}
      <mesh position={[deskX, 1.5, deskZ + 1]} castShadow>
        <boxGeometry args={[0.08, 0.45, 0.7]} />
        <meshStandardMaterial color="#1a1a20" emissive="#4488ff" emissiveIntensity={0.3} />
      </mesh>
      {/* wall sign above the desk */}
      <Text
        position={[lobbyWallX + wallT / 2 + 0.01, 3.1, deskZ]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.35}
        color="#2a2a2a"
        anchorX="center"
        anchorY="middle"
      >
        RECEPTION
      </Text>
      {/* waiting chairs along the south lobby wall */}
      {[-1.5, 0, 1.5].map((dz) => (
        <group key={`chair_${dz}`} position={[faceX - 2.5, 0.35, innerSouthZ - 0.8 + dz]}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.1, 0.55]} />
            <meshStandardMaterial color="#3d4754" />
          </mesh>
          <mesh position={[0, 0.4, -0.22]} castShadow>
            <boxGeometry args={[0.55, 0.7, 0.08]} />
            <meshStandardMaterial color="#3d4754" />
          </mesh>
        </group>
      ))}
      {/* potted plant near the door */}
      <group position={[faceX - 1.2, 0, innerNorthZ + 1]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.25, 0.7, 10]} />
          <meshStandardMaterial color="#6a4a2e" />
        </mesh>
        <mesh position={[0, 1.1, 0]} castShadow>
          <sphereGeometry args={[0.55, 10, 10]} />
          <meshStandardMaterial color="#3e7a42" />
        </mesh>
      </group>

      {/* === TRAUMA BAY === */}
      <group position={[traumaCx, 0, traumaCz]}>
        {/* gurney */}
        <mesh position={[0, 0.7, 0]} castShadow>
          <boxGeometry args={[2.1, 0.12, 0.85]} />
          <meshStandardMaterial color="#e0e4e8" />
        </mesh>
        <mesh position={[-0.9, 0.9, 0]} castShadow>
          <boxGeometry args={[0.2, 0.32, 0.8]} />
          <meshStandardMaterial color="#eef1f4" />
        </mesh>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[2.0, 0.06, 0.8]} />
          <meshStandardMaterial color="#9aa3ac" />
        </mesh>
        {[
          [-0.9, -0.38],
          [0.9, -0.38],
          [-0.9, 0.38],
          [0.9, 0.38],
        ].map(([wx, wz], i) => (
          <mesh key={`gw_${i}`} position={[wx, 0.1, wz]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.1, 10]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        ))}
      </group>
      {/* vitals monitor on a stand */}
      <group position={[traumaCx - 1.8, 0, traumaCz - 1.2]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[0.3, 1.2, 0.3]} />
          <meshStandardMaterial color="#aeb4ba" />
        </mesh>
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[0.85, 0.55, 0.12]} />
          <meshStandardMaterial color="#1a1a20" emissive="#4bff7a" emissiveIntensity={0.5} />
        </mesh>
      </group>
      {/* crash cart */}
      <mesh position={[traumaCx + 1.6, 0.55, traumaCz + 1.5]} castShadow>
        <boxGeometry args={[0.7, 1.1, 0.5]} />
        <meshStandardMaterial color="#c94a2a" />
      </mesh>
      <Text
        position={[traumaDoorX, 3.0, corridorNorth + wallT + 0.02]}
        fontSize={0.32}
        color="#c03a38"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#fff"
      >
        TRAUMA
      </Text>

      {/* === EXAM 1 === */}
      <group position={[exam1Cx, 0, exam1Cz - 0.6]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[2.0, 0.12, 0.7]} />
          <meshStandardMaterial color="#cfd4d9" />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[1.9, 0.05, 0.65]} />
          <meshStandardMaterial color="#8a8d92" />
        </mesh>
        <mesh position={[-0.8, 0.76, 0]} castShadow>
          <boxGeometry args={[0.2, 0.2, 0.6]} />
          <meshStandardMaterial color="#e9edf1" />
        </mesh>
      </group>
      {/* supply cabinet */}
      <mesh position={[exam1Cx + 1.6, 0.8, exam1Cz + 1.5]} castShadow>
        <boxGeometry args={[0.5, 1.6, 1.2]} />
        <meshStandardMaterial color="#d0d4d8" />
      </mesh>
      <Text
        position={[exam1DoorX, 3.0, corridorNorth + wallT + 0.02]}
        fontSize={0.32}
        color="#2a2a2a"
        anchorX="center"
        anchorY="middle"
      >
        EXAM 1
      </Text>

      {/* === NURSE STATION === */}
      {/* L-shaped desk */}
      <mesh position={[nurseCx, 0.55, nurseCz + 1]} castShadow>
        <boxGeometry args={[2.5, 1.1, 0.7]} />
        <meshStandardMaterial color="#b8a986" />
      </mesh>
      <mesh position={[nurseCx - 0.9, 0.55, nurseCz + 0.15]} castShadow>
        <boxGeometry args={[0.7, 1.1, 2.0]} />
        <meshStandardMaterial color="#b8a986" />
      </mesh>
      <mesh position={[nurseCx, 1.2, nurseCz + 1]} castShadow>
        <boxGeometry args={[2.6, 0.08, 0.8]} />
        <meshStandardMaterial color="#8a7d5a" />
      </mesh>
      {/* monitor */}
      <mesh position={[nurseCx + 0.5, 1.55, nurseCz + 1]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.08]} />
        <meshStandardMaterial color="#1a1a20" emissive="#4488ff" emissiveIntensity={0.35} />
      </mesh>
      {/* chair */}
      <mesh position={[nurseCx, 0.5, nurseCz + 0.2]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.08, 12]} />
        <meshStandardMaterial color="#1a1a20" />
      </mesh>
      <mesh position={[nurseCx, 0.25, nurseCz + 0.2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.45, 8]} />
        <meshStandardMaterial color="#1a1a20" />
      </mesh>
      <Text
        position={[nurseDoorX, 3.0, corridorSouth - wallT - 0.02]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.32}
        color="#2a2a2a"
        anchorX="center"
        anchorY="middle"
      >
        NURSE
      </Text>

      {/* === EXAM 2 === */}
      <group position={[exam2Cx, 0, exam2Cz + 0.6]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[2.0, 0.12, 0.7]} />
          <meshStandardMaterial color="#cfd4d9" />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[1.9, 0.05, 0.65]} />
          <meshStandardMaterial color="#8a8d92" />
        </mesh>
        <mesh position={[-0.8, 0.76, 0]} castShadow>
          <boxGeometry args={[0.2, 0.2, 0.6]} />
          <meshStandardMaterial color="#e9edf1" />
        </mesh>
      </group>
      <mesh position={[exam2Cx + 1.6, 0.8, exam2Cz - 1.5]} castShadow>
        <boxGeometry args={[0.5, 1.6, 1.2]} />
        <meshStandardMaterial color="#d0d4d8" />
      </mesh>
      <Text
        position={[exam2DoorX, 3.0, corridorSouth - wallT - 0.02]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.32}
        color="#2a2a2a"
        anchorX="center"
        anchorY="middle"
      >
        EXAM 2
      </Text>
    </group>
  );
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
      {cells.map(({ gridId, col, row, cell, center, size }) => {
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
        const isMechanic = cell.tag === 'mechanic';
        const isHospital = cell.tag === 'hospital';
        const isChurch = cell.tag === 'church';
        const isStadium = cell.tag === 'stadium';
        const isMarina = cell.tag === 'marina';
        const isHotel = cell.tag === 'hotel';
        const bodyColor = isGunstore ? '#a83a2c' : cell.color;
        const modelKey: ModelKey = isGunstore ? 'buildingGunstore' : 'buildingGeneric';
        const type: BlockType = cell.blockType;
        const key = `b_${gridId}_${col}_${row}`;
        if (isMechanic) {
          return (
            <group key={key}>
              <MechanicShop x={x} z={z} w={w} d={d} />
            </group>
          );
        }
        if (isHospital) {
          return (
            <group key={key}>
              <HospitalInterior x={x} z={z} w={w} d={d} h={h} />
            </group>
          );
        }
        if (isChurch) {
          return (
            <group key={key}>
              <Church x={x} z={z} w={w} d={d} h={h} />
            </group>
          );
        }
        if (isStadium) {
          return (
            <group key={key}>
              <Stadium x={x} z={z} w={w} d={d} h={h} />
            </group>
          );
        }
        if (isMarina) {
          return (
            <group key={key}>
              <Marina x={x} z={z} w={w} d={d} h={h} />
            </group>
          );
        }
        if (isHotel) {
          return (
            <group key={key}>
              <Hotel x={x} z={z} w={w} d={d} h={h} />
            </group>
          );
        }
        return (
          <group key={key}>
            {type === 'standard' && (() => {
              // Per-building footprint and setback jitter so neighbors don't
              // read as a uniform wall. Tagged landmarks keep their full
              // footprint so the gunstore/range always sit where expected.
              let bx = x;
              let bz = z;
              let bw = w;
              let bd = d;
              if (!isGunstore && !isRange && !isHospital) {
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
