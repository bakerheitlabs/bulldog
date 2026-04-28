import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';

// Procedural stadium: oval seating bowl wrapping a green field. Built from
// cheap primitives so it slots into the city block dispatch alongside the
// other landmark components without pulling in a GLB. The bowl is segmented
// (radial cylinders rotated around the center) to suggest tiered seating
// without needing a custom geometry. Roof is open.
export default function Stadium({
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
  const fieldW = w * 0.55;
  const fieldD = d * 0.65;
  const wallT = 1.2;
  const seatH = h;
  // Outer wall: a thick rectangular ring around the perimeter.
  const segs: Array<{ cx: number; cz: number; sx: number; sz: number }> = [
    { cx: x, cz: z - d / 2 + wallT / 2, sx: w, sz: wallT },
    { cx: x, cz: z + d / 2 - wallT / 2, sx: w, sz: wallT },
    { cx: x - w / 2 + wallT / 2, cz: z, sx: wallT, sz: d - wallT * 2 },
    { cx: x + w / 2 - wallT / 2, cz: z, sx: wallT, sz: d - wallT * 2 },
  ];
  return (
    <group>
      {/* Concrete plaza apron around the bowl */}
      <mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#8a8d92" />
      </mesh>
      {/* Field grass */}
      <mesh position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[fieldW, fieldD]} />
        <meshStandardMaterial color="#3e7a42" />
      </mesh>
      {/* Center circle */}
      <mesh position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.min(fieldW, fieldD) * 0.12, Math.min(fieldW, fieldD) * 0.13, 24]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      {/* Halfway line */}
      <mesh position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, fieldD]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      {/* Outer seating bowl: 4 thick wall segments with stepped seats on top */}
      {segs.map((s, i) => (
        <group key={`seg_${i}`}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[s.sx / 2, seatH / 2, s.sz / 2]}
              position={[s.cx, seatH / 2, s.cz]}
            />
          </RigidBody>
          <mesh position={[s.cx, seatH / 2, s.cz]} castShadow receiveShadow>
            <boxGeometry args={[s.sx, seatH, s.sz]} />
            <meshStandardMaterial color="#7a7d83" />
          </mesh>
          {/* Seat tier highlight stripe halfway up the wall facing inward */}
          <mesh position={[s.cx, seatH * 0.55, s.cz]} castShadow>
            <boxGeometry args={[s.sx * 0.92, seatH * 0.08, s.sz * 0.92]} />
            <meshStandardMaterial color="#c94a2a" />
          </mesh>
        </group>
      ))}
      {/* Floodlight pylons at the four corners */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <group
          key={`pylon_${i}`}
          position={[x + (sx * (w / 2 - wallT * 1.5)), 0, z + (sz * (d / 2 - wallT * 1.5))]}
        >
          <mesh position={[0, h * 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.35, h * 2.8, 8]} />
            <meshStandardMaterial color="#3a3d44" />
          </mesh>
          <mesh position={[0, h * 2.85, 0]} castShadow>
            <boxGeometry args={[1.6, 0.4, 1.6]} />
            <meshStandardMaterial color="#1a1a20" emissive="#ffe9a8" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      {/* Roof-edge sign on the south face */}
      <Text
        position={[x, h + 0.4, z + d / 2 - wallT - 0.02]}
        rotation={[0, Math.PI, 0]}
        fontSize={1.6}
        color="#f5cb5c"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000"
      >
        STADIUM
      </Text>
    </group>
  );
}
