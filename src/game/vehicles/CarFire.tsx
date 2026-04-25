import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  max: number;
};

const FIRE_COUNT = 16;
const COLORS = ['#ffe27a', '#ff9a2b', '#ff5020', '#b02010'];

export default function CarFire({ getPos }: { getPos: () => THREE.Vector3 | null }) {
  const particles = useRef<Particle[]>(
    Array.from({ length: FIRE_COUNT }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: Math.random() * 0.6,
      max: 0.5 + Math.random() * 0.4,
    })),
  );
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const rngVec = useMemo(() => new THREE.Vector3(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const carPos = getPos();
    for (let i = 0; i < FIRE_COUNT; i++) {
      const p = particles.current[i];
      p.age += dt;
      if (p.age >= p.max) {
        if (!carPos) continue;
        rngVec.set(
          (Math.random() - 0.5) * 0.9,
          0.3 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.9,
        );
        p.pos.copy(carPos).add(rngVec);
        p.vel.set(
          (Math.random() - 0.5) * 0.5,
          1.4 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.5,
        );
        p.age = 0;
        p.max = 0.5 + Math.random() * 0.4;
      } else {
        p.pos.addScaledVector(p.vel, dt);
        p.vel.y += 0.4 * dt;
      }
      const m = meshes.current[i];
      if (!m) continue;
      m.position.copy(p.pos);
      const t = p.age / p.max;
      const scale = 0.3 + t * 0.9;
      m.scale.setScalar(scale);
      const mat = m.material as THREE.MeshBasicMaterial;
      const colorIdx = Math.min(COLORS.length - 1, Math.floor(t * COLORS.length));
      color.set(COLORS[colorIdx]);
      mat.color.copy(color);
      mat.opacity = Math.max(0, 0.85 * (1 - t));
    }
  });

  return (
    <group>
      {particles.current.map((_, i) => (
        <mesh
          key={i}
          ref={(r) => {
            meshes.current[i] = r;
          }}
        >
          <sphereGeometry args={[0.3, 6, 6]} />
          <meshBasicMaterial color={COLORS[0]} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
