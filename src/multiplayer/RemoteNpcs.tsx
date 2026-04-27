import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import CharacterModel, { type CharacterAction } from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import { PEDESTRIAN_VARIANTS } from '@/game/world/cityAssets';
import {
  NPC_INTERP_DELAY_MS,
  readInterpolatedNpc,
  useRemoteNpcsList,
  type RemoteNpcIdentity,
} from './remoteNpcsStore';
import { actionFromId, NPC_KIND_COP } from './protocol';
import { serverNow } from './clock';
import { useState } from 'react';

// Mounted on clients during MP sessions. Renders one visual-only character
// per NPC id reported by the host. NPCs are non-physical here — the host
// runs all AI/collision; clients just play the animation.

export default function RemoteNpcs() {
  const list = useRemoteNpcsList((s) => s.list);
  return (
    <>
      {Object.values(list).map((n) => (
        <RemoteNpc key={n.id} identity={n} />
      ))}
    </>
  );
}

function RemoteNpc({ identity }: { identity: RemoteNpcIdentity }) {
  const groupRef = useRef<THREE.Group>(null);
  const [action, setAction] = useState<CharacterAction>('walk');
  const lastAction = useRef<CharacterAction>('walk');

  useFrame(() => {
    if (!groupRef.current) return;
    const renderTime = serverNow() - NPC_INTERP_DELAY_MS;
    const pose = readInterpolatedNpc(identity.id, renderTime);
    if (!pose) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.set(pose.pos[0], 0, pose.pos[2]);
    groupRef.current.rotation.y = pose.yaw;
    const next = actionFromId(pose.action) as CharacterAction;
    if (next !== lastAction.current) {
      lastAction.current = next;
      setAction(next);
    }
  });

  const variant = PEDESTRIAN_VARIANTS[identity.variantIdx] ?? PEDESTRIAN_VARIANTS[0];
  const isCop = identity.kind === NPC_KIND_COP;

  return (
    <group ref={groupRef} visible={false}>
      <GltfBoundary
        fallback={
          <group>
            <mesh position={[0, 0.8, 0]} castShadow>
              <capsuleGeometry args={[0.28, 0.8, 4, 8]} />
              <meshStandardMaterial color={isCop ? '#3865c4' : '#999'} />
            </mesh>
            <mesh position={[0, 1.55, 0]} castShadow>
              <sphereGeometry args={[0.22, 10, 10]} />
              <meshStandardMaterial color="#e3b27a" />
            </mesh>
          </group>
        }
      >
        <CharacterModel
          variant={variant}
          action={action}
          weaponVariant={isCop ? 'weaponPistol' : null}
        />
      </GltfBoundary>
    </group>
  );
}
