import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  startAirplaneEngine,
  startCockpitWarning,
  type CockpitWarningHandle,
  type EngineHandle,
} from '@/game/audio/synth';
import { snapCameraYawBehind } from '@/game/player/cameraState';
import { useKeyboard } from '@/game/player/useKeyboard';
import { useVehicleStore, writeDrivenPlanePose } from '@/game/vehicles/vehicleState';
import { MAX_SPEED } from './airplaneConstants';
import { advancePlane, makeInitialPlaneState, type PlaneControls } from './planePhysics';

// Rapier body types. 0 = Dynamic, 2 = KinematicPositionBased.
const BODY_DYNAMIC = 0;
const BODY_KINEMATIC_POSITION = 2;

// Pitch magnitude (radians) at which the cockpit warning alarm starts and
// stops. Two thresholds give a hysteresis band so a pitch that hovers right
// at the limit doesn't chatter the audio on/off. 15° on, 12° off.
const WARN_PITCH_ON = (15 * Math.PI) / 180;
const WARN_PITCH_OFF = (12 * Math.PI) / 180;

// Debounce: when pitch first crosses ON, wait this long and re-check before
// firing the alarm. Filters out transient maneuvers (a quick pull-up or
// roll-induced pitch wobble) so the alarm only fires when the player is
// genuinely holding an unusual attitude.
const WARN_DEBOUNCE_MS = 1500;

type Options = {
  id: string;
  rigidRef: MutableRefObject<RapierRigidBody | null>;
  paused: boolean;
  initialYaw: number;
};

