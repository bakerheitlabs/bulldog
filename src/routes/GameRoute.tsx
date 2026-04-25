import { useCallback, useEffect, useState } from 'react';
import Game from '@/game/Game';
import HUD from '@/game/hud/HUD';
import PauseMenu from '@/game/hud/PauseMenu';
import PurchaseModal from '@/game/hud/PurchaseModal';
import DamageVignette from '@/game/hud/DamageVignette';
import VehicleEntered from '@/game/hud/VehicleEntered';
import WeaponWheel from '@/game/hud/WeaponWheel';
import DevConsole from '@/game/hud/DevConsole';

export default function GameRoute() {
  const [paused, setPaused] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') {
        e.preventDefault();
        setConsoleOpen((c) => !c);
        return;
      }
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (consoleOpen) {
        setConsoleOpen(false);
        return;
      }
      if (shopOpen) {
        setShopOpen(false);
        return;
      }
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shopOpen, consoleOpen]);

  const openShop = useCallback(() => {
    setShopOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    if (consoleOpen && document.pointerLockElement) document.exitPointerLock();
  }, [consoleOpen]);

  const isModal = paused || shopOpen || consoleOpen;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a10' }}>
      <Game paused={isModal} onOpenShop={openShop} />
      <HUD />
      <DamageVignette />
      <VehicleEntered />
      {!isModal && <WeaponWheel />}
      {shopOpen && <PurchaseModal onClose={() => setShopOpen(false)} />}
      {paused && !shopOpen && !consoleOpen && <PauseMenu onResume={() => setPaused(false)} />}
      <DevConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  );
}
