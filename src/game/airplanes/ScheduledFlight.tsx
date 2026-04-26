import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { startAirplaneEngine, type EngineHandle } from '@/game/audio/synth';
import { setAudioListenerPosition } from '@/game/audio/soundEngine';
import AirplaneModel from './AirplaneModel';
import {
  computeFlightPose,
  nextScheduledStart,
  type FlightPhase,
  type FlightPose,
} from './flightPath';

// Throttle level the AI plane "holds" during each phase. Drives engine audio
// (loudness + spool pitch) — not flight dynamics, which run from the
// hand-authored waypoint path. Tuned to read like an airliner: full thrust
// on climb, throttled back over the city, near-idle on landing roll.
function throttleForPhase(phase: FlightPhase): number {
  switch (phase) {
    case 'takeoffRoll':
      return 0.7;
    case 'climb':
      return 1.0;
    case 'cruiseOut':
    case 'cruiseFar':
      return 0.65;
    case 'cityOverflight':
      return 0.45;
    case 'finalApproach':
      return 0.3;
    case 'descent':
      return 0.22;
    case 'landingRoll':
      return 0.05;
  }
}

// Visibility window with hysteresis. The horizontal distance from the player
// is a coarse stand-in for "is the plane on screen" — fine for an airliner
// silhouette, since the camera never floats far from the player. Two
// thresholds prevent mount/unmount thrashing on the boundary.
const VIS_NEAR_SQ = 600 * 600; // start rendering when within 600 m
const VIS_FAR_SQ = 800 * 800;  // unmount past 800 m

type Props = { paused: boolean };

// One scheduled airliner. Spawns at takeoff time (every half-hour of sim
// time), flies the parametric path defined in flightPath.ts, and is
// despawned when it lands. The flight progress is tracked in refs even when
// the visual is unmounted, so the plane "keeps flying" off-screen and shows
// up again when it returns to the airport vicinity.
export default function ScheduledFlight({ paused }: Props) {
  const groupRef = useRef<THREE.Group | null>(null);
  const tmpEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  const flightStartRef = useRef<number | null>(null);
  const nextScheduledRef = useRef<number | null>(null);
  const lastPoseRef = useRef<FlightPose | null>(null);
  const visibleRef = useRef(false);
  const [visible, setVisible] = useState(false);

  // Spatial engine audio. Started when a flight begins and stopped when it
  // ends; the panner inside startAirplaneEngine handles fade + pan as the
  // plane crosses the sky. Engine runs even when the visual is unmounted —
  // the player should hear the distant rumble before the plane comes into
  // view, and after it disappears past the visibility horizon.
  const engineRef = useRef<EngineHandle | null>(null);

  // Make sure the engine is torn down if the component unmounts mid-flight.
  useEffect(() => () => {
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  // After a visibility flip remounts the group, snap the transform to the
  // most recent pose immediately — otherwise the first frame would render
  // at the origin before useFrame's next tick fixes it.
  useLayoutEffect(() => {
    if (!visible) return;
    const g = groupRef.current;
    const p = lastPoseRef.current;
    if (!g || !p) return;
    g.position.set(p.x, p.y, p.z);
    tmpEuler.current.set(-p.pitch, p.yaw, p.roll, 'YXZ');
    g.quaternion.setFromEuler(tmpEuler.current);
  }, [visible]);

  useFrame(() => {
    if (paused) return;
    const simNow = useGameStore.getState().time.seconds;

    // Initialize the schedule the first time we tick.
    if (nextScheduledRef.current == null) {
      nextScheduledRef.current = nextScheduledStart(simNow);
    }

    // Begin a flight when its scheduled time arrives. We only run one flight
    // at a time — if the previous one is still in progress, this branch is
    // skipped and the schedule slot is silently dropped.
    if (flightStartRef.current == null && simNow >= nextScheduledRef.current) {
      flightStartRef.current = simNow;
      // Spin up the engine right when the flight starts so the player can
      // hear the takeoff roar from a distance, even if the plane itself is
      // currently outside the visibility radius.
      if (engineRef.current == null) {
        engineRef.current = startAirplaneEngine({ spatial: true });
      }
    }

    if (flightStartRef.current == null) return;

    const elapsed = simNow - flightStartRef.current;
    const pose = computeFlightPose(elapsed);
    if (pose == null) {
      // Flight finished — clear state, kill the engine audio, and queue the
      // next schedule.
      flightStartRef.current = null;
      nextScheduledRef.current = nextScheduledStart(simNow);
      lastPoseRef.current = null;
      engineRef.current?.stop();
      engineRef.current = null;
      if (visibleRef.current) {
        visibleRef.current = false;
        setVisible(false);
      }
      return;
    }

    lastPoseRef.current = pose;

    // Drive engine audio. Position must update every frame regardless of
    // visual mount state — the panner is what creates the "from overhead"
    // illusion. Throttle and speed are derived from the current phase so
    // the engine spools up on climb and idles on landing roll. The audio
    // listener tracks the player so the spatial pan stays correct as the
    // player walks/drives around the city.
    const engine = engineRef.current;
    if (engine) {
      engine.setPosition?.(pose.x, pose.y, pose.z);
      const throttle = throttleForPhase(pose.phase);
      engine.setThrottle(throttle);
      engine.setSpeed(throttle);
      const pp = useGameStore.getState().player.position;
      setAudioListenerPosition(pp[0], pp[1], pp[2]);
    }

    // Update the group transform if it's currently mounted. When unmounted,
    // pose still advances each frame so the flight progresses off-screen and
    // the plane reappears in the right place when it re-enters view.
    const g = groupRef.current;
    if (g) {
      g.position.set(pose.x, pose.y, pose.z);
      tmpEuler.current.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ');
      g.quaternion.setFromEuler(tmpEuler.current);
    }

    // Distance-based visibility with hysteresis. Once visible, stay visible
    // until the plane crosses the FAR threshold; once hidden, stay hidden
    // until it crosses the NEAR threshold. Avoids mount/unmount chatter.
    const playerPos = useGameStore.getState().player.position;
    const dx = pose.x - playerPos[0];
    const dz = pose.z - playerPos[2];
    const distSq = dx * dx + dz * dz;
    const shouldShow = visibleRef.current ? distSq <= VIS_FAR_SQ : distSq <= VIS_NEAR_SQ;
    if (shouldShow !== visibleRef.current) {
      visibleRef.current = shouldShow;
      setVisible(shouldShow);
    }
  });

  if (!visible) return null;
  return (
    <group ref={groupRef}>
      <AirplaneModel />
    </group>
  );
}
