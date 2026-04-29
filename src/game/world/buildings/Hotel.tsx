import { Text } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect } from 'react';
import * as THREE from 'three';
import { registerShelter, unregisterShelter } from '../shelterRegions';

// Procedural high-rise hotel: tall sandstone slab with a windowed facade,
// glowing rooftop "HOTEL" sign, and a walkable lobby with reception, seating,
// and elevator doors. Built from primitives so it slots into the city block
// dispatch like Stadium/Marina without needing a GLB.
export default function Hotel({
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
  const wallT = 0.5;
  const lobbyH = 5;
  const doorW = 5;
  const doorHalf = doorW / 2;

  const wallColor = '#cdb98a';
  const trimColor = '#8a6f3a';
  const goldColor = '#d4af56';
  const lobbyWallColor = '#e8dfca';
  const floorColor = '#5a4a36';
  const carpetRed = '#7a2a2a';
  const ceilingColor = '#cfc4a6';
  const windowColor = '#1f3550';
  const signPlateColor = '#1a1208';

  const faceX = x + w / 2;
  const westX = x - w / 2;
  const northZ = z - d / 2;
  const southZ = z + d / 2;

  // Lobby + full upper shell count as sheltered so rain doesn't render
  // inside the hotel. Suites rendered at upper-floor altitudes also fall
  // within this Y span, so HotelSuite doesn't need its own registration
  // for rain — only its own collider geometry.
  useEffect(() => {
    const id = `hotel_${x.toFixed(2)}_${z.toFixed(2)}`;
    registerShelter(id, {
      minX: westX,
      maxX: faceX,
      minZ: northZ,
      maxZ: southZ,
      minY: 0,
      maxY: h,
    });
    return () => unregisterShelter(id);
  }, [x, z, westX, faceX, northZ, southZ, h]);

  const innerW = westX + wallT;
  const innerE = faceX - wallT;
  const innerN = northZ + wallT;
  const innerS = southZ - wallT;

  const upperH = Math.max(0, h - lobbyH);

  // East lobby wall splits around the doorway. Above the lobby, the east
  // facade is a single solid wall.
  const eLobbySegLen = d / 2 - doorHalf;
  const eNorthLobbyZ = z - (d / 2 + doorHalf) / 2;
  const eSouthLobbyZ = z + (d / 2 + doorHalf) / 2;

  const awningDepth = 3.0;
  const awningT = 0.25;

  const signH = 5;
  const signW = Math.min(w * 0.9, 28);
  const signCy = h + signH / 2 + 0.6;

  const storyH = 3;
  const storyCount = Math.max(1, Math.floor(upperH / storyH));

  return (
    <group>
      {/* Lobby floor */}
      <mesh position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      {/* Red carpet runner from the entrance to the reception desk */}
      <mesh position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w * 0.78, 3]} />
        <meshStandardMaterial color={carpetRed} />
      </mesh>

      {/* === Perimeter walls === */}
      <Wall cx={westX + wallT / 2} cy={h / 2} cz={z} sx={wallT} sy={h} sz={d} color={wallColor} />
      <Wall cx={x} cy={h / 2} cz={northZ + wallT / 2} sx={w} sy={h} sz={wallT} color={wallColor} />
      <Wall cx={x} cy={h / 2} cz={southZ - wallT / 2} sx={w} sy={h} sz={wallT} color={wallColor} />

      {/* East facade: lobby split + solid above */}
      <Wall
        cx={faceX - wallT / 2}
        cy={lobbyH / 2}
        cz={eNorthLobbyZ}
        sx={wallT}
        sy={lobbyH}
        sz={eLobbySegLen}
        color={wallColor}
      />
      <Wall
        cx={faceX - wallT / 2}
        cy={lobbyH / 2}
        cz={eSouthLobbyZ}
        sx={wallT}
        sy={lobbyH}
        sz={eLobbySegLen}
        color={wallColor}
      />
      {upperH > 0 && (
        <Wall
          cx={faceX - wallT / 2}
          cy={lobbyH + upperH / 2}
          cz={z}
          sx={wallT}
          sy={upperH}
          sz={d}
          color={wallColor}
        />
      )}

      {/* Lobby ceiling slab — visible to the player from below */}
      <mesh position={[x, lobbyH, z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - wallT * 2, d - wallT * 2]} />
        <meshStandardMaterial color={ceilingColor} />
      </mesh>

      {/* Roof + parapet */}
      <mesh position={[x, h + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      <mesh position={[x, h + 0.4, northZ + 0.2]} castShadow>
        <boxGeometry args={[w, 0.8, 0.4]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[x, h + 0.4, southZ - 0.2]} castShadow>
        <boxGeometry args={[w, 0.8, 0.4]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[westX + 0.2, h + 0.4, z]} castShadow>
        <boxGeometry args={[0.4, 0.8, d]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[faceX - 0.2, h + 0.4, z]} castShadow>
        <boxGeometry args={[0.4, 0.8, d]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>

      {/* Gold trim band running along the top of the lobby on the east face */}
      <mesh position={[faceX + 0.02, lobbyH + 0.1, z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d - wallT * 2, 0.6]} />
        <meshStandardMaterial color={goldColor} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Awning above the entrance, with two gold support pillars and a soft
          uplight underneath */}
      <mesh position={[faceX + awningDepth / 2, lobbyH - 0.25, z]} castShadow>
        <boxGeometry args={[awningDepth, awningT, doorW + 4]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`pillar_${side}`}
          position={[
            faceX + awningDepth - 0.15,
            (lobbyH - 0.25) / 2,
            z + side * (doorHalf + 1.6),
          ]}
          castShadow
        >
          <boxGeometry args={[0.3, lobbyH - 0.25, 0.3]} />
          <meshStandardMaterial color={goldColor} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh
        position={[faceX + awningDepth / 2, lobbyH - 0.39, z]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[awningDepth - 0.4, doorW + 3]} />
        <meshStandardMaterial color="#fff8d0" emissive="#fff5b0" emissiveIntensity={0.7} />
      </mesh>

      {/* "GRAND HOTEL" sign band on the awning's front edge */}
      <mesh
        position={[faceX + awningDepth + 0.01, lobbyH - 0.25, z]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[doorW + 4, 1.3]} />
        <meshStandardMaterial color={signPlateColor} />
      </mesh>
      <Text
        position={[faceX + awningDepth + 0.04, lobbyH - 0.25, z]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.85}
        color={goldColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000"
      >
        GRAND HOTEL
      </Text>

      {/* Rooftop sign — backplate + glowing letters facing both east and west
          so the building reads as a hotel from anywhere on the island */}
      {[
        { faceCoord: faceX + 0.02, rot: Math.PI / 2 },
        { faceCoord: westX - 0.02, rot: -Math.PI / 2 },
      ].map(({ faceCoord, rot }, i) => (
        <group key={`sign_${i}`}>
          <mesh position={[faceCoord, signCy, z]} rotation={[0, rot, 0]}>
            <planeGeometry args={[signW, signH]} />
            <meshStandardMaterial color={signPlateColor} />
          </mesh>
          <Text
            position={[faceCoord + (rot > 0 ? 0.05 : -0.05), signCy, z]}
            rotation={[0, rot, 0]}
            fontSize={signH * 0.7}
            color={goldColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.06}
            outlineColor="#000"
          >
            HOTEL
          </Text>
        </group>
      ))}

      {/* Window grid on each facade above the lobby */}
      <FacadeWindows
        axis="z"
        faceCoord={faceX + 0.04}
        spanMin={northZ + 1.5}
        spanMax={southZ - 1.5}
        storyCount={storyCount}
        storyH={storyH}
        baseY={lobbyH}
        windowColor={windowColor}
      />
      <FacadeWindows
        axis="z"
        faceCoord={westX - 0.04}
        spanMin={northZ + 1.5}
        spanMax={southZ - 1.5}
        storyCount={storyCount}
        storyH={storyH}
        baseY={lobbyH}
        windowColor={windowColor}
      />
      <FacadeWindows
        axis="x"
        faceCoord={northZ - 0.04}
        spanMin={westX + 1.5}
        spanMax={faceX - 1.5}
        storyCount={storyCount}
        storyH={storyH}
        baseY={lobbyH}
        windowColor={windowColor}
      />
      <FacadeWindows
        axis="x"
        faceCoord={southZ + 0.04}
        spanMin={westX + 1.5}
        spanMax={faceX - 1.5}
        storyCount={storyCount}
        storyH={storyH}
        baseY={lobbyH}
        windowColor={windowColor}
      />

      {/* Lobby-level window row, replicated on each face. The east face is
          split around the entrance doorway (centered on z, ±doorHalf wide)
          so windows flank the entry rather than colliding with the awning
          + door panels. baseY/storyH are tuned to keep these shorter than
          the upper-floor windows so the gold trim band still reads as
          separating the lobby from the office stories above. */}
      {(() => {
        const lobbyBaseY = 1.5;
        const lobbyStoryH = 2.5;
        // East face: north and south of the doorway. Inset by 0.5m past
        // the doorway edge so the window mullions don't crowd the door.
        const eastNorthMax = z - doorHalf - 0.5;
        const eastSouthMin = z + doorHalf + 0.5;
        return (
          <>
            <FacadeWindows
              axis="z"
              faceCoord={faceX + 0.04}
              spanMin={northZ + 1.5}
              spanMax={eastNorthMax}
              storyCount={1}
              storyH={lobbyStoryH}
              baseY={lobbyBaseY}
              windowColor={windowColor}
            />
            <FacadeWindows
              axis="z"
              faceCoord={faceX + 0.04}
              spanMin={eastSouthMin}
              spanMax={southZ - 1.5}
              storyCount={1}
              storyH={lobbyStoryH}
              baseY={lobbyBaseY}
              windowColor={windowColor}
            />
            <FacadeWindows
              axis="z"
              faceCoord={westX - 0.04}
              spanMin={northZ + 1.5}
              spanMax={southZ - 1.5}
              storyCount={1}
              storyH={lobbyStoryH}
              baseY={lobbyBaseY}
              windowColor={windowColor}
            />
            <FacadeWindows
              axis="x"
              faceCoord={northZ - 0.04}
              spanMin={westX + 1.5}
              spanMax={faceX - 1.5}
              storyCount={1}
              storyH={lobbyStoryH}
              baseY={lobbyBaseY}
              windowColor={windowColor}
            />
            <FacadeWindows
              axis="x"
              faceCoord={southZ + 0.04}
              spanMin={westX + 1.5}
              spanMax={faceX - 1.5}
              storyCount={1}
              storyH={lobbyStoryH}
              baseY={lobbyBaseY}
              windowColor={windowColor}
            />
          </>
        );
      })()}

      <LobbyInterior
        x={x}
        z={z}
        innerW={innerW}
        innerE={innerE}
        innerN={innerN}
        innerS={innerS}
        ceilingH={lobbyH}
        wallColor={lobbyWallColor}
        woodColor={trimColor}
        goldColor={goldColor}
        signPlateColor={signPlateColor}
      />
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

function FacadeWindows({
  axis,
  faceCoord,
  spanMin,
  spanMax,
  storyCount,
  storyH,
  baseY,
  windowColor,
}: {
  axis: 'x' | 'z';
  faceCoord: number;
  spanMin: number;
  spanMax: number;
  storyCount: number;
  storyH: number;
  baseY: number;
  windowColor: string;
}) {
  const span = spanMax - spanMin;
  if (span <= 0) return null;
  const cols = Math.max(2, Math.floor(span / 4.5));
  const colStep = span / cols;
  const winW = colStep * 0.62;
  const winH = storyH * 0.55;
  const rotY = axis === 'z' ? Math.PI / 2 : 0;
  const out: React.ReactNode[] = [];
  for (let s = 0; s < storyCount; s++) {
    const cy = baseY + s * storyH + storyH / 2;
    for (let c = 0; c < cols; c++) {
      const u = spanMin + (c + 0.5) * colStep;
      const px = axis === 'z' ? faceCoord : u;
      const pz = axis === 'z' ? u : faceCoord;
      out.push(
        <mesh
          key={`${axis}_${s}_${c}`}
          position={[px, cy, pz]}
          rotation={[0, rotY, 0]}
        >
          <planeGeometry args={[winW, winH]} />
          {/* DoubleSide because rotY only orients the plane along the
              correct axis — half of the four facades end up with the
              plane's normal pointing INTO the building (west, north). With
              default front-side culling those windows render as invisible
              from outside. Cheap fix: render both sides. */}
          <meshStandardMaterial
            color={windowColor}
            emissive="#86a4ce"
            emissiveIntensity={0.18}
            side={THREE.DoubleSide}
          />
        </mesh>,
      );
    }
  }
  return <>{out}</>;
}

function LobbyInterior({
  x,
  z,
  innerW,
  innerE,
  innerN,
  innerS,
  ceilingH,
  wallColor: _wallColor,
  woodColor,
  goldColor,
  signPlateColor,
}: {
  x: number;
  z: number;
  innerW: number;
  innerE: number;
  innerN: number;
  innerS: number;
  ceilingH: number;
  wallColor: string;
  woodColor: string;
  goldColor: string;
  signPlateColor: string;
}) {
  const interiorW = innerE - innerW;
  const interiorD = innerS - innerN;

  // Reception desk runs north-south against the west wall.
  const deskW = Math.min(interiorD * 0.45, 8);
  const deskD = 1.2;
  const deskH = 1.1;
  const deskX = innerW + deskD / 2 + 0.3;
  const deskZ = z;

  // Backlit "HOTEL" sign mounted on the west wall behind the desk.
  const wallSignFaceX = innerW + 0.01;
  const wallSignY = ceilingH * 0.6;
  const wallSignW = Math.min(deskW * 0.85, 6);

  // Seating area in the southeast quadrant of the lobby.
  const couchX = x + interiorW * 0.05;
  const couchZ = innerS - 4.0;

  // Elevator bank tucked against the north interior wall.
  const elevatorBaseZ = innerN + 0.05;

  // Coffee bar + dining furniture share a uniform up-scale so the bar
  // counter, stools, tables and chairs all stay in proportion to each
  // other when the lobby's "feel" is tuned.
  const PROP_SCALE = 1.25;

  // Coffee bar: NE quadrant, counter against the north wall east of the
  // elevator bank. Faces south so guests sit on stools looking into the
  // lobby.
  const coffeeCounterW = Math.min(4.0 * PROP_SCALE, (innerE - (x + 1.4 + 0.6)) * 0.85);
  const coffeeCounterD = 0.7 * PROP_SCALE;
  const coffeeCounterH = 1.1 * PROP_SCALE;
  const coffeeCenterX = (x + 1.4 + 0.6 + innerE) / 2;
  const coffeeCounterZ = innerN + coffeeCounterD / 2 + 0.3;

  // Dining area: NW quadrant, north of the desk's north end and west of the
  // elevator bank. Two rows of two round pedestal tables.
  const diningCenterX = (innerW + (x - 1.4)) / 2;
  const diningTopZ = innerN + 1.5;
  const diningColSpacing = 1.75 * PROP_SCALE;
  const diningRowSpacing = 2.6 * PROP_SCALE;
  const diningTablePositions: Array<[number, number]> = [
    [diningCenterX - diningColSpacing, diningTopZ + 0.4],
    [diningCenterX + diningColSpacing, diningTopZ + 0.4],
    [diningCenterX - diningColSpacing, diningTopZ + 0.4 + diningRowSpacing],
    [diningCenterX + diningColSpacing, diningTopZ + 0.4 + diningRowSpacing],
  ];
  const tableTopRadius = 0.55 * PROP_SCALE;
  const tablePedestalH = 0.7 * PROP_SCALE;
  const chairOffset = 0.95 * PROP_SCALE;
  const chairSize = 0.5 * PROP_SCALE;
  const chairSeatH = 0.45 * PROP_SCALE;
  const chairBackH = 0.6 * PROP_SCALE;

  // Ceiling can-lights at the four interior corners. Now real pointLights
  // (not just emissive disks) so the lobby reads bright with shadows
  // softening into the corners.
  const lights: [number, number][] = [
    [x - interiorW * 0.28, z - interiorD * 0.28],
    [x + interiorW * 0.28, z - interiorD * 0.28],
    [x - interiorW * 0.28, z + interiorD * 0.28],
    [x + interiorW * 0.28, z + interiorD * 0.28],
  ];

  return (
    <group>
      {/* Reception desk pendant lights — three warm pendants run along the
          desk so the front-of-house and the clerk's workspace are clearly
          lit independent of the central chandelier. */}
      {[-deskW * 0.32, 0, deskW * 0.32].map((dz, i) => (
        <group key={`desk_pendant_${i}`}>
          <pointLight
            position={[deskX + 0.4, ceilingH - 0.6, deskZ + dz]}
            color="#ffe2b0"
            intensity={26}
            distance={9}
            decay={1.5}
          />
          <mesh position={[deskX + 0.4, ceilingH - 0.5, deskZ + dz]}>
            <coneGeometry args={[0.2, 0.3, 12]} />
            <meshStandardMaterial
              color={goldColor}
              metalness={0.6}
              roughness={0.4}
              emissive="#ffd9a0"
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[deskX + 0.4, ceilingH - 0.18, deskZ + dz]}>
            <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
            <meshStandardMaterial color="#1a1a20" />
          </mesh>
        </group>
      ))}
      {/* Recessed wall sconce on the west wall above the HOTEL sign so the
          desk's back wall isn't a dark slab when the chandelier swings
          out of view. */}
      <pointLight
        position={[innerW + 0.3, ceilingH - 0.8, deskZ]}
        color="#ffd9a0"
        intensity={22}
        distance={7}
        decay={1.6}
      />

      {/* Reception desk body + dark stone top */}
      <mesh position={[deskX, deskH / 2, deskZ]} castShadow receiveShadow>
        <boxGeometry args={[deskD, deskH, deskW]} />
        <meshStandardMaterial color={woodColor} />
      </mesh>
      <mesh position={[deskX, deskH + 0.05, deskZ]} castShadow>
        <boxGeometry args={[deskD + 0.3, 0.1, deskW + 0.3]} />
        <meshStandardMaterial color="#2a1f12" />
      </mesh>
      {/* Computer monitor */}
      <mesh position={[deskX, deskH + 0.5, deskZ]} castShadow>
        <boxGeometry args={[0.1, 0.45, 0.7]} />
        <meshStandardMaterial color="#1a1a20" emissive="#4488ff" emissiveIntensity={0.3} />
      </mesh>
      {/* Brass call bell */}
      <mesh position={[deskX, deskH + 0.18, deskZ + deskW / 2 - 0.5]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={goldColor} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Backlit "HOTEL" sign on the west wall behind the desk */}
      <mesh position={[wallSignFaceX, wallSignY, deskZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[wallSignW, 1.2]} />
        <meshStandardMaterial color={signPlateColor} />
      </mesh>
      <Text
        position={[wallSignFaceX + 0.02, wallSignY, deskZ]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.9}
        color={goldColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#000"
      >
        HOTEL
      </Text>

      {/* Couch */}
      <mesh position={[couchX, 0.45, couchZ]} castShadow>
        <boxGeometry args={[3.0, 0.6, 0.9]} />
        <meshStandardMaterial color="#5a3a2a" />
      </mesh>
      <mesh position={[couchX, 0.85, couchZ + 0.4]} castShadow>
        <boxGeometry args={[3.0, 0.7, 0.18]} />
        <meshStandardMaterial color="#5a3a2a" />
      </mesh>

      {/* Two armchairs facing the couch across a coffee table */}
      {[-1, 1].map((side) => (
        <group key={`chair_${side}`} position={[couchX + side * 2.6, 0, couchZ - 1.6]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.95, 0.55, 0.85]} />
            <meshStandardMaterial color="#7a4a32" />
          </mesh>
          <mesh position={[0, 0.78, -0.34]} castShadow>
            <boxGeometry args={[0.95, 0.7, 0.18]} />
            <meshStandardMaterial color="#7a4a32" />
          </mesh>
        </group>
      ))}
      {/* Coffee table between couch and chairs */}
      <mesh position={[couchX, 0.35, couchZ - 0.85]} castShadow>
        <boxGeometry args={[1.6, 0.06, 0.9]} />
        <meshStandardMaterial color="#3a2818" />
      </mesh>
      <mesh position={[couchX, 0.18, couchZ - 0.85]} castShadow>
        <boxGeometry args={[1.5, 0.3, 0.85]} />
        <meshStandardMaterial color={woodColor} />
      </mesh>

      {/* Two potted plants flanking the entrance on the east wall */}
      {[-1, 1].map((side) => (
        <group key={`plant_${side}`} position={[innerE - 1.5, 0, z + side * 4.5]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.36, 0.3, 0.8, 12]} />
            <meshStandardMaterial color={woodColor} />
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow>
            <sphereGeometry args={[0.65, 12, 10]} />
            <meshStandardMaterial color="#3e7a42" />
          </mesh>
        </group>
      ))}

      {/* === Coffee bar (NE quadrant) === */}
      <group>
        {/* Counter base */}
        <mesh
          position={[coffeeCenterX, coffeeCounterH / 2, coffeeCounterZ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[coffeeCounterW, coffeeCounterH, coffeeCounterD]} />
          <meshStandardMaterial color={woodColor} />
        </mesh>
        {/* Counter top — dark stone, slightly larger footprint */}
        <mesh
          position={[coffeeCenterX, coffeeCounterH + 0.04, coffeeCounterZ]}
          castShadow
        >
          <boxGeometry args={[
            coffeeCounterW + 0.25,
            0.08,
            coffeeCounterD + 0.25,
          ]} />
          <meshStandardMaterial color="#1f1612" />
        </mesh>
        {/* Espresso machine */}
        <mesh
          position={[
            coffeeCenterX - coffeeCounterW * 0.3,
            coffeeCounterH + 0.4 * PROP_SCALE,
            coffeeCounterZ - 0.05,
          ]}
          castShadow
        >
          <boxGeometry args={[0.7 * PROP_SCALE, 0.55 * PROP_SCALE, 0.45 * PROP_SCALE]} />
          <meshStandardMaterial color="#2a2a30" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh
          position={[
            coffeeCenterX - coffeeCounterW * 0.3,
            coffeeCounterH + 0.45 * PROP_SCALE,
            coffeeCounterZ - 0.05,
          ]}
        >
          <boxGeometry args={[0.6 * PROP_SCALE, 0.18 * PROP_SCALE, 0.4 * PROP_SCALE]} />
          <meshStandardMaterial color={goldColor} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Coffee mugs lined up on the counter */}
        {[-1.5, -1.2, -0.9, 1.1, 1.4].map((dx, i) => (
          <mesh
            key={`mug_${i}`}
            position={[
              coffeeCenterX + dx * 0.5 * PROP_SCALE,
              coffeeCounterH + 0.1 * PROP_SCALE,
              coffeeCounterZ + 0.12 * PROP_SCALE,
            ]}
            castShadow
          >
            <cylinderGeometry args={[0.05 * PROP_SCALE, 0.05 * PROP_SCALE, 0.1 * PROP_SCALE, 10]} />
            <meshStandardMaterial color="#f5f0e6" />
          </mesh>
        ))}
        {/* Cake stand under glass on the right */}
        <mesh
          position={[
            coffeeCenterX + coffeeCounterW * 0.3,
            coffeeCounterH + 0.11 * PROP_SCALE,
            coffeeCounterZ + 0.05,
          ]}
          castShadow
        >
          <cylinderGeometry args={[0.28 * PROP_SCALE, 0.28 * PROP_SCALE, 0.05 * PROP_SCALE, 16]} />
          <meshStandardMaterial color="#caa055" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh
          position={[
            coffeeCenterX + coffeeCounterW * 0.3,
            coffeeCounterH + 0.28 * PROP_SCALE,
            coffeeCounterZ + 0.05,
          ]}
        >
          <cylinderGeometry args={[0.26 * PROP_SCALE, 0.28 * PROP_SCALE, 0.3 * PROP_SCALE, 16]} />
          <meshStandardMaterial
            color="#d6e7f0"
            transparent
            opacity={0.35}
            roughness={0.1}
          />
        </mesh>
        {/* Backbar shelves on the wall above the counter */}
        <mesh
          position={[coffeeCenterX, 1.95 * PROP_SCALE, innerN + 0.05]}
          castShadow
        >
          <boxGeometry args={[coffeeCounterW + 0.5, 0.05, 0.4 * PROP_SCALE]} />
          <meshStandardMaterial color={woodColor} />
        </mesh>
        <mesh
          position={[coffeeCenterX, 2.45 * PROP_SCALE, innerN + 0.05]}
          castShadow
        >
          <boxGeometry args={[coffeeCounterW + 0.5, 0.05, 0.4 * PROP_SCALE]} />
          <meshStandardMaterial color={woodColor} />
        </mesh>
        {/* Bottles on the upper shelf */}
        {Array.from({ length: 6 }).map((_, i) => {
          const dx = (i - 2.5) * 0.35 * PROP_SCALE;
          return (
            <mesh
              key={`bottle_${i}`}
              position={[
                coffeeCenterX + dx,
                2.65 * PROP_SCALE,
                innerN + 0.05,
              ]}
              castShadow
            >
              <cylinderGeometry args={[0.06 * PROP_SCALE, 0.06 * PROP_SCALE, 0.32 * PROP_SCALE, 8]} />
              <meshStandardMaterial
                color={i % 2 ? '#3a4f2c' : '#5a3a2a'}
                roughness={0.6}
              />
            </mesh>
          );
        })}
        {/* Backlit menu board between the shelves */}
        <mesh
          position={[coffeeCenterX, 2.2 * PROP_SCALE, innerN + 0.02]}
        >
          <planeGeometry args={[2.0 * PROP_SCALE, 0.45 * PROP_SCALE]} />
          <meshStandardMaterial color="#1a120a" />
        </mesh>
        <Text
          position={[coffeeCenterX, 2.28 * PROP_SCALE, innerN + 0.04]}
          fontSize={0.16 * PROP_SCALE}
          color="#f5cb5c"
          anchorX="center"
          anchorY="middle"
        >
          ESPRESSO
        </Text>
        <Text
          position={[coffeeCenterX, 2.12 * PROP_SCALE, innerN + 0.04]}
          fontSize={0.12 * PROP_SCALE}
          color="#e6d8a6"
          anchorX="center"
          anchorY="middle"
        >
          LATTE  ·  CAPPUCCINO  ·  COLD BREW
        </Text>
        {/* Three counter stools facing the bar from the south */}
        {[-1, 0, 1].map((side) => (
          <group
            key={`stool_${side}`}
            position={[
              coffeeCenterX + side * (coffeeCounterW * 0.3),
              0,
              coffeeCounterZ + coffeeCounterD / 2 + 0.7 * PROP_SCALE,
            ]}
          >
            <mesh position={[0, 0.4 * PROP_SCALE, 0]} castShadow>
              <cylinderGeometry args={[0.06 * PROP_SCALE, 0.06 * PROP_SCALE, 0.8 * PROP_SCALE, 8]} />
              <meshStandardMaterial color="#2a2a30" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.86 * PROP_SCALE, 0]} castShadow>
              <cylinderGeometry args={[0.27 * PROP_SCALE, 0.27 * PROP_SCALE, 0.08 * PROP_SCALE, 16]} />
              <meshStandardMaterial color="#5a3a20" />
            </mesh>
          </group>
        ))}
        {/* Two warm pendants over the coffee bar so the full counter span
            is lit, plus a fill light at counter height to brighten the
            stools and floor in front. */}
        {[-coffeeCounterW * 0.25, coffeeCounterW * 0.25].map((dx, i) => (
          <group key={`coffee_pendant_${i}`}>
            <pointLight
              position={[coffeeCenterX + dx, ceilingH - 0.5, coffeeCounterZ + 0.2]}
              color="#ffd9a0"
              intensity={32}
              distance={11}
              decay={1.6}
            />
            <mesh position={[coffeeCenterX + dx, ceilingH - 0.5, coffeeCounterZ + 0.2]}>
              <coneGeometry args={[0.26, 0.36, 12]} />
              <meshStandardMaterial
                color="#3a2818"
                emissive="#ffb547"
                emissiveIntensity={1.3}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[coffeeCenterX + dx, ceilingH - 0.18, coffeeCounterZ + 0.2]}>
              <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
              <meshStandardMaterial color="#1a1a20" />
            </mesh>
          </group>
        ))}
      </group>

      {/* === Dining area (NW quadrant) === */}
      {diningTablePositions.map(([tx, tz], i) => (
        <group key={`dining_${i}`}>
          {/* Round tabletop */}
          <mesh position={[tx, tablePedestalH + 0.04, tz]} castShadow receiveShadow>
            <cylinderGeometry args={[tableTopRadius, tableTopRadius, 0.06 * PROP_SCALE, 24]} />
            <meshStandardMaterial color="#3a2818" />
          </mesh>
          {/* Pedestal */}
          <mesh position={[tx, tablePedestalH / 2, tz]} castShadow>
            <cylinderGeometry args={[0.12 * PROP_SCALE, 0.18 * PROP_SCALE, tablePedestalH, 12]} />
            <meshStandardMaterial color="#2a1f12" />
          </mesh>
          {/* Foot */}
          <mesh position={[tx, 0.04, tz]} castShadow>
            <cylinderGeometry args={[0.42 * PROP_SCALE, 0.42 * PROP_SCALE, 0.06 * PROP_SCALE, 16]} />
            <meshStandardMaterial color="#2a1f12" />
          </mesh>
          {/* Four chairs around the table. The backrest sits on the side of
              the seat AWAY from the table (sx, sz directly — not negated)
              so the sitter faces the table. */}
          {[
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([sx, sz], ci) => (
            <group
              key={`dchair_${ci}`}
              position={[tx + sx * chairOffset, 0, tz + sz * chairOffset]}
            >
              <mesh position={[0, chairSeatH * 0.6, 0]} castShadow>
                <boxGeometry args={[chairSize, chairSeatH, chairSize]} />
                <meshStandardMaterial color="#5a3a20" />
              </mesh>
              <mesh
                position={[
                  sx * (chairSize / 2 - 0.04 * PROP_SCALE),
                  chairSeatH + chairBackH * 0.5,
                  sz * (chairSize / 2 - 0.04 * PROP_SCALE),
                ]}
                castShadow
              >
                <boxGeometry args={[
                  sx === 0 ? chairSize : 0.08 * PROP_SCALE,
                  chairBackH,
                  sz === 0 ? chairSize : 0.08 * PROP_SCALE,
                ]} />
                <meshStandardMaterial color="#5a3a20" />
              </mesh>
            </group>
          ))}
          {/* Pendant lamp over each table */}
          <pointLight
            position={[tx, ceilingH - 0.6, tz]}
            color="#ffd9a0"
            intensity={26}
            distance={9}
            decay={1.6}
          />
          <mesh position={[tx, ceilingH - 0.45, tz]}>
            <coneGeometry args={[0.22 * PROP_SCALE, 0.3 * PROP_SCALE, 12]} />
            <meshStandardMaterial
              color="#3a2818"
              emissive="#ffb547"
              emissiveIntensity={1.1}
              toneMapped={false}
            />
          </mesh>
          {/* Cord */}
          <mesh position={[tx, ceilingH - 0.18, tz]}>
            <cylinderGeometry args={[0.01, 0.01, 0.36, 6]} />
            <meshStandardMaterial color="#1a1a20" />
          </mesh>
        </group>
      ))}

      {/* Central chandelier — boosted intensity since the lobby footprint
          is large and the corner cans no longer carry the whole load alone. */}
      <group position={[x, ceilingH - 0.4, z]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.7, 0.4, 0.3, 12]} />
          <meshStandardMaterial
            color={goldColor}
            metalness={0.6}
            roughness={0.4}
            emissive={goldColor}
            emissiveIntensity={0.4}
            toneMapped={false}
          />
        </mesh>
        <pointLight color="#ffe4a8" intensity={200} distance={26} decay={1.4} />
      </group>

      {/* Ceiling can-lights — real point lights at each corner so the
          lobby's full footprint reads evenly lit, paired with the existing
          emissive disks for the visual cue. Slightly larger emissive disks
          and higher intensity than v1 so the perimeter doesn't fall off. */}
      {lights.map(([lx, lz], i) => (
        <group key={`light_${i}`}>
          <pointLight
            position={[lx, ceilingH - 0.2, lz]}
            color="#fff6d0"
            intensity={110}
            distance={20}
            decay={1.4}
          />
          <mesh
            position={[lx, ceilingH - 0.02, lz]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.42, 16]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#fff6d0"
              emissiveIntensity={1.4}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* Elevator bank: two doors with gold frames + a glowing floor indicator
          above each. Decorative only — no collider, the wall behind already
          blocks the player. */}
      {[-1.4, 1.4].map((dx, i) => (
        <group key={`elev_${i}`} position={[x + dx, 0, elevatorBaseZ]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <boxGeometry args={[1.1, 2.6, 0.06]} />
            <meshStandardMaterial color={goldColor} metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.3, 0.04]} castShadow>
            <boxGeometry args={[0.9, 2.2, 0.05]} />
            <meshStandardMaterial color="#7a7d83" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.3, 0.07]}>
            <planeGeometry args={[0.02, 2.15]} />
            <meshStandardMaterial color="#1a1a20" />
          </mesh>
          <mesh position={[0, 2.85, 0.07]}>
            <planeGeometry args={[0.45, 0.2]} />
            <meshStandardMaterial
              color="#1a0e08"
              emissive="#ff5040"
              emissiveIntensity={1.0}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
