import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  playHorn,
  startEngine,
  startSiren,
  type EngineHandle,
  type SirenHandle,
} from '@/game/audio/synth';
import { vehicleRunOver } from '@/game/npcs/npcRegistry';
import { snapCameraYawBehind } from '@/game/player/cameraState';
import { useKeyboard } from '@/game/player/useKeyboard';
import { VEHICLE_IDENTITY, type VehicleIdentityKey } from './vehicleIdentity';
import {
  CAR_COLLIDER_HALF,
  RUN_OVER_DAMAGE,
  RUN_OVER_RADIUS,
  RUN_OVER_SPEED,
  getCarSizeScale,
} from './drivingConstants';
import { advanceCarState, quatToYaw, type CarControls } from './carPhysics';
import { isCarDestroyed } from './CarSmoke';
import { useVehicleStore, writeCarPitch, writeDrivenCarPose } from './vehicleState';
import {
  makeGroundProbeResult,
  pitchAlongHeading,
  useGroundProbe,
} from './groundProbe';

// Rapier body types. 0 = Dynamic, 2 = KinematicPositionBased.
const BODY_DYNAMIC = 0;
const BODY_KINEMATIC_POSITION = 2;

type Options = {
  id: string;
  rigidRef: MutableRefObject<RapierRigidBody | null>;
  paused: boolean;
  // Drives the engine sound profile and the bottom-left brand/model banner
  // shown the moment the player takes over this car.
  variant: VehicleIdentityKey;
};

// Takes over the rigid body while `drivenCarId === id`: switches to
// KinematicPositionBased, integrates W/A/S/D into position + yaw each frame,
// and restores Dynamic on exit. Writing pose every frame keeps the minimap
// and HUD in sync.
// Quick-tap window for the police H key. Below this duration, the press is
// treated as a siren toggle; above it, as a held horn.
const HORN_TAP_MS = 250;

// Exponential-lerp time constants for ground-probe Y / pitch tracking. ~67ms
// time-to-target at K=15 — fast enough to track a 9° grade at 24 m/s without
// visible lag, slow enough to absorb deck-segment seam jitter.
const Y_LERP_K = 15;
const PITCH_LERP_K = 10;

