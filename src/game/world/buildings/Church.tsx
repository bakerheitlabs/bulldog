import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useCityModel } from '../cityAssets';
import GltfBoundary from '../GltfBoundary';

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

  // Doorway split on the +Z face, mirroring HospitalInterior's east-facade split.
  const sSegLen = Math.max(0, halfFW - doorHalf);
  const sWestCx = (westX + (x - doorHalf)) / 2;
  const sEastCx = ((x + doorHalf) + eastX) / 2;

  return (
    <group>
      {/* Floor collider so the player stands on the church's interior floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[halfFW, 0.05, halfFD]} position={[x, 0.05, z]} />
      </RigidBody>

      {/* North wall */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[halfFW, wallH / 2, wallT / 2]}
          position={[x, wallH / 2, northZ + wallT / 2]}
        />
      </RigidBody>
      {/* East wall */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[wallT / 2, wallH / 2, halfFD]}
          position={[eastX - wallT / 2, wallH / 2, z]}
        />
      </RigidBody>
      {/* West wall */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[wallT / 2, wallH / 2, halfFD]}
          position={[westX + wallT / 2, wallH / 2, z]}
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

      <ChurchInterior x={x} z={z} halfW={halfFW} halfD={halfFD} />

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
}: {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}) {
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
  const pulpitZ = platformZ + 0.4;

  const crossArmL = 1.6;
  const crossArmT = 0.18;
  const crossY = Math.min(5, platformH + altarH + 2.2);
  const crossZ = z - intHalfD + 0.15;

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

      {/* cross on the back wall above the altar */}
      <mesh position={[x, crossY, crossZ]} castShadow>
        <boxGeometry args={[crossArmT, crossArmL, 0.05]} />
        <meshStandardMaterial color={cross} />
      </mesh>
      <mesh position={[x, crossY + crossArmL * 0.18, crossZ]} castShadow>
        <boxGeometry args={[crossArmL * 0.55, crossArmT, 0.05]} />
        <meshStandardMaterial color={cross} />
      </mesh>

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
