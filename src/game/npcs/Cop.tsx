import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  PED_WAYPOINTS,
  buildingInteriorAt,
  lineOfSightClear,
  type Waypoint,
} from '@/game/world/cityLayout';
import { registerNpc } from './npcRegistry';
import CharacterModel, { type CharacterAction } from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import { useGameStore } from '@/state/gameStore';
import { spawnTracer } from '@/game/weapons/HitFx';
import { playGunshot } from '@/game/audio/synth';

const PATROL_SPEED = 1.2;
const CHASE_SPEED = 3.8;
const MAX_HP = 80;
const SHOOT_RANGE = 14;
const SHOOT_COOLDOWN_S = 1.1;
const SHOT_DAMAGE = 8;
const SHOT_HIT_CHANCE = 0.45;
const PLAYER_HIT_HEIGHT = 1.2;
const SPAWN_NEAR_MIN = 50; // at least one city block away
const SPAWN_NEAR_MAX = 90;

const COP_VARIANT = 'characterMaleC' as const;
const COP_RADIUS = 0.4;

// Check whether a point, padded by the cop's body radius, intersects a
// building interior. Tests the point plus 4 compass offsets — cheaper than a
// real AABB vs circle test and more than enough to keep the model off walls.
function blockedAt(x: number, z: number): boolean {
  if (buildingInteriorAt(x, z)) return true;
  if (buildingInteriorAt(x + COP_RADIUS, z)) return true;
  if (buildingInteriorAt(x - COP_RADIUS, z)) return true;
  if (buildingInteriorAt(x, z + COP_RADIUS)) return true;
  if (buildingInteriorAt(x, z - COP_RADIUS)) return true;
  return false;
}

function moveWithSlide(
  pos: THREE.Vector3,
  dx: number,
  dz: number,
): void {
  const tryX = pos.x + dx;
  const tryZ = pos.z + dz;
  if (!blockedAt(tryX, tryZ)) {
    pos.x = tryX;
    pos.z = tryZ;
    return;
  }
  // Slide along X only
  if (!blockedAt(tryX, pos.z)) {
    pos.x = tryX;
    return;
  }
  // Slide along Z only
  if (!blockedAt(pos.x, tryZ)) {
    pos.z = tryZ;
  }
}

function pickRandomWaypointId(): string {
  const ids = Object.keys(PED_WAYPOINTS);
  return ids[Math.floor(Math.random() * ids.length)];
}