export function useCarDriver({ id, rigidRef, paused, variant }: Options) {
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const damage = useVehicleStore((s) => s.carDamage[id] ?? 0);
  const sirenOn = useVehicleStore((s) => !!s.sirenActive[id]);
  const isDriven = drivenCarId === id;
  const keys = useKeyboard();
  const engineRef = useRef<EngineHandle | null>(null);
  const sirenRef = useRef<SirenHandle | null>(null);
  const initializedRef = useRef(false);
  const stateRef = useRef({ yaw: 0, speed: 0, x: 0, y: 0, z: 0 });
  const pitchRef = useRef(0);
  const tmpPos = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());
  const probeGround = useGroundProbe();
  const probeOut = useRef(makeGroundProbeResult());
  // Half-height of the body collider — the probe places the body center
  // `halfH` above the surface so the wheels sit flush.
  const halfH = CAR_COLLIDER_HALF[1] * getCarSizeScale(variant);

  // Engine audio + body-type lifecycle tied to the driven flag. We flip the
  // body type here (not inside useFrame) so it happens once per transition.
  useEffect(() => {
    const r = rigidRef.current;
    if (!isDriven) {
      engineRef.current?.stop();
      engineRef.current = null;
      initializedRef.current = false;
      // NB: don't clear `_drivenPos` here — Player's exit effect (which fires
      // *after* this one because Player is rendered as a sibling later in
      // SceneContent) still needs to read it to place the player alongside
      // the car. Player is responsible for clearing after it consumes.
      if (r) r.setBodyType(BODY_DYNAMIC, true);
      return;
    }
    if (r) r.setBodyType(BODY_KINEMATIC_POSITION, true);
    const identity = VEHICLE_IDENTITY[variant];
    engineRef.current = startEngine(identity.engine);
    useVehicleStore.getState().showVehicleEntered(identity.brand, identity.model);
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [isDriven, rigidRef, id, variant]);

  // H key: tap = toggle siren (police only), hold = horn. We delay the horn
  // for police until HORN_TAP_MS so a quick tap stays silent and only flips
  // the siren — otherwise every siren toggle would fire a horn first.
  useEffect(() => {
    if (!isDriven) return;
    const isPolice = variant === 'carPolice';
    let downAt: number | null = null;
    let hornTimer: number | null = null;

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.repeat) return;
      // Don't fire while the dev console / other text input has focus.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      downAt = performance.now();
      if (isPolice) {
        hornTimer = window.setTimeout(() => {
          hornTimer = null;
          playHorn();
        }, HORN_TAP_MS);
      } else {
        playHorn();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || downAt == null) return;
      const dur = performance.now() - downAt;
      downAt = null;
      if (hornTimer != null) {
        window.clearTimeout(hornTimer);
        hornTimer = null;
      }
      if (isPolice && dur < HORN_TAP_MS) {
        useVehicleStore.getState().toggleSiren(id);
      }
    };
    const onLights = (e: KeyboardEvent) => {
      if (e.code !== 'KeyL' || e.repeat) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      useVehicleStore.getState().toggleHeadlights();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('keydown', onLights);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('keydown', onLights);
      if (hornTimer != null) window.clearTimeout(hornTimer);
    };
  }, [isDriven, variant, id]);

  // Siren tone follows the per-car siren flag, but only for the player-driven
  // cruiser. AI cruisers can flash their lights without flooding the mix.
  useEffect(() => {
    if (!isDriven || !sirenOn) {
      sirenRef.current?.stop();
      sirenRef.current = null;
      return;
    }
    sirenRef.current = startSiren();
    return () => {
      sirenRef.current?.stop();
      sirenRef.current = null;
    };
  }, [isDriven, sirenOn]);

  useFrame((_, rawDt) => {
    if (!isDriven) return;
    const r = rigidRef.current;
    if (!r) return;
    if (paused) return;
    // Clamp dt so a frame hitch (e.g. chunk re-mount, GLB instancing) can't
    // translate into a giant integration step at high speed. 1/30s is the
    // ceiling: above that, we'd rather under-step the world than teleport.
    const dt = Math.min(rawDt, 1 / 30);
    // Belt-and-suspenders: @react-three/rapier re-applies the static `type`
    // prop on certain re-renders, which can silently flip the body back to
    // Dynamic mid-drive. We've memoized every unstable prop on Car's
    // RigidBody to plug that path, but if anything still slips through, this
    // re-asserts the integrator's invariant.
    if (r.bodyType() !== BODY_KINEMATIC_POSITION) {
      r.setBodyType(BODY_KINEMATIC_POSITION, true);
    }
    // Keep the body awake: @react-three/rapier's mesh sync skips
    // sleeping bodies (rapier wrapper line ~824), so an asleep Kinematic
    // car would have its physics position update via setNextKinematicTranslation
    // but its visible mesh stay frozen — exactly the "camera moves, car
    // doesn't" symptom. Kinematic bodies don't auto-wake on
    // setNextKinematicTranslation, so we wake explicitly each frame.
    if (r.isSleeping()) r.wakeUp();
    const s = stateRef.current;

    // First driven frame: adopt the car's physical state as our integrator
    // seed. Also snap the camera behind the hood so the view matches travel.
    if (!initializedRef.current) {
      s.yaw = quatToYaw(r.rotation());
      const t = r.translation();
      s.x = t.x;
      s.y = t.y;
      s.z = t.z;
      const v = r.linvel();
      s.speed = v.x * Math.sin(s.yaw) + v.z * Math.cos(s.yaw);
      // Snap to the ground beneath the takeover position so a pickup that
      // happens mid-bridge starts on the deck instead of sliding up to it.
      const initProbe = probeGround(s.x, s.z, s.y, halfH, r, probeOut.current);
      s.y = initProbe.targetY;
      pitchRef.current = pitchAlongHeading(initProbe.normal, s.yaw);
      writeCarPitch(id, pitchRef.current);
      snapCameraYawBehind(s.yaw);
      initializedRef.current = true;
    }

    if (isCarDestroyed(damage)) {
      // Destroyed: freeze in place, kill audio. Integrator pauses.
      r.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
      engineRef.current?.setThrottle(0);
      engineRef.current?.setSpeed(0);
      return;
    }

    const throttle = keys.current['KeyW'] ? 1 : 0;
    const brake = keys.current['KeyS'] ? 1 : 0;
    const steerLeft = keys.current['KeyA'] ? 1 : 0;
    const steerRight = keys.current['KeyD'] ? 1 : 0;
    const controls: CarControls = {
      throttle,
      brake,
      steer: steerRight - steerLeft,
    };

    const topSpeed = VEHICLE_IDENTITY[variant].topSpeed;
    const next = advanceCarState(
      { yaw: s.yaw, speed: s.speed },
      controls,
      dt,
      false,
      topSpeed,
    );
    s.yaw = next.yaw;
    s.speed = next.speed;
    const sp = s.speed;

    // Integrate position purely in stateRef. Reading r.translation() each
    // frame would let @react-three/rapier's sub-frame body interpolation feed
    // back into the integrator, producing tiny non-monotonic steps that show
    // up as micro-jitter at speed.
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    s.x += fx * sp * dt;
    s.z += fz * sp * dt;

    // Probe the surface beneath the new (x, z) and lerp Y / pitch toward it
    // so the car follows ramps, the bridge deck, etc. Cars are kinematic
    // bodies — Rapier won't push them onto colliders for us. Lerping (not
    // snapping) absorbs deck-segment seam jitter and gives a natural climb
    // feel rather than instant teleport-to-surface.
    const probe = probeGround(s.x, s.z, s.y, halfH, r, probeOut.current);
    const yLerp = 1 - Math.exp(-dt * Y_LERP_K);
    s.y += (probe.targetY - s.y) * yLerp;
    const targetPitch = pitchAlongHeading(probe.normal, s.yaw);
    const pLerp = 1 - Math.exp(-dt * PITCH_LERP_K);
    pitchRef.current += (targetPitch - pitchRef.current) * pLerp;
    writeCarPitch(id, pitchRef.current);

    r.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    tmpQuat.current.setFromAxisAngle(_Y_AXIS, s.yaw);
    r.setNextKinematicRotation({
      x: tmpQuat.current.x,
      y: tmpQuat.current.y,
      z: tmpQuat.current.z,
      w: tmpQuat.current.w,
    });

    tmpPos.current.set(s.x, s.y, s.z);
    writeDrivenCarPose(tmpPos.current, s.yaw);
    engineRef.current?.setThrottle(throttle);
    engineRef.current?.setSpeed(Math.abs(sp) / topSpeed);
    if (Math.abs(sp) >= RUN_OVER_SPEED) {
      vehicleRunOver(tmpPos.current, RUN_OVER_RADIUS, RUN_OVER_DAMAGE);
    }
  });
}

const _Y_AXIS = new THREE.Vector3(0, 1, 0);
