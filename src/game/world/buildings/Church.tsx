import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useCityModel } from '../cityAssets';
import GltfBoundary from '../GltfBoundary';
import { setPodiumPosition } from '../podiumPosition';
import { registerShelter, unregisterShelter } from '../shelterRegions';
import {
  setLightSwitchPosition,
  useChurchLightingStore,
} from '../churchLighting';

export default function Church({
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
  const scene = useCityModel('buildingChurch');

  // GLB walls are authored single-sided (normals point outward), so they vanish
  // when the camera/player is inside. Clone materials and force DoubleSide so
  // walls remain visible from both faces.
  useMemo(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => {
          const c = m.clone();
          c.side = THREE.DoubleSide;
          return c;
        });
      } else {
        const c = mesh.material.clone();
        c.side = THREE.DoubleSide;
        mesh.material = c;
      }
    });
  }, [scene]);

  // Uniform scale to fit the church inside the cell footprint, preserving the
  // GLB's authored proportions (steeple stays tall, nave stays long).
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const longest = Math.max(size.x, size.z) || 1;
    const target = Math.min(w, d) * 0.95;
    const scale = target / longest;
    return {
      scale,
      offsetX: -center.x * scale,
      offsetY: -box.min.y * scale,
      offsetZ: -center.z * scale,
      halfW: (size.x * scale) / 2,
      halfD: (size.z * scale) / 2,
      scaledH: size.y * scale,
    };
  }, [scene, w, d]);

  const halfFW = fit.halfW;
  const halfFD = fit.halfD;
  const wallT = 0.4;
  // Wall colliders block lateral movement; the GLB provides the visible walls.
  // Tall enough that the player can't vault, capped so it doesn't pierce the
  // steeple visual.
  const wallH = Math.max(4, Math.min(h * 0.85, 12));
  const doorW = 3.2;
  const doorHalf = doorW / 2;

  const southZ = z + halfFD;
  const northZ = z - halfFD;
  const eastX = x + halfFW;
  const westX = x - halfFW;

  // Inner-wall positions for the N/E/W collider faces. The Church.glb has a
  // layered wall structure: a decorative outer shell at the bounding-box edge
  // and a colonnade-style inner wall ~0.8–1.2m inside it. With colliders at
  // the GLB edge the player walked past the visible inner wall into the
  // cavity, and the camera-pushback ray landed inside the wall mesh,
  // occluding the player. Fractions measured by binning Z/X-facing triangles
  // in the GLB; expressed as a fraction of halfFW/halfFD so they survive
  // any future rescaling. South wall is intentionally left at the GLB edge
  // because the vestibule there has its own internal geometry (door panels,
  // arch) which the doorway split currently anchors to.
  const NORTH_INNER_FRAC = 11.4 / 12.23; // back-wall inner face vs halfFD
  const EW_INNER_FRAC = 5.4 / 6.55; // east/west inner face vs halfFW
  const innerNorthZ = z - halfFD * NORTH_INNER_FRAC;
  const innerEastX = x + halfFW * EW_INNER_FRAC;
  const innerWestX = x - halfFW * EW_INNER_FRAC;

  // Publish the interior footprint as a "shelter" so weather visuals (rain)
  // hide when the camera is inside, even though weather audio keeps playing.
  useEffect(() => {
    const id = `church_${x.toFixed(2)}_${z.toFixed(2)}`;
    registerShelter(id, {
      minX: westX,
      maxX: eastX,
      minZ: northZ,
      maxZ: southZ,
      minY: 0,
      maxY: wallH,
    });
    return () => unregisterShelter(id);
  }, [x, z, westX, eastX, northZ, southZ, wallH]);

  // Doorway split on the +Z face, mirroring HospitalInterior's east-facade split.
  const sSegLen = Math.max(0, halfFW - doorHalf);
  const sWestCx = (westX + (x - doorHalf)) / 2;
  const sEastCx = ((x + doorHalf) + eastX) / 2;

  // Lightswitch on the back (north) wall behind the sanctuary, mirroring the
  // pulpit X to the opposite side (pulpit sits on +X, switch on -X). Plate
  // back is flush with the inner north wall face (same plane the collider
  // and back-wall fixtures use). Published to a module singleton so
  // ChurchLightSwitch can drive the prompt.
  const intHalfFW = Math.max(2, halfFW - 0.6);
  const switchX = x - Math.min(intHalfFW * 0.55, 3.5);
  const switchY = 1.6;
  const switchZ = innerNorthZ - 0.4;
  useEffect(() => {
    setLightSwitchPosition({ x: switchX, y: switchY, z: switchZ });
    return () => setLightSwitchPosition(null);
  }, [switchX, switchY, switchZ]);

  return (
    <group>
      {/* Floor collider so the player stands on the church's interior floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[halfFW, 0.05, halfFD]} position={[x, 0.05, z]} />
      </RigidBody>

      {/* North wall — interior face aligned with the visible back wall. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[halfFW, wallH / 2, wallT / 2]}
          position={[x, wallH / 2, innerNorthZ - wallT / 2]}
        />
      </RigidBody>
      {/* East wall — interior face aligned with the visible inner east wall. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[wallT / 2, wallH / 2, halfFD]}
          position={[innerEastX + wallT / 2, wallH / 2, z]}
        />
      </RigidBody>
      {/* West wall — interior face aligned with the visible inner west wall. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[wallT / 2, wallH / 2, halfFD]}
          position={[innerWestX - wallT / 2, wallH / 2, z]}
        />
      </RigidBody>
      {/* South wall (doorway gap centered on x) */}
      {sSegLen > 0 && (
        <>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[sSegLen / 2, wallH / 2, wallT / 2]}
              position={[sWestCx, wallH / 2, southZ - wallT / 2]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[sSegLen / 2, wallH / 2, wallT / 2]}
              position={[sEastCx, wallH / 2, southZ - wallT / 2]}
            />
          </RigidBody>
        </>
      )}

      {/* Closed double doors mounted just inside the south wall. Decorative
          only — no colliders, so the gap in the wall colliders still lets the
          player walk through. The two panels meet at the centerline. The Z
          inset is generous because the GLB's south wall is thicker than our
          collider wallT and we don't want the doors poking out the front. */}
      {[-1, 1].map((side) => {
        const doorPanelH = Math.min(wallH * 0.75, 3.2);
        const doorPanelW = doorHalf - 0.005;
        const doorPanelT = 0.06;
        const doorInset = 6.25;
        const panelCx = x + side * (doorHalf - doorPanelW / 2);
        const panelCz = southZ - doorInset - doorPanelT / 2;
        return (
          <group key={`door_${side}`}>
            <mesh
              position={[panelCx, doorPanelH / 2, panelCz]}
              castShadow
            >
              <boxGeometry args={[doorPanelW, doorPanelH, doorPanelT]} />
              <meshStandardMaterial color="#5a3a20" />
            </mesh>
            {/* brass handle on the inner-meeting edge, proud of the interior
                (-Z) face so it reads from inside the church */}
            <mesh
              position={[
                panelCx - side * (doorPanelW / 2 - 0.15),
                doorPanelH / 2,
                panelCz - doorPanelT / 2 - 0.04,
              ]}
            >
              <boxGeometry args={[0.08, 0.1, 0.08]} />
              <meshStandardMaterial
                color="#caa055"
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}

      <LightSwitch x={switchX} y={switchY} z={switchZ} rotationY={Math.PI} />

      <ChurchInterior
        x={x}
        z={z}
        halfW={halfFW}
        halfD={halfFD}
        scaledH={fit.scaledH}
      />

      <GltfBoundary fallback={null}>
        <primitive
          object={scene}
          position={[x + fit.offsetX, fit.offsetY, z + fit.offsetZ]}
          scale={fit.scale}
        />
      </GltfBoundary>
    </group>
  );
}

function ChurchInterior({
  x,
  z,
  halfW,
  halfD,
  scaledH,
}: {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  scaledH: number;
}) {
  const dimmer = useChurchLightingStore((s) => s.dimmer);
  // Church axes: door is on +Z (south), altar at -Z (north). Pews face -Z so
  // their backrests sit on the +Z side of the seat.
  const wood = '#6b4423';
  const platform = '#5c3a1a';
  const cloth = '#e8dcc4';
  const cross = '#3a2410';

  const intHalfW = Math.max(2, halfW - 0.6);
  const intHalfD = Math.max(2, halfD - 0.6);

  const sanctuaryDepth = Math.min(6, intHalfD * 0.5);
  const platformZ = z - intHalfD + sanctuaryDepth / 2;
  const platformH = 0.25;

  const altarW = Math.min(2.4, intHalfW * 0.6);
  const altarH = 1.0;
  const altarD = 0.9;
  const altarZ = platformZ - 0.3;

  const pulpitW = 0.9;
  const pulpitH = 1.3;
  const pulpitD = 0.7;
  const pulpitX = x + Math.min(intHalfW * 0.55, 3.5);
  // Sit the pulpit just inside the audience-facing edge of the sanctuary
  // platform so the lectern is forward of the altar without crowding it. The
  // 0.4m backoff from the platform edge keeps it visually anchored on the
  // platform rather than perched on the lip.
  const pulpitZ = platformZ + sanctuaryDepth / 2 - pulpitD / 2 - 0.4;

  // Publish the exact pulpit world position so ChurchPodium can place its
  // "Press E to read" trigger right at the book instead of a cell-based
  // approximation. Cleared on unmount (chunk eviction) so the prompt stops.
  useEffect(() => {
    setPodiumPosition({ x: pulpitX, z: pulpitZ });
    return () => setPodiumPosition(null);
  }, [pulpitX, pulpitZ]);

  const crossArmL = 3.0;
  const crossArmT = 0.32;
  const crossY = Math.min(7, platformH + altarH + 3.6);
  const crossZ = z - intHalfD + 0.45;

  const aisleHalfW = 1.5;
  const pewSideW = Math.max(0.8, intHalfW - aisleHalfW - 0.3) * (7 / 8);
  // Seat sits at ~0.5m above floor; the plank itself is thin so the sitting
  // surface reads as a surface, not a block. Skirt fills below; backrest above.
  const seatTopY = 0.5;
  const seatPlankH = 0.08;
  const seatD = 1.1;
  const skirtH = seatTopY - seatPlankH;
  const skirtT = 0.06;
  const backH = 0.95;
  const backT = 0.06;
  const rowSpacing = 2.0;

  const pewStartZ = platformZ + sanctuaryDepth / 2 + 1.2;
  const pewEndZ = z + intHalfD - 1.5;
  // Drop the two rows nearest the doorway so there's open standing room
  // between the back row and the entrance.
  const numRows = Math.max(0, Math.floor((pewEndZ - pewStartZ) / rowSpacing) - 2);

  // GLB total height includes the steeple; the nave ridge sits at roughly
  // 60% of that for a typical church silhouette. Clamp so we don't end up
  // unreasonably low or poking into the steeple on weird models.
  const ridgeY = Math.max(5, Math.min(scaledH * 0.6, 11));
  // Sconces mount partway up the angled (^) ceiling, just below the ridge,
  // inset from the walls so they sit on the slope rather than at the eaves.
  const sconceY = ridgeY - 1.2;
  const sconceInset = 1.0;
  const flameColor = '#ffb547';
  const lightColor = '#ffd9a0';
  const fixtureColor = '#3a2410';
  const candleColor = '#f4ecd2';
  const candleH = 0.45;
  const candleBaseY = platformH + altarH + 0.005;
  const sconceFrontZ = platformZ + 1.0;
  const sconceBackZ = (pewStartZ + pewEndZ) / 2;
  const sconceEntranceZ = z + intHalfD - 3.5;

  return (
    <group>
      {/* sanctuary platform */}
      <mesh position={[x, platformH / 2, platformZ]} castShadow receiveShadow>
        <boxGeometry args={[intHalfW * 2, platformH, sanctuaryDepth]} />
        <meshStandardMaterial color={platform} />
      </mesh>

      {/* altar */}
      <mesh position={[x, platformH + altarH / 2, altarZ]} castShadow receiveShadow>
        <boxGeometry args={[altarW, altarH, altarD]} />
        <meshStandardMaterial color={wood} />
      </mesh>
      {/* altar cloth on top */}
      <mesh
        position={[x, platformH + altarH + 0.005, altarZ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[altarW + 0.25, altarD + 0.25]} />
        <meshStandardMaterial color={cloth} />
      </mesh>

      {/* pulpit (raised reading stand off to the side) */}
      <mesh position={[pulpitX, platformH + pulpitH / 2, pulpitZ]} castShadow receiveShadow>
        <boxGeometry args={[pulpitW, pulpitH, pulpitD]} />
        <meshStandardMaterial color={wood} />
      </mesh>
      {/* angled lectern top */}
      <mesh
        position={[pulpitX, platformH + pulpitH + 0.05, pulpitZ]}
        rotation={[-Math.PI / 8, 0, 0]}
        castShadow
      >
        <boxGeometry args={[pulpitW * 0.95, 0.05, pulpitD * 0.95]} />
        <meshStandardMaterial color={wood} />
      </mesh>

      {/* open book on the lectern — two cream pages flanking a dark gutter,
          parented to the lectern's tilted frame so it sits flat on the surface */}
      <group
        position={[pulpitX, platformH + pulpitH + 0.05, pulpitZ]}
        rotation={[-Math.PI / 8, 0, 0]}
      >
        {(() => {
          const pageW = pulpitW * 0.36;
          const pageT = 0.018;
          const pageD = pulpitD * 0.55;
          const gutterW = 0.012;
          const liftY = 0.05 / 2 + pageT / 2 + 0.001;
          return (
            <group position={[0, liftY, 0]}>
              <mesh position={[-pageW / 2 - gutterW / 2, 0, 0]} castShadow>
                <boxGeometry args={[pageW, pageT, pageD]} />
                <meshStandardMaterial color="#f5ecd0" />
              </mesh>
              <mesh position={[pageW / 2 + gutterW / 2, 0, 0]} castShadow>
                <boxGeometry args={[pageW, pageT, pageD]} />
                <meshStandardMaterial color="#f5ecd0" />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[gutterW, pageT * 0.9, pageD]} />
                <meshStandardMaterial color="#5a3a20" />
              </mesh>
            </group>
          );
        })()}
      </group>

      {/* large cross on the back wall above the altar/stage */}
      <mesh position={[x, crossY, crossZ]} castShadow>
        <boxGeometry args={[crossArmT, crossArmL, 0.08]} />
        <meshStandardMaterial color={cross} />
      </mesh>
      <mesh position={[x, crossY + crossArmL * 0.18, crossZ]} castShadow>
        <boxGeometry args={[crossArmL * 0.55, crossArmT, 0.08]} />
        <meshStandardMaterial color={cross} />
      </mesh>

      {/* altar candlesticks — emissive flame only, illumination comes from the
          sanctuary chandelier so we don't pay per-fragment cost for tiny lights */}
      {[-1, 1].map((side) => {
        const cx = x + side * (altarW * 0.32);
        return (
          <group key={`candle_${side}`}>
            <mesh position={[cx, candleBaseY + candleH / 2, altarZ]} castShadow>
              <cylinderGeometry args={[0.045, 0.05, candleH, 8]} />
              <meshStandardMaterial color={candleColor} />
            </mesh>
            <CandleFlame
              position={[cx, candleBaseY + candleH + 0.05, altarZ]}
              color={flameColor}
              phase={side * 1.7}
            />
          </group>
        );
      })}

      {/* nave fill — soft warm point light to lift the dark areas between the
          spotlight cones; cheap and omnidirectional so no pew row stays in shadow */}
      <pointLight
        position={[x, ridgeY * 0.55, (sconceFrontZ + sconceBackZ) / 2]}
        color={lightColor}
        intensity={28 * dimmer}
        distance={22}
        decay={1.5}
      />

      {/* sconces — two per side, mounted on the peaked ceiling slope and aimed
          across-and-down toward the nave so the interior reads as warmly lit */}
      {[
        { cz: sconceFrontZ,    targetZ: sconceFrontZ,           angle: 0.95, penumbra: 0.7 },
        { cz: sconceBackZ,     targetZ: sconceBackZ,            angle: 0.95, penumbra: 0.7 },
        // Entrance row sits only ~3.5m from the south wall — a wide cone
        // would graze the wall behind it. Narrower angle and lower penumbra
        // keep the spill off the back wall.
        { cz: sconceEntranceZ, targetZ: sconceEntranceZ - 4.0,  angle: 0.55, penumbra: 0.45 },
      ].flatMap(({ cz, targetZ, angle, penumbra }) =>
        [-1, 1].map((side) => (
          <Sconce
            key={`sconce_${side}_${cz}`}
            position={[x + side * (intHalfW - sconceInset), sconceY, cz]}
            target={[x - side * intHalfW * 0.5, 0.4, targetZ]}
            color={lightColor}
            fixtureColor={fixtureColor}
            glowColor={flameColor}
            intensity={70}
            dim={dimmer}
            angle={angle}
            penumbra={penumbra}
          />
        )),
      )}

      {/* pews — two columns flanking a center aisle, all facing the altar (-Z) */}
      {Array.from({ length: numRows }).map((_, i) => {
        const cz = pewStartZ + i * rowSpacing + rowSpacing / 2;
        const leftCx = x - aisleHalfW - pewSideW / 2;
        const rightCx = x + aisleHalfW + pewSideW / 2;
        // Plank stack: thin skirt below, thin seat plank on top, thin back
        // panel above on the +Z (rear) edge so each row reads as bench-shaped.
        const skirtCz = cz - seatD / 2 + skirtT / 2;
        const seatPlankY = seatTopY - seatPlankH / 2;
        const backCz = cz + seatD / 2 - backT / 2;
        const backCy = seatTopY + backH / 2;
        const renderBench = (cx: number) => (
          <>
            <mesh position={[cx, skirtH / 2, skirtCz]} castShadow>
              <boxGeometry args={[pewSideW, skirtH, skirtT]} />
              <meshStandardMaterial color={wood} />
            </mesh>
            <mesh position={[cx, seatPlankY, cz]} castShadow receiveShadow>
              <boxGeometry args={[pewSideW, seatPlankH, seatD]} />
              <meshStandardMaterial color={wood} />
            </mesh>
            <mesh position={[cx, backCy, backCz]} castShadow>
              <boxGeometry args={[pewSideW, backH, backT]} />
              <meshStandardMaterial color={wood} />
            </mesh>
          </>
        );
        return (
          <group key={`pew_${i}`}>
            {renderBench(leftCx)}
            {renderBench(rightCx)}
          </group>
        );
      })}
    </group>
  );
}

// Layered-sine flicker is cheaper than perlin and reads as a candle to the
// eye. Three frequencies + phase offsets per candle keep the two altar
// flames visibly out of sync. Each candle also drives a faint warm
// pointLight so nearby surfaces (altar cloth, cross, pew fronts) pick up
// the same flicker.
function CandleFlame({
  position,
  color,
  baseEmissive = 4,
  phase = 0,
}: {
  position: [number, number, number];
  color: string;
  baseEmissive?: number;
  phase?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const baseLight = 4;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const f =
      0.5 +
      0.28 * Math.sin(t * 7.3 + phase) +
      0.16 * Math.sin(t * 13.1 + phase * 1.7) +
      0.08 * Math.sin(t * 21.7 + phase * 2.3);
    const flicker = Math.max(0, Math.min(1, f));
    const fade = 0.6 + flicker * 0.8;
    if (matRef.current) matRef.current.emissiveIntensity = baseEmissive * fade;
    if (meshRef.current) {
      meshRef.current.scale.set(
        0.92 + flicker * 0.16,
        0.85 + flicker * 0.3,
        0.92 + flicker * 0.16,
      );
    }
    if (lightRef.current) lightRef.current.intensity = baseLight * fade;
  });
  return (
    <>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial
          ref={matRef}
          color="#ffd27a"
          emissive={color}
          emissiveIntensity={baseEmissive}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={position}
        color="#ffaa44"
        intensity={baseLight}
        distance={3.5}
        decay={1.6}
      />
    </>
  );
}

