import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  max: number;
};

const SMOKE_COUNT = 10;

export default function CarSmoke({
  getPos,
  color,
}: {
  getPos: () => THREE.Vector3 | null;
  color: string;
}) {
  const particles = useRef<Particle[]>(
    Array.from({ length: SMOKE_COUNT }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: Math.random() * 1.5,
      max: 1.2 + Math.random() * 0.6,
    })),
  );
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const rngVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const carPos = getPos();
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = particles.current[i];
      p.age += dt;
      if (p.age >= p.max) {
        if (!carPos) continue;
        rngVec.set(
          (Math.random() - 0.5) * 0.5,
          0.5 + Math.random() * 0.2,
          (Math.random() - 0.5) * 0.5,
        );
        p.pos.copy(carPos).add(rngVec);
        p.vel.set(
          (Math.random() - 0.5) * 0.3,
          0.6 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.3,
        );
        p.age = 0;
        p.max = 1.2 + Math.random() * 0.6;
      } else {
        p.pos.addScaledVector(p.vel, dt);
        p.vel.y = Math.max(0.2, p.vel.y - 0.1 * dt);
      }
      const m = meshes.current[i];
      if (!m) continue;
      m.position.copy(p.pos);
      const t = p.age / p.max;
      const scale = 0.35 + t * 1.4;
      m.scale.setScalar(scale);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.55 * (1 - t));
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
          <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function smokeColorForDamage(damage: number): string | null {
  if (damage >= 90) return '#3a3a3a';
  if (damage >= 65) return '#c4c4c4';
  return null;
}
