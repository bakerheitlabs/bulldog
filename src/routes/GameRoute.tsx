import { useCallback, useEffect, useState } from 'react';
import Game from '@/game/Game';
import HUD from '@/game/hud/HUD';
import PauseMenu from '@/game/hud/PauseMenu';
import PurchaseModal from '@/game/hud/PurchaseModal';
import BibleVersePopup from '@/game/hud/BibleVersePopup';
import ChurchLightSwitchPopup from '@/game/hud/ChurchLightSwitchPopup';
import DamageVignette from '@/game/hud/DamageVignette';
import VehicleEntered from '@/game/hud/VehicleEntered';
import WeaponWheel from '@/game/hud/WeaponWheel';
import DevConsole from '@/game/hud/DevConsole';
import Cellphone from '@/game/hud/Cellphone';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import type { Verse } from '@/game/world/bibleVerses';

export default function GameRoute() {
  const [paused, setPaused] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [lightSwitchOpen, setLightSwitchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tab isn't bound to anything in-game, but the default focus-cycling
      // behavior shifts the viewport when the R3F canvas wrapper takes focus.
      if (e.code === 'Tab') {
        e.preventDefault();
        return;
      }
      if (e.code === 'Backquote') {
        e.preventDefault();
        setConsoleOpen((c) => !c);
        return;
      }
      if (e.code === 'ArrowUp' && !consoleOpen) {
        const v = useVehicleStore.getState();
        const inVehicle = v.drivenCarId != null || v.drivenPlaneId != null;
        // Allow closing if already open (e.g. opened on foot, then jumped in),
        // but don't open while driving/flying — ArrowUp is a flight control.
        if (inVehicle && !phoneOpen) return;
        setPhoneOpen((p) => !p);
        return;
      }
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (consoleOpen) {
        setConsoleOpen(false);
        return;
      }
      if (phoneOpen) {
        setPhoneOpen(false);
        return;
      }
      if (shopOpen) {
        setShopOpen(false);
        return;
      }
      if (verse) {
        setVerse(null);
        return;
      }
      if (lightSwitchOpen) {
        setLightSwitchOpen(false);
        return;
      }
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shopOpen, consoleOpen, phoneOpen, verse, lightSwitchOpen]);

  const openShop = useCallback(() => {
    setShopOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openVerse = useCallback((v: Verse) => {
    setVerse(v);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openLightSwitch = useCallback(() => {
    setLightSwitchOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    if (consoleOpen && document.pointerLockElement) document.exitPointerLock();
  }, [consoleOpen]);

  const isModal =
    paused || shopOpen || consoleOpen || verse !== null || lightSwitchOpen;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a10' }}>
      <Game
        paused={isModal}
        mouseFree={phoneOpen}
        onOpenShop={openShop}
        onOpenVerse={openVerse}
        onOpenLightSwitch={openLightSwitch}
      />
      <HUD />
      <DamageVignette />
      <VehicleEntered />
      {!isModal && <WeaponWheel />}
      <Cellphone open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      {shopOpen && <PurchaseModal onClose={() => setShopOpen(false)} />}
      {verse && <BibleVersePopup verse={verse} onClose={() => setVerse(null)} />}
      {lightSwitchOpen && (
        <ChurchLightSwitchPopup onClose={() => setLightSwitchOpen(false)} />
      )}
      {paused && !shopOpen && !consoleOpen && !verse && !lightSwitchOpen && (
        <PauseMenu onResume={() => setPaused(false)} />
      )}
      <DevConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  );
}
