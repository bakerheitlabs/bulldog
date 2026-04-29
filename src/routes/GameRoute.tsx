import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Game from '@/game/Game';
import HUD from '@/game/hud/HUD';
import PauseMenu from '@/game/hud/PauseMenu';
import PurchaseModal from '@/game/hud/PurchaseModal';
import BibleReaderPopup from '@/game/hud/bible/BibleReaderPopup';
import ChurchLightSwitchPopup from '@/game/hud/ChurchLightSwitchPopup';
import HotelRentModal from '@/game/hud/HotelRentModal';
import SleepModal from '@/game/hud/SleepModal';
import StashModal from '@/game/hud/StashModal';
import ElevatorTransition from '@/game/hud/ElevatorTransition';
import DamageVignette from '@/game/hud/DamageVignette';
import VehicleEntered from '@/game/hud/VehicleEntered';
import WeaponWheel from '@/game/hud/WeaponWheel';
import DevConsole from '@/game/hud/DevConsole';
import Cellphone from '@/game/hud/Cellphone';
import UpdateBanner from '@/game/hud/UpdateBanner';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { useSaveStore } from '@/state/saveStore';
import {
  getElevator,
  subscribeElevator,
} from '@/game/world/buildings/elevatorState';

export default function GameRoute() {
  const [paused, setPaused] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bibleReaderOpen, setBibleReaderOpen] = useState(false);
  const [lightSwitchOpen, setLightSwitchOpen] = useState(false);
  const [hotelRentOpen, setHotelRentOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const elevatorActive = useSyncExternalStore(
    subscribeElevator,
    () => getElevator() != null,
    () => getElevator() != null,
  );

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
      if (bibleReaderOpen) {
        setBibleReaderOpen(false);
        return;
      }
      if (lightSwitchOpen) {
        setLightSwitchOpen(false);
        return;
      }
      if (hotelRentOpen) {
        setHotelRentOpen(false);
        return;
      }
      if (sleepOpen) {
        setSleepOpen(false);
        return;
      }
      if (stashOpen) {
        setStashOpen(false);
        return;
      }
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    shopOpen,
    consoleOpen,
    phoneOpen,
    bibleReaderOpen,
    lightSwitchOpen,
    hotelRentOpen,
    sleepOpen,
    stashOpen,
  ]);

  const openShop = useCallback(() => {
    setShopOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openBibleReader = useCallback(() => {
    setBibleReaderOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openLightSwitch = useCallback(() => {
    setLightSwitchOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openHotelRent = useCallback(() => {
    setHotelRentOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openSleep = useCallback(() => {
    setSleepOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const openStash = useCallback(() => {
    setStashOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const saveAtDesk = useCallback(() => {
    // Auto-save slot — same id used by future Load Game UI. Toast support
    // would be a follow-up; for now the act-of-saving is silent and
    // confirmed by the next load working.
    useSaveStore.getState().save('auto', 'Hotel desk save');
  }, []);

  useEffect(() => {
    if (consoleOpen && document.pointerLockElement) document.exitPointerLock();
  }, [consoleOpen]);

  const gamePaused =
    paused ||
    shopOpen ||
    consoleOpen ||
    lightSwitchOpen ||
    hotelRentOpen ||
    sleepOpen ||
    stashOpen ||
    elevatorActive;
  const inputPaused = gamePaused || bibleReaderOpen;
  const isModal = inputPaused;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a10' }}>
      <Game
        paused={gamePaused}
        inputPaused={inputPaused}
        mouseFree={phoneOpen || bibleReaderOpen}
        onOpenShop={openShop}
        onOpenBibleReader={openBibleReader}
        onOpenLightSwitch={openLightSwitch}
        onOpenHotelRent={openHotelRent}
        onOpenSleep={openSleep}
        onOpenStash={openStash}
        onSaveAtDesk={saveAtDesk}
      />
      <HUD />
      <UpdateBanner />
      <DamageVignette />
      <VehicleEntered />
      {!isModal && <WeaponWheel />}
      <Cellphone open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      {shopOpen && <PurchaseModal onClose={() => setShopOpen(false)} />}
      {bibleReaderOpen && (
        <BibleReaderPopup onClose={() => setBibleReaderOpen(false)} />
      )}
      {lightSwitchOpen && (
        <ChurchLightSwitchPopup onClose={() => setLightSwitchOpen(false)} />
      )}
      {hotelRentOpen && <HotelRentModal onClose={() => setHotelRentOpen(false)} />}
      {sleepOpen && <SleepModal onClose={() => setSleepOpen(false)} />}
      {stashOpen && <StashModal onClose={() => setStashOpen(false)} />}
      <ElevatorTransition />
      {paused &&
        !shopOpen &&
        !consoleOpen &&
        !bibleReaderOpen &&
        !lightSwitchOpen &&
        !hotelRentOpen &&
        !sleepOpen &&
        !stashOpen && <PauseMenu onResume={() => setPaused(false)} />}
      <DevConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  );
}
