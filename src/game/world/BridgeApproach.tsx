import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  BRIDGE_APPROACH_BUILDINGS,
  BRIDGE_APPROACH_TREES,
} from './bridgeApproachData';

const ROOF_COLOR = '#222';

// Renders the small coastal neighborhood between the city's row-9 east
// arterial and the bridge head. Pure visuals (boxes + colliders); no AI
// integration. Mirrors the simple house style used in Island2Village so the
// two off-grid clusters read consistently.
export default function BridgeApproach() {
  return (
    <group>
      {BRIDGE_APPROACH_BUILDINGS.map((b) => {
        const halfH = b.height / 2;
        return (
          <group key={b.id}>
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider
                args={[b.width / 2, halfH, b.depth / 2]}
                position={[b.x, halfH, b.z]}
              />
            </RigidBody>
            <mesh position={[b.x, halfH, b.z]} castShadow receiveShadow>
              <boxGeometry args={[b.width, b.height, b.depth]} />
              <meshStandardMaterial color={b.color} />
            </mesh>
            <mesh position={[b.x, b.height + 0.05, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[b.width, b.depth]} />
              <meshStandardMaterial color={ROOF_COLOR} />
            </mesh>
          </group>
        );
      })}
      {BRIDGE_APPROACH_TREES.map((t, i) => (
        <group key={`ba_tree_${i}`} position={[t.x, 0, t.z]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 3]} />
            <meshStandardMaterial color="#553a22" />
          </mesh>
          <mesh position={[0, 4, 0]} castShadow>
            <coneGeometry args={[1.6, 4, 8]} />
            <meshStandardMaterial color="#2e6b34" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
