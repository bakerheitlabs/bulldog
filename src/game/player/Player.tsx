import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { getHospitalRespawn, getPlayerSpawn } from '@/game/world/cityLayout';
import { consumeTeleport, peekTeleport } from '@/game/world/teleport';
import { playFootstep } from '@/game/audio/synth';
import {
  useVehicleStore,
  readDrivenCarPos,
  readDrivenCarYaw,
  readDrivenPlanePos,
  readDrivenPlaneYaw,
  clearDrivenCarPose,
  clearDrivenPlanePose,
} from '@/game/vehicles/vehicleState';
import { cameraState } from './cameraState';
import { useKeyboard } from './useKeyboard';
import { setLocalAction, setLocalYaw } from './playerLocalState';
import CharacterModel, { type CharacterAction } from '@/game/characters/CharacterModel';
import GltfBoundary from '@/game/world/GltfBoundary';
import { PLAYER_VARIANT, WEAPON_MODEL } from '@/game/world/cityAssets';
import Parachute from './Parachute';

const SPEED = 5;
const SPRINT = 9;
// Mid-air bailout deploys a parachute when the plane is at least this many
// meters above the runway. Below it, exit snaps to ground next to the plane
// (current behavior — no value in deploying for a 1m hop).
const PARACHUTE_DEPLOY_ALTITUDE = 3;
// Vertical descent rate under canopy (m/s, downward). Slow enough that the
// player has time to steer and read the city below; not so slow that the
// scene drags.
const PARACHUTE_DESCENT_SPEED = 4;
// Max horizontal speed the player can steer to under canopy. Lighter than
// on-foot SPEED so the canopy reads as the dominant force.
const PARACHUTE_LATERAL_SPEED = 4;
// Y at which the parachute auto-disengages — anything below this is "feet
// near the ground," and we hand control back to normal walking physics.
const PARACHUTE_LAND_Y = 1.4;
// Stable references — @react-three/rapier reapplies every mutable RigidBody
// prop (including `type` AND `position`) when any of them changes by ref.
// A fresh object/array each render would override the manual setBodyType we
// do when entering / exiting a car AND teleport the body back to spawn.
const PLAYER_USER_DATA = { type: 'player' };
const PLAYER_ENABLED_ROTATIONS: [boolean, boolean, boolean] = [false, false, false];