function Sconce({
  position,
  target,
  color,
  fixtureColor,
  glowColor,
  intensity,
  dim = 1,
  angle = 0.95,
  penumbra = 0.7,
}: {
  position: [number, number, number];
  target: [number, number, number];
  color: string;
  fixtureColor: string;
  glowColor: string;
  intensity: number;
  dim?: number;
  angle?: number;
  penumbra?: number;
}) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  // SpotLight aims from its position toward `target`'s world position; binding
  // the ref once is enough because both nodes live in the same parent group.
  useEffect(() => {
    const l = lightRef.current;
    const t = targetRef.current;
    if (l && t) l.target = t;
  }, []);
  return (
    <>
      <object3D ref={targetRef} position={target} />
      <spotLight
        ref={lightRef}
        position={position}
        color={color}
        intensity={intensity * dim}
        distance={20}
        angle={angle}
        penumbra={penumbra}
        decay={1.5}
        castShadow={false}
      />
      <mesh position={position}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial
          color={fixtureColor}
          emissive={glowColor}
          emissiveIntensity={3 * dim}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

// Wall-mounted lightswitch: a thin plate with a small lever. By default the
// plate faces -Z (mounted on a wall whose room-side faces -Z); pass
// rotationY=Math.PI to flip it for a back-wall (north) mount where the
// room-side faces +Z. Lever tilt tracks the dimmer for an at-a-glance read.
function LightSwitch({
  x,
  y,
  z,
  rotationY = 0,
}: {
  x: number;
  y: number;
  z: number;
  rotationY?: number;
}) {
  const dimmer = useChurchLightingStore((s) => s.dimmer);
  const plateW = 0.12;
  const plateH = 0.18;
  const plateT = 0.025;
  const leverW = 0.035;
  const leverH = 0.07;
  const leverT = 0.025;
  const tilt = (dimmer - 0.5) * 1.0;
  return (
    <group position={[x, y, z]} rotation={[0, rotationY, 0]} scale={1.25}>
      <mesh position={[0, 0, -plateT / 2]} castShadow>
        <boxGeometry args={[plateW, plateH, plateT]} />
        <meshStandardMaterial color="#f1ece1" />
      </mesh>
      <mesh
        position={[0, 0, -plateT - leverT / 2 + 0.005]}
        rotation={[tilt, 0, 0]}
        castShadow
      >
        <boxGeometry args={[leverW, leverH, leverT]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}
