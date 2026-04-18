import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export type Tracer = {
  id: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  bornAt: number;
};

const TRACERS: Tracer[] = [];
let nextId = 1;
const TRACER_LIFE = 0.08;

export function spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
  TRACERS.push({ id: nextId++, from: from.clone(), to: to.clone(), bornAt: performance.now() });
  if (TRACERS.length > 64) TRACERS.shift();
}

export default function HitFx() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const now = performance.now();
    // expire
    while (TRACERS.length && (now - TRACERS[0].bornAt) / 1000 > TRACER_LIFE) TRACERS.shift();
    // sync children to TRACERS list
    while (groupRef.current.children.length < TRACERS.length) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: '#fff5b4' });
      groupRef.current.add(new THREE.Line(geom, mat));
    }
    while (groupRef.current.children.length > TRACERS.length) {
      groupRef.current.remove(groupRef.current.children[groupRef.current.children.length - 1]);
    }
    for (let i = 0; i < TRACERS.length; i++) {
      const t = TRACERS[i];
      const line = groupRef.current.children[i] as THREE.Line;
      const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      positions[0] = t.from.x;
      positions[1] = t.from.y;
      positions[2] = t.from.z;
      positions[3] = t.to.x;
      positions[4] = t.to.y;
      positions[5] = t.to.z;
      (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const age = (now - t.bornAt) / 1000;
      const alpha = Math.max(0, 1 - age / TRACER_LIFE);
      (line.material as THREE.LineBasicMaterial).opacity = alpha;
      (line.material as THREE.LineBasicMaterial).transparent = true;
    }
  });

  return <group ref={groupRef} />;
}
