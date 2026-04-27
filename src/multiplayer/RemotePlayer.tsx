import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import CharacterModel, { type CharacterAction } from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import { PLAYER_VARIANT, WEAPON_MODEL } from '@/game/world/cityAssets';
import { readInterpolated, INTERP_DELAY_MS } from './remotePlayersStore';
import { actionFromId, equippedFromId } from './protocol';
import { serverNow } from './clock';
import { useState } from 'react';

// Visual-only render of another player. No physics body, no input. The pose
// comes from remotePlayersStore (interpolated 100ms behind real time so we
// always have two samples to lerp between). The character model and weapon
// asset are the same as Player.tsx for visual parity.

const FALLBACK_HEIGHT = 1.0;

export default function RemotePlayer({ peerId, name }: { peerId: string; name: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const [action, setAction] = useState<CharacterAction>('idle');
  const [equipped, setEquipped] = useState<string | null>(null);
  const lastAction = useRef<CharacterAction>('idle');
  const lastEquipped = useRef<string | null>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const renderTime = serverNow() - INTERP_DELAY_MS;
    const pose = readInterpolated(peerId, renderTime);
    if (!pose) {
      // Hide until we have a sample.
      groupRef.current.visible = false;
      return;
    }
    // When the peer is in a vehicle, hide their avatar — the car they're
    // driving is rendered via useRemoteCarPose at the same world pose.
    if (pose.vehicleId) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;
    groupRef.current.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    // Character mesh faces -Z by default; CharacterModel internal rotation
    // already accounts for the +π offset that Player.tsx uses (mesh.rotation.y
    // = yaw + π). Mirror that here.
    groupRef.current.rotation.y = pose.yaw + Math.PI;

    const nextAction = actionFromId(pose.action) as CharacterAction;
    if (nextAction !== lastAction.current) {
      lastAction.current = nextAction;
      setAction(nextAction);
    }
    const nextEquipped = equippedFromId(pose.equipped);
    if (nextEquipped !== lastEquipped.current) {
      lastEquipped.current = nextEquipped;
      setEquipped(nextEquipped);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <GltfBoundary
        fallback={
          <group>
            <mesh position={[0, 0, 0]} castShadow>
              <capsuleGeometry args={[0.4, FALLBACK_HEIGHT, 4, 8]} />
              <meshStandardMaterial color="#c83a3a" />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
              <sphereGeometry args={[0.28, 12, 12]} />
              <meshStandardMaterial color="#e3b27a" />
            </mesh>
          </group>
        }
      >
        <CharacterModel
          variant={PLAYER_VARIANT}
          action={action}
          yBase={-0.9}
          weaponVariant={equipped ? WEAPON_MODEL[equipped as 'handgun' | 'shotgun' | 'smg'] : null}
        />
      </GltfBoundary>
      {/* Floating name tag */}
      <RemoteNameTag name={name} />
    </group>
  );
}

function RemoteNameTag({ name }: { name: string }) {
  const ref = useRef<THREE.Sprite>(null);
  const texture = useRef<THREE.CanvasTexture | null>(null);

  if (!texture.current) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillStyle = '#f5cb5c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 24), canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    texture.current = tex;
  }

  useFrame(({ camera }) => {
    if (!ref.current) return;
    ref.current.lookAt(camera.position);
  });

  return (
    <sprite ref={ref} position={[0, 1.7, 0]} scale={[1.2, 0.3, 1]}>
      <spriteMaterial map={texture.current} transparent depthTest={false} />
    </sprite>
  );
}