function pickNearPlayerWaypointId(): string {
  const ids = Object.keys(PED_WAYPOINTS);
  const [px, , pz] = useGameStore.getState().player.position;
  const near = ids.filter((id) => {
    const [x, , z] = PED_WAYPOINTS[id].pos;
    const d = Math.hypot(x - px, z - pz);
    return d >= SPAWN_NEAR_MIN && d <= SPAWN_NEAR_MAX;
  });
  const pool = near.length ? near : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function Cop({
  seed,
  patrol = false,
  startPos,
}: {
  seed: number;
  patrol?: boolean;
  startPos?: [number, number, number];
}) {
  const id = useMemo(() => `cop_${seed}_${Math.random().toString(36).slice(2, 7)}`, [seed]);
  const startId = useMemo(
    () => (patrol ? pickRandomWaypointId() : pickNearPlayerWaypointId()),
    [patrol],
  );
  const start = PED_WAYPOINTS[startId];
  const initialPos = startPos ?? start.pos;
  const groupRef = useRef<THREE.Group>(null);
  const [hp, setHp] = useState(MAX_HP);
  const [flash, setFlash] = useState(0);
  const [action, setAction] = useState<CharacterAction>('holding-right');
  const dead = hp <= 0;

  const stateRef = useRef<{
    pos: THREE.Vector3;
    targetId: string;
    patrolTarget: THREE.Vector3;
    shootCd: number;
    wasMoving: boolean;
    wasShooting: boolean;
  }>({
    pos: new THREE.Vector3(...initialPos),
    targetId: startId,
    patrolTarget: new THREE.Vector3(...start.pos),
    shootCd: 0,
    wasMoving: false,
    wasShooting: false,
  });

  function pickNext(currentId: string, prevId: string | null): Waypoint {
    const cur = PED_WAYPOINTS[currentId];
    const choices = cur.neighbors.filter((n) => n !== prevId);
    const list = choices.length ? choices : cur.neighbors;
    return PED_WAYPOINTS[list[Math.floor(Math.random() * list.length)]];
  }

  useEffect(() => {
    return registerNpc({
      id,
      getPosition: () => stateRef.current.pos,
      radius: 0.55,
      height: 1.8,
      alive: !dead,
      takeHit: (damage: number) => {
        setHp((h) => {
          const next = Math.max(0, h - damage);
          if (h > 0 && next === 0) useGameStore.getState().bumpHeat(35);
          return next;
        });
        setFlash(1);
      },
    });
  }, [id, dead]);

  useEffect(() => {
    if (flash <= 0) return;
    const t = window.setTimeout(() => setFlash(0), 90);
    return () => window.clearTimeout(t);
  }, [flash]);

  useFrame((_, dt) => {
    if (dead) {
      if (action !== 'die') setAction('die');
      return;
    }
    const s = stateRef.current;
    s.shootCd = Math.max(0, s.shootCd - dt);

    const wanted = useGameStore.getState().wanted;
    const playerPos = useGameStore.getState().player.position;
    const playerHp = useGameStore.getState().player.health;
    const target = new THREE.Vector3(playerPos[0], 0, playerPos[2]);
    const toPlayer = target.clone().sub(s.pos);
    const distToPlayer = toPlayer.length();
    const hostile = playerHp > 0 && wanted.heat > 0;

    let facingDir: THREE.Vector3 | null = null;
    let moving = false;
    let shooting = false;

    if (hostile) {
      // chase or shoot
      const canSee = lineOfSightClear(s.pos.x, s.pos.z, target.x, target.z);
      if (distToPlayer > SHOOT_RANGE || !canSee) {
        const dir = toPlayer.clone().normalize();
        const step = Math.min(CHASE_SPEED * dt, distToPlayer);
        moveWithSlide(s.pos, dir.x * step, dir.z * step);
        facingDir = dir;
        moving = true;
      } else {
        facingDir = toPlayer.clone().normalize();
        if (s.shootCd <= 0) {
          s.shootCd = SHOOT_COOLDOWN_S;
          shooting = true;
          playGunshot('handgun');
          const shooterOrigin = s.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          const aim = target
            .clone()
            .setY(PLAYER_HIT_HEIGHT)
            .sub(shooterOrigin)
            .normalize();
          const endpoint = shooterOrigin.clone().addScaledVector(aim, distToPlayer);
          spawnTracer(shooterOrigin, endpoint);
          if (Math.random() < SHOT_HIT_CHANCE) {
            useGameStore.getState().damagePlayer(SHOT_DAMAGE);
          }
        }
      }
    } else {
      // patrol
      const dir = s.patrolTarget.clone().sub(s.pos);
      const dist = dir.length();
      if (dist < 0.25) {
        const next = pickNext(s.targetId, null);
        s.targetId = next.id;
        s.patrolTarget.set(...next.pos);
      } else {
        dir.normalize();
        const step = Math.min(PATROL_SPEED * dt, dist);
        moveWithSlide(s.pos, dir.x * step, dir.z * step);
        facingDir = dir;
        moving = true;
      }
    }

    if (groupRef.current) {
      groupRef.current.position.set(s.pos.x, 0, s.pos.z);
      if (facingDir) groupRef.current.rotation.y = Math.atan2(facingDir.x, facingDir.z);
    }

    // action selection
    let next: CharacterAction;
    if (shooting) next = 'holding-right-shoot';
    else if (moving) next = hostile ? 'armed-sprint' : 'armed-walk';
    else next = 'holding-right';
    if (next !== action) setAction(next);
    s.wasMoving = moving;
    s.wasShooting = shooting;
  });

  const flashColor = flash ? '#ff4444' : '#3865c4';

  const primitiveFallback = (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.8, 4, 8]} />
        <meshStandardMaterial color={flashColor} />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color={flash ? '#ff4444' : '#e3b27a'} />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      <GltfBoundary fallback={primitiveFallback}>
        <CharacterModel
          variant={COP_VARIANT}
          action={action}
          weaponVariant={dead ? null : 'weaponPistol'}
        />
      </GltfBoundary>
      {!dead && hp < MAX_HP && (
        <group position={[0, 2.0, 0]}>
          <mesh>
            <planeGeometry args={[0.8, 0.08]} />
            <meshBasicMaterial color="#222" />
          </mesh>
          <mesh position={[-(0.8 * (1 - hp / MAX_HP)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.8 * (hp / MAX_HP), 0.08]} />
            <meshBasicMaterial color={hp > MAX_HP / 2 ? '#3fa362' : '#b04a3f'} />
          </mesh>
        </group>
      )}
    </group>
  );
}
