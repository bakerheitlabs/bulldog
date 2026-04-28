import { Canvas } from '@react-three/fiber';
import { Physics, type RapierRigidBody } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import City from './world/City';
import DayNightLighting from './world/DayNightLighting';
import WeatherEffects from './world/WeatherEffects';
import Player from './player/Player';
import ThirdPersonCamera, { type CameraTarget } from './player/ThirdPersonCamera';
import { usePointerLook } from './player/usePointerLook';
import Spawner from './npcs/Spawner';
import DebugTraffic from './npcs/DebugTraffic';
import Range from './targets/Range';
import GunStoreCounter from './interactions/GunStoreCounter';
import HospitalCounter from './interactions/HospitalCounter';
import MechanicShop from './interactions/MechanicShop';
import HitFx from './weapons/HitFx';
import { useMeleeController } from './weapons/useMeleeController';
import { useWeaponController } from './weapons/useWeaponController';
import { useInteractionKey } from './interactions/InteractionListener';
import { startCityAmbient, type AmbientHandle } from './audio/synth';
import { resumeIfSuspended } from './audio/soundEngine';
import DrivableCars from './vehicles/DrivableCars';
import SpawnedVehicles from './vehicles/SpawnedVehicles';
import { useVehicleInteraction } from './vehicles/useVehicleInteraction';
import {
  readDrivenCarPos,
  readDrivenPlanePos,
  useVehicleStore,
} from './vehicles/vehicleState';
import { useGameStore, WORLD_TIME_RATE } from '@/state/gameStore';
import { useNetStore } from '@/multiplayer/netStore';
import MultiplayerProvider from '@/multiplayer/MultiplayerProvider';

function SceneContent({ paused, onOpenShop }: { paused: boolean; onOpenShop: () => void }) {
  const inMpSession = useNetStore((s) => s.inGame);
  const isHost = useNetStore((s) => s.isHost);
  // In MP, only the host runs NPC AI / spawners; clients render NPCs from
  // host snapshots via MultiplayerProvider. In single-player both flags are
  // satisfied (inMpSession=false → first clause → enabled).
  const npcsEnabled = !inMpSession || isHost;
  const playerRef = useRef<RapierRigidBody | null>(null);
  const tmp = useRef(new THREE.Vector3());
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const camTarget: CameraTarget = {
    getPosition: () => {
      if (drivenPlaneId) {
        const p = readDrivenPlanePos();
        if (p) return p;
      }
      if (drivenCarId) {
        const p = readDrivenCarPos();
        if (p) return p;
      }
      const r = playerRef.current;
      if (!r) return null;
      const t = r.translation();
      tmp.current.set(t.x, t.y, t.z);
      return tmp.current;
    },
  };

  const combatPaused = paused || drivenCarId != null || drivenPlaneId != null;
  useWeaponController({ paused: combatPaused });
  useMeleeController({ paused: combatPaused });
  useVehicleInteraction(!paused);

  return (
    <>
      <DayNightLighting />
      <WeatherEffects />
      <City paused={paused} />
      {npcsEnabled && <Spawner paused={paused} />}
      {npcsEnabled && <DebugTraffic paused={paused} />}
      <Range />
      <GunStoreCounter onOpen={onOpenShop} />
      <HospitalCounter />
      <MechanicShop />
      <DrivableCars paused={paused} />
      <SpawnedVehicles paused={paused} />
      <Player ref={playerRef} paused={paused} />
      <MultiplayerProvider />
      <ThirdPersonCamera target={camTarget} />
      <HitFx />
    </>
  );
}

export default function Game({
  paused,
  mouseFree,
  onOpenShop,
}: {
  paused: boolean;
  mouseFree?: boolean;
  onOpenShop: () => void;
}) {
  usePointerLook(!paused && !mouseFree);
  useInteractionKey(!paused);

  const tickPlaytime = useGameStore((s) => s.tickPlaytime);
  const tickWanted = useGameStore((s) => s.tickWanted);
  const tickWorldTime = useGameStore((s) => s.tickWorldTime);
  const tickWeather = useGameStore((s) => s.tickWeather);
  const lastTickRef = useRef(performance.now());
  // In MP, only the host advances world time / weather / wanted heat.
  // Clients receive worldTime + weather via snapshot and skip these ticks
  // entirely so the world stays synchronised. Single-player keeps every
  // tick (inMpSession=false short-circuits the second clause).
  const inMpClient = useNetStore((s) => s.inGame && !s.isHost);
  useEffect(() => {
    if (paused) {
      lastTickRef.current = performance.now();
      return;
    }
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      tickPlaytime(dt);
      if (!inMpClient) {
        tickWanted(dt);
        tickWorldTime(dt);
        tickWeather((dt / 1000) * WORLD_TIME_RATE);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, tickPlaytime, tickWanted, tickWorldTime, tickWeather, inMpClient]);

  useEffect(() => {
    if ((paused || mouseFree) && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paused, mouseFree]);

  useEffect(
    () => () => {
      useVehicleStore.getState().exitCar();
    },
    [],
  );

  useEffect(() => {
    let handle: AmbientHandle | null = null;
    const start = () => {
      resumeIfSuspended();
      if (!handle) handle = startCityAmbient();
    };
    const onFirstGesture = () => {
      start();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    start();
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      handle?.stop();
    };
  }, []);

  const handleOpenShop = useCallback(() => onOpenShop(), [onOpenShop]);

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: [0, 5, 10], fov: 70, near: 0.1, far: 3500 }}
      // Roads, sidewalks, and lane stripes are stacked at Y=0/0.01/0.02 to
      // imply layering. With a 0.1→1500 frustum the standard z-buffer can't
      // resolve a 1cm gap at 100m+ camera distance, so the stripes flicker
      // when flying high. Logarithmic depth gives near-uniform precision
      // across the full range and fixes this universally for ~free.
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} paused={paused} timeStep="vary">
          <SceneContent paused={paused} onOpenShop={handleOpenShop} />
        </Physics>
      </Suspense>
    </Canvas>
  );
}
