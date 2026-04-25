import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

const GROW_SECONDS = 3;
const MAX_RADIUS = 0.9;

export default function BloodPool() {
  const meshRef = useRef<THREE.Mesh>(null);
  const ageRef = useRef(0);

  useFrame((_, dt) => {
    const m = meshRef.current;
    if (!m) return;
    if (ageRef.current >= GROW_SECONDS) return;
    ageRef.current = Math.min(GROW_SECONDS, ageRef.current + dt);
    const t = ageRef.current / GROW_SECONDS;
    const r = MAX_RADIUS * Math.sqrt(t);
    m.scale.setScalar(r);
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 0.08, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={0}
      renderOrder={2}
    >
      <circleGeometry args={[1, 20]} />
      <meshBasicMaterial
        color="#4a0808"
        transparent
        opacity={0.9}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