const Player = forwardRef<RapierRigidBody | null, { paused: boolean }>(function Player(
  { paused },
  ref,
) {
  const rigid = useRef<RapierRigidBody | null>(null);
  const meshRef = useRef<THREE.Group>(null);
  const keys = useKeyboard();
  const spawn = useRef(getPlayerSpawn());
  const setPlayerTransform = useGameStore((s) => s.setPlayerTransform);
  const stepAccum = useRef(0);
  const lastPos = useRef<{ x: number; z: number } | null>(null);
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const inVehicle = drivenCarId != null || drivenPlaneId != null;
  const wasDriving = useRef(false);
  const wasFlying = useRef(false);
  const equipped = useGameStore((s) => s.inventory.equipped);
  const [action, setAction] = useState<CharacterAction>('idle');
  const actionRef = useRef<CharacterAction>('idle');
  const mouseDownRef = useRef(false);
  // Parachute mode: set when the player exits a plane above
  // PARACHUTE_DEPLOY_ALTITUDE; cleared automatically on touchdown. While
  // parachuting, vertical velocity is clamped to a slow descent and lateral
  // velocity is steered by WASD with a reduced cap. Tracked as a ref AND
  // state so useFrame can read without triggering re-renders, while the
  // canopy mesh re-renders when the value flips.
  const parachutingRef = useRef(false);
  const [parachuting, setParachuting] = useState(false);

  useEffect(() => {
    if (paused) return;
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = false;
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      mouseDownRef.current = false;
    };
  }, [paused]);

  useEffect(() => {
    const r = rigid.current;
    if (!r) return;
    if (drivenCarId) {
      // entering: stash body out of the way, it'll be re-placed on exit
      r.setBodyType(2, true); // 2 = KinematicPositionBased
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.setTranslation({ x: 0, y: -100, z: 0 }, true);
      wasDriving.current = true;
    } else if (wasDriving.current) {
      // exiting: place alongside the car. Read _drivenPos before clearing —
      // useCarDriver's exit effect intentionally leaves it set so we can
      // consume it here.
      const carPos = readDrivenCarPos();
      const yaw = readDrivenCarYaw();
      if (carPos) {
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const ox = carPos.x + side.x * 2.2;
        const oz = carPos.z + side.z * 2.2;
        r.setTranslation({ x: ox, y: 1.2, z: oz }, true);
      }
      r.setBodyType(0, true); // 0 = Dynamic
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
      wasDriving.current = false;
      clearDrivenCarPose();
    }
  }, [drivenCarId]);

  // Same body-stash / place-alongside lifecycle, but for the airplane. Plane
  // exits drop the player further out so they don't spawn inside the wing.
  // Falls back to the plane's exact xz at GROUND_Y when there's no pose
  // yet (eg. exit fired the same frame as enter).
  useEffect(() => {
    const r = rigid.current;
    if (!r) return;
    if (drivenPlaneId) {
      r.setBodyType(2, true);
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.setTranslation({ x: 0, y: -100, z: 0 }, true);
      wasFlying.current = true;
    } else if (wasFlying.current) {
      const planePos = readDrivenPlanePos();
      const yaw = readDrivenPlaneYaw();
      if (planePos) {
        // Plane fuselage is ~6m wide; exit 7m out so player clears the wing.
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const ox = planePos.x + side.x * 7;
        const oz = planePos.z + side.z * 7;
        // Mid-air bailout: if the plane is well above the runway, drop the
        // player at the plane's altitude with parachute deployed. The
        // useFrame loop takes over from here — clamps Y velocity to a slow
        // descent and lets WASD steer the canopy until touchdown.
        if (planePos.y >= PARACHUTE_DEPLOY_ALTITUDE) {
          // Spawn slightly below the plane so the canopy doesn't immediately
          // intersect the wing. Initial downward kick gives a natural drop
          // before the descent clamp engages on the first frame.
          r.setTranslation({ x: ox, y: planePos.y - 1.5, z: oz }, true);
          r.setLinvel({ x: 0, y: -PARACHUTE_DESCENT_SPEED, z: 0 }, true);
          parachutingRef.current = true;
          setParachuting(true);
        } else {
          // On or near the runway: snap to ground level (y=1.2). Standard exit.
          r.setTranslation({ x: ox, y: 1.2, z: oz }, true);
          r.setLinvel({ x: 0, y: 0, z: 0 }, true);
          parachutingRef.current = false;
          setParachuting(false);
        }
      }
      r.setBodyType(0, true);
      wasFlying.current = false;
      clearDrivenPlanePose();
    }
  }, [drivenPlaneId]);

  const setRigid = useCallback(
    (instance: RapierRigidBody | null) => {
      rigid.current = instance;
      if (typeof ref === 'function') ref(instance);
      else if (ref) ref.current = instance;
    },
    [ref],
  );

  // Hospital respawn: when health hits zero, wake up at the hospital — full
  // health, wanted cleared, $500 fee (clamped to what you've got). Also exit
  // the car so you don't respawn standing inside a moving vehicle.
  const health = useGameStore((s) => s.player.health);
  useEffect(() => {
    if (health > 0) return;
    const store = useGameStore.getState();
    const fee = Math.min(500, store.player.money);
    if (fee > 0) store.addMoney(-fee);
    store.clearWanted();
    store.setHealth(100);
    // Skip the "place alongside the car" exit effect — we want the hospital
    // spot, not the car's wreck.
    wasDriving.current = false;
    if (useVehicleStore.getState().drivenCarId) {
      useVehicleStore.getState().exitCar();
    }
    const r = rigid.current;
    if (r) {
      const [rx, ry, rz] = getHospitalRespawn();
      r.setBodyType(0, true);
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.setTranslation({ x: rx, y: ry, z: rz }, true);
    }
  }, [health]);

  useFrame(() => {
    if (!rigid.current) return;
    // Dev-console teleport. If we're in a vehicle, fire its exit first and
    // bail this frame so the vehicle's own exit-effect can place the body
    // back under our control before we override the position. The signal
    // stays pending across frames until the player is on foot.
    const tp = peekTeleport();
    if (tp) {
      if (drivenCarId || drivenPlaneId) {
        const vs = useVehicleStore.getState();
        if (drivenCarId) vs.exitCar();
        if (drivenPlaneId) vs.exitPlane();
        return;
      }
      consumeTeleport();
      const r = rigid.current;
      r.setBodyType(0, true); // ensure dynamic
      r.setLinvel({ x: 0, y: 0, z: 0 }, true);
      r.setTranslation({ x: tp[0], y: tp[1], z: tp[2] }, true);
      setPlayerTransform([tp[0], tp[1], tp[2]], 0);
      return;
    }
    if (drivenPlaneId) {
      // Keep gameStore.player.position tracking the plane so NPC targeting,
      // line-of-sight, and chunk streaming all follow the pilot.
      const planePos = readDrivenPlanePos();
      const planeYaw = readDrivenPlaneYaw();
      if (planePos) setPlayerTransform([planePos.x, planePos.y, planePos.z], planeYaw);
      return;
    }
    if (drivenCarId) {
      // Keep gameStore.player.position tracking the car so NPC targeting,
      // line-of-sight, and chunk streaming all follow the driver.
      const carPos = readDrivenCarPos();
      const carYaw = readDrivenCarYaw();
      if (carPos) setPlayerTransform([carPos.x, carPos.y, carPos.z], carYaw);
      return;
    }
    if (paused) {
      rigid.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (actionRef.current !== 'idle') {
        actionRef.current = 'idle';
        setAction('idle');
      }
      return;
    }

    const forward = keys.current['KeyW'] ? 1 : 0;
    const back = keys.current['KeyS'] ? 1 : 0;
    const left = keys.current['KeyA'] ? 1 : 0;
    const right = keys.current['KeyD'] ? 1 : 0;
    const sprint = keys.current['ShiftLeft'] || keys.current['ShiftRight'];

    const yaw = cameraState.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const strafe = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    // Parachute mode: clamp vertical velocity to a slow descent and let WASD
    // steer at PARACHUTE_LATERAL_SPEED. Exits when the player drops below
    // PARACHUTE_LAND_Y so normal walking takes over the moment feet touch.
    if (parachutingRef.current) {
      const t = rigid.current.translation();
      if (t.y <= PARACHUTE_LAND_Y) {
        parachutingRef.current = false;
        setParachuting(false);
      } else {
        const dir = new THREE.Vector3()
          .addScaledVector(fwd, forward - back)
          .addScaledVector(strafe, right - left);
        if (dir.lengthSq() > 0) dir.normalize();
        rigid.current.setLinvel(
          {
            x: dir.x * PARACHUTE_LATERAL_SPEED,
            y: -PARACHUTE_DESCENT_SPEED,
            z: dir.z * PARACHUTE_LATERAL_SPEED,
          },
          true,
        );
        if (meshRef.current) meshRef.current.rotation.y = yaw + Math.PI;
        setPlayerTransform([t.x, t.y, t.z], yaw);
        if (actionRef.current !== 'idle') {
          actionRef.current = 'idle';
          setAction('idle');
        }
        return;
      }
    }

    const dir = new THREE.Vector3()
      .addScaledVector(fwd, forward - back)
      .addScaledVector(strafe, right - left);
    if (dir.lengthSq() > 0) dir.normalize();

    const speed = sprint ? SPRINT : SPEED;
    const linvel = rigid.current.linvel();
    rigid.current.setLinvel({ x: dir.x * speed, y: linvel.y, z: dir.z * speed }, true);

    const moving = dir.lengthSq() > 0;
    const armed = !!equipped;
    const firing = armed && mouseDownRef.current && document.pointerLockElement != null;
    let nextAction: CharacterAction;
    if (firing) nextAction = 'holding-right-shoot';
    else if (armed && moving) nextAction = sprint ? 'armed-sprint' : 'armed-walk';
    else if (armed) nextAction = 'holding-right';
    else if (moving) nextAction = sprint ? 'sprint' : 'walk';
    else nextAction = 'idle';
    if (nextAction !== actionRef.current) {
      actionRef.current = nextAction;
      setAction(nextAction);
    }
    setLocalAction(nextAction);

    if (meshRef.current) {
      meshRef.current.rotation.y = yaw + Math.PI;
    }

    const t = rigid.current.translation();
    setPlayerTransform([t.x, t.y, t.z], yaw);
    setLocalYaw(yaw);

    if (lastPos.current) {
      const dx = t.x - lastPos.current.x;
      const dz = t.z - lastPos.current.z;
      const moved = Math.hypot(dx, dz);
      if (dir.lengthSq() > 0 && moved > 0.001) {
        stepAccum.current += moved;
        const strideUnits = sprint ? 2.2 : 1.6;
        if (stepAccum.current >= strideUnits) {
          stepAccum.current = 0;
          playFootstep();
        }
      } else {
        stepAccum.current = Math.min(stepAccum.current, 1.2);
      }
    }
    if (!lastPos.current) lastPos.current = { x: t.x, z: t.z };
    else {
      lastPos.current.x = t.x;
      lastPos.current.z = t.z;
    }
  });

  return (
    <RigidBody
      ref={setRigid}
      colliders={false}
      enabledRotations={PLAYER_ENABLED_ROTATIONS}
      position={spawn.current}
      mass={1}
      linearDamping={4}
      angularDamping={4}
      type="dynamic"
      userData={PLAYER_USER_DATA}
    >
      <CapsuleCollider args={[0.5, 0.4]} />
      <Parachute visible={parachuting} />
      <group ref={meshRef} visible={!inVehicle}>
        <GltfBoundary
          fallback={
            <group>
              <mesh position={[0, 0, 0]} castShadow>
                <capsuleGeometry args={[0.4, 1.0, 4, 8]} />
                <meshStandardMaterial color="#3a6df0" />
              </mesh>
              <mesh position={[0, 0.95, 0]} castShadow>
                <sphereGeometry args={[0.28, 12, 12]} />
                <meshStandardMaterial color="#e3b27a" />
              </mesh>
              <mesh position={[0, 0.95, -0.27]}>
                <boxGeometry args={[0.1, 0.1, 0.02]} />
                <meshStandardMaterial color="#222" />
              </mesh>
            </group>
          }
        >
          <CharacterModel
            variant={PLAYER_VARIANT}
            action={action}
            yBase={-0.9}
            weaponVariant={equipped ? WEAPON_MODEL[equipped] : null}
          />
        </GltfBoundary>
      </group>
    </RigidBody>
  );
});

export default Player;
