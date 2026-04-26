import * as THREE from 'three';
import { useMemo } from 'react';

// Parachute canopy + risers, parented inside the player rigid body. The
// canopy is a half-sphere (red & white alternating wedges to read from a
// distance), and four risers connect the canopy edge to the player's
// shoulders. Visible only while the player is descending under canopy
// after a mid-air bailout (Player.tsx owns the deploy/disengage logic).
const CANOPY_RADIUS = 1.6;
const CANOPY_HEIGHT_ABOVE_PLAYER = 2.6;
const RISER_LENGTH = CANOPY_HEIGHT_ABOVE_PLAYER - 0.3;
const RISER_RADIUS = 0.018;
const RISER_DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const CANOPY_RED = '#e84545';
const CANOPY_WHITE = '#f4f4f4';
const RISER_COLOR = '#1a1a1a';

// Build a hemisphere with alternating red/white wedge groups. SphereGeometry
// supports group ranges over its index buffer, so we set 8 wedges by carving
// the phi range [0, 2π] into 8 equal slices and assigning materials per slice.
function useCanopyGeometry(): THREE.BufferGeometry {
  return useMemo(() => {
    const wedges = 8;
    const radial = 16;
    const heightSegs = 8;
    const geom = new THREE.SphereGeometry(
      CANOPY_RADIUS,
      radial,
      heightSegs,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    // Reset & build per-wedge groups so MultiMaterial alternates red/white.
    geom.clearGroups();
    const indexCount = geom.index ? geom.index.count : 0;
    const facesPerWedge = indexCount / wedges;
    for (let i = 0; i < wedges; i++) {
      geom.addGroup(Math.floor(i * facesPerWedge), Math.floor(facesPerWedge), i % 2);
    }
    return geom;
  }, []);
}

export default function Parachute({ visible }: { visible: boolean }) {
  const canopyGeom = useCanopyGeometry();
  const canopyMaterials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({
        color: CANOPY_RED,
        side: THREE.DoubleSide,
        roughness: 0.85,
      }),
      new THREE.MeshStandardMaterial({
        color: CANOPY_WHITE,
        side: THREE.DoubleSide,
        roughness: 0.85,
      }),
    ],
    [],
  );

  // Pre-compute riser transforms: a thin cylinder per diagonal, tilted from
  // the harness shoulder to the canopy rim above. The base of each cylinder
  // sits at the harness; the top reaches the canopy edge.
  type RiserTransform = {
    pos: [number, number, number];
    rot: [number, number, number];
    len: number;
  };
  const risers = useMemo<RiserTransform[]>(() => {
    return RISER_DIAGONALS.map(([dx, dz]) => {
      const tipX = CANOPY_RADIUS * dx;
      const tipZ = CANOPY_RADIUS * dz;
      const tipY = RISER_LENGTH;
      const len = Math.hypot(tipX, tipY, tipZ);
      // Rotate the cylinder's default +Y axis onto the harness→rim direction.
      // Axis = (+Y) × (tip/len) = (tipZ, 0, -tipX)/horiz; angle = acos(tipY/len).
      const horiz = Math.hypot(tipX, tipZ) || 1;
      const axis = new THREE.Vector3(tipZ / horiz, 0, -tipX / horiz);
      const angle = Math.acos(tipY / len);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      return {
        pos: [tipX / 2, tipY / 2, tipZ / 2],
        rot: [e.x, e.y, e.z],
        len,
      };
    });
  }, []);

  return (
    <group visible={visible} position={[0, CANOPY_HEIGHT_ABOVE_PLAYER - RISER_LENGTH, 0]}>
      {/* Canopy: half-sphere with alternating red/white wedges. */}
      <mesh
        geometry={canopyGeom}
        material={canopyMaterials}
        position={[0, RISER_LENGTH, 0]}
        castShadow
      />
      {/* Risers from harness to canopy rim. */}
      {risers.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={r.rot}>
          <cylinderGeometry args={[RISER_RADIUS, RISER_RADIUS, r.len, 6]} />
          <meshStandardMaterial color={RISER_COLOR} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
