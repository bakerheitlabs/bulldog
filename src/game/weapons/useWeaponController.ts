import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/state/gameStore';
import { raycastTargets } from '@/game/targets/targetRegistry';
import { raycastNpcs } from '@/game/npcs/npcRegistry';
import { WEAPONS, WEAPON_HOTKEYS } from './weapons';
import { spawnTracer } from './HitFx';
import { playGunshot, playReload } from '@/game/audio/synth';
import { useNetStore } from '@/multiplayer/netStore';
import type { WeaponId } from '@/save/schema';

export function useWeaponController({ paused }: { paused: boolean }) {
  const camera = useThree((s) => s.camera);
  const mouseDownRef = useRef(false);
  const cooldownRef = useRef(0);
  const reloadingUntilRef = useRef(0);

  // mouse + key handlers
  useEffect(() => {
    if (paused) return;
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDownRef.current = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const setEquipped = useGameStore.getState().setEquipped;
      const inv = useGameStore.getState().inventory;
      const id = WEAPON_HOTKEYS[e.key];
      if (id && inv.weapons.includes(id)) {
        setEquipped(id);
      }
      if (e.code === 'KeyR') {
        const eq = useGameStore.getState().inventory.equipped;
        if (eq) tryReload(eq);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [paused]);

  function tryReload(id: WeaponId) {
    const def = WEAPONS[id];
    const now = performance.now();
    if (now < reloadingUntilRef.current) return;
    reloadingUntilRef.current = now + def.reloadMs;
    playReload();
    window.setTimeout(() => {
      if (useGameStore.getState().inventory.equipped === id) {
        useGameStore.getState().reloadWeapon(id);
      }
    }, def.reloadMs);
  }

  useFrame((_, dt) => {
    if (paused) return;
    cooldownRef.current = Math.max(0, cooldownRef.current - dt);
    if (!mouseDownRef.current) return;
    if (document.pointerLockElement == null) return;

    const equipped = useGameStore.getState().inventory.equipped;
    if (!equipped) return;
    const def = WEAPONS[equipped];
    if (cooldownRef.current > 0) return;
    if (performance.now() < reloadingUntilRef.current) return;

    const ammo = useGameStore.getState().inventory.ammo[equipped];
    if (!ammo || ammo.magazine <= 0) {
      // auto-reload if reserve > 0
      if (ammo && ammo.reserve > 0) tryReload(equipped);
      return;
    }

    // fire
    cooldownRef.current = 1 / def.fireRate;
    useGameStore.getState().consumeAmmo(equipped, 1);
    useGameStore.getState().bumpHeat(1.5);
    playGunshot(equipped);

    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const baseDir = new THREE.Vector3();
    camera.getWorldDirection(baseDir);

    const inMp = useNetStore.getState().inGame;
    const fireWeapon = useNetStore.getState().fireWeapon;

    for (let i = 0; i < def.projectileCount; i++) {
      const dir = baseDir.clone();
      const spreadRad = (def.spreadDeg * Math.PI) / 180;
      const yaw = (Math.random() - 0.5) * spreadRad;
      const pitch = (Math.random() - 0.5) * spreadRad;
      // build small rotation
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.tan(yaw)).addScaledVector(up, Math.tan(pitch)).normalize();

      // Targets stay client-local in MP (the gun range is a single-player
      // feature). Always raycast + apply target damage locally.
      const targetHit = raycastTargets(origin, dir, def.range);

      if (inMp) {
        // Multiplayer: NPC damage is host-authoritative — funnel through the
        // net store. Host gets back the resolved tracer endpoint via the
        // event:fire echo (skipped for self) and clients via the same event.
        // We still spawn a local tracer so the shooter sees it instantly.
        let localEnd: THREE.Vector3;
        if (targetHit) {
          localEnd = targetHit.entry.position
            .clone()
            .add(new THREE.Vector3(0, targetHit.entry.height / 2, 0));
          targetHit.entry.takeHit(def.damage);
        } else {
          // Predict the endpoint by raycasting NPCs locally for visual feel.
          // Host's authoritative result may differ slightly but the tracer
          // is fire-and-forget — no correction needed.
          const npcHit = raycastNpcs(origin, dir, def.range);
          if (npcHit) {
            const p = npcHit.entry.getPosition();
            localEnd = p.clone().add(new THREE.Vector3(0, npcHit.entry.height / 2, 0));
          } else {
            localEnd = origin.clone().addScaledVector(dir, def.range);
          }
        }
        spawnTracer(origin.clone().addScaledVector(dir, 0.5), localEnd);
        fireWeapon(equipped, [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z]);
      } else {
        const npcHit = raycastNpcs(origin, dir, def.range);
        const useNpc =
          npcHit && (!targetHit || npcHit.dist < targetHit.dist);
        let endPoint: THREE.Vector3;
        if (useNpc && npcHit) {
          const p = npcHit.entry.getPosition();
          endPoint = p.clone().add(new THREE.Vector3(0, npcHit.entry.height / 2, 0));
          npcHit.entry.takeHit(def.damage, dir.clone());
        } else if (targetHit) {
          endPoint = targetHit.entry.position
            .clone()
            .add(new THREE.Vector3(0, targetHit.entry.height / 2, 0));
          targetHit.entry.takeHit(def.damage);
        } else {
          endPoint = origin.clone().addScaledVector(dir, def.range);
        }
        spawnTracer(origin.clone().addScaledVector(dir, 0.5), endPoint);
      }
    }
  });

  return { tryReload };
}
