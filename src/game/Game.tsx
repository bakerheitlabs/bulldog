import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { Physics, type RapierRigidBody } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import City from './world/City';
import Player from './player/Player';
import ThirdPersonCamera, { type CameraTarget } from './player/ThirdPersonCamera';
import { usePointerLook } from './player/usePointerLook';
import Spawner from './npcs/Spawner';
import Range from './targets/Range';
import GunStoreCounter from './interactions/GunStoreCounter';
import HitFx from './weapons/HitFx';
import { useMeleeController } from './weapons/useMeleeController';
import { useWeaponController } from './weapons/useWeaponController';
import { useInteractionKey } from './interactions/InteractionListener';
import { startCityAmbient, type AmbientHandle } from './audio/synth';
import { resumeIfSuspended } from './audio/soundEngine';
import DrivableCars from './vehicles/DrivableCars';
import { useVehicleInteraction } from './vehicles/useVehicleInteraction';
import { readDrivenCarPos, useVehicleStore } from './vehicles/vehicleState';
import { useGameStore } from '@/state/gameStore';

function SceneContent({ paused, onOpenShop }: { paused: boolean; onOpenShop: () => void }) {
  const playerRef = useRef<RapierRigidBody | null>(null);
  const tmp = useRef(new THREE.Vector3());
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const camTarget: CameraTarget = {
    getPosition: () => {
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

  const combatPaused = paused || drivenCarId != null;
  useWeaponController({ paused: combatPaused });
  useMeleeController({ paused: combatPaused });
  useVehicleInteraction(!paused);

  return (
    <>
      <Sky sunPosition={[80, 40, 30]} turbidity={4} rayleigh={1.2} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[60, 80, 30]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
      <City />
      <Spawner />
      <Range />
      <GunStoreCounter onOpen={onOpenShop} />
      <DrivableCars paused={paused} />
      <Player ref={playerRef} paused={paused} />
      <ThirdPersonCamera target={camTarget} />
      <HitFx />
    </>
  );
}

export default function Game({
  paused,
  onOpenShop,
}: {
  paused: boolean;
  onOpenShop: () => void;
}) {
  usePointerLook(!paused);
  useInteractionKey(!paused);

  const tickPlaytime = useGameStore((s) => s.tickPlaytime);
  const tickWanted = useGameStore((s) => s.tickWanted);
  const lastTickRef = useRef(performance.now());
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
      tickWanted(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, tickPlaytime, tickWanted]);

  useEffect(() => {
    if (paused && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paused]);

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
      shadows
      camera={{ position: [0, 5, 10], fov: 70, near: 0.1, far: 500 }}
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