// Mirror of useCarDriver: when this plane is the one being flown, swap to
// kinematic, integrate W/S/A/D + arrow inputs into pos + Euler each frame,
// and write pose to the module-level mirror so the camera + HUD can read
// without a React subscription. Restores Dynamic on exit.
export function useAirplaneController({ id, rigidRef, paused, initialYaw }: Options) {
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const isFlying = drivenPlaneId === id;
  const keys = useKeyboard();
  const stateRef = useRef(makeInitialPlaneState(0, 0, 0, initialYaw));
  const initializedRef = useRef(false);
  const engineRef = useRef<EngineHandle | null>(null);
  const warningRef = useRef<CockpitWarningHandle | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const tmpPos = useRef(new THREE.Vector3());
  const tmpQuat = useRef(new THREE.Quaternion());
  const tmpEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Body type + engine audio lifecycle on enter/exit. Spinning the engine up
  // here (not in useFrame) keeps it tied to one transition per enter.
  useEffect(() => {
    const r = rigidRef.current;
    if (!isFlying) {
      initializedRef.current = false;
      engineRef.current?.stop();
      engineRef.current = null;
      warningRef.current?.stop();
      warningRef.current = null;
      if (warnTimerRef.current != null) {
        window.clearTimeout(warnTimerRef.current);
        warnTimerRef.current = null;
      }
      if (r) r.setBodyType(BODY_DYNAMIC, true);
      return;
    }
    if (r) r.setBodyType(BODY_KINEMATIC_POSITION, true);
    engineRef.current = startAirplaneEngine();
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
      warningRef.current?.stop();
      warningRef.current = null;
      if (warnTimerRef.current != null) {
        window.clearTimeout(warnTimerRef.current);
        warnTimerRef.current = null;
      }
    };
  }, [isFlying, rigidRef]);

  useFrame((_, dt) => {
    if (!isFlying) return;
    const r = rigidRef.current;
    if (!r) return;
    if (paused) return;
    if (r.bodyType() !== BODY_KINEMATIC_POSITION) {
      r.setBodyType(BODY_KINEMATIC_POSITION, true);
    }
    if (r.isSleeping()) r.wakeUp();

    const s = stateRef.current;
    if (!initializedRef.current) {
      const t = r.translation();
      s.x = t.x;
      s.y = t.y;
      s.z = t.z;
      s.yaw = initialYaw;
      s.pitch = 0;
      s.roll = 0;
      s.throttle = 0;
      s.speed = 0;
      s.airborne = false;
      snapCameraYawBehind(s.yaw);
      initializedRef.current = true;
    }

    const k = keys.current;
    const controls: PlaneControls = {
      throttleUp: k['KeyW'] ? 1 : 0,
      throttleDown: k['KeyS'] ? 1 : 0,
      rollLeft: k['KeyA'] ? 1 : 0,
      rollRight: k['KeyD'] ? 1 : 0,
      pitchDown: k['ArrowUp'] ? 1 : 0, // nose down
      pitchUp: k['ArrowDown'] ? 1 : 0, // nose up — pull stick back
      yawLeft: k['ArrowLeft'] ? 1 : 0,
      yawRight: k['ArrowRight'] ? 1 : 0,
      brake: k['Space'] ? 1 : 0,
    };

    advancePlane(s, controls, dt);

    // Push to rapier kinematic body. Note the negated pitch: in three.js'
    // right-handed Euler convention, a positive X rotation tilts a +Z-forward
    // vector toward -Y (nose down). Our physics convention is the opposite —
    // positive state.pitch means "climb" (sin(pitch) > 0 contributes +Y to
    // the velocity). Negating here keeps the visual orientation consistent
    // with the velocity vector so the nose tilts up while the plane is
    // climbing, not down.
    r.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    tmpEuler.current.set(-s.pitch, s.yaw, s.roll, 'YXZ');
    tmpQuat.current.setFromEuler(tmpEuler.current);
    r.setNextKinematicRotation({
      x: tmpQuat.current.x,
      y: tmpQuat.current.y,
      z: tmpQuat.current.z,
      w: tmpQuat.current.w,
    });

    // Mirror pose for camera + HUD.
    tmpPos.current.set(s.x, s.y, s.z);
    writeDrivenPlanePose(tmpPos.current, s.yaw, s.pitch, s.roll);

    // Drive engine audio from the integrated throttle (not raw key input) so
    // the spool-up matches the visible behavior — and from normalized speed
    // so cruise pitches up naturally.
    engineRef.current?.setThrottle(s.throttle);
    engineRef.current?.setSpeed(Math.max(0, s.speed) / MAX_SPEED);

    // Cockpit warning alarm when in unusual attitude (pitched too far either
    // way). Airborne-only — on the runway, pitching up is the normal takeoff
    // input and shouldn't trigger the alarm. Hysteresis prevents chatter
    // when pitch hovers right around the limit. A 2 s debounce on the start
    // side filters out transient maneuvers — the alarm only fires if the
    // unusual attitude is sustained.
    const absPitch = Math.abs(s.pitch);

    // Stop side: once running, the alarm cuts as soon as we drop below OFF
    // or leave the air. No debounce here — the player should hear it stop
    // immediately when they recover.
    if (warningRef.current != null && (!s.airborne || absPitch <= WARN_PITCH_OFF)) {
      warningRef.current.stop();
      warningRef.current = null;
    }

    // Start side: schedule a delayed start when ON is first crossed. Only
    // one timer at a time, and only if the alarm isn't already running.
    if (
      s.airborne &&
      absPitch >= WARN_PITCH_ON &&
      warningRef.current == null &&
      warnTimerRef.current == null
    ) {
      warnTimerRef.current = window.setTimeout(() => {
        warnTimerRef.current = null;
        // Re-check at fire time. If the player has recovered (or left the
        // cockpit / landed) in the 2 s window, don't fire.
        const now = stateRef.current;
        if (
          now.airborne &&
          Math.abs(now.pitch) >= WARN_PITCH_ON &&
          warningRef.current == null
        ) {
          warningRef.current = startCockpitWarning();
        }
      }, WARN_DEBOUNCE_MS);
    }

    // Continuously snap the chase camera behind the plane's yaw so the view
    // tracks heading. The player can still mouse-look; we override every
    // frame to keep the chase tight. (For v1; if mouse-look feels good
    // we can soften this into an ease.)
    snapCameraYawBehind(s.yaw);
  });
}
