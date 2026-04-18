import { useCallback, useEffect, useState } from 'react';
import Game from '@/game/Game';
import HUD from '@/game/hud/HUD';
import PauseMenu from '@/game/hud/PauseMenu';
import PurchaseModal from '@/game/hud/PurchaseModal';

export default function GameRoute() {
  const [paused, setPaused] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  // Esc toggles pause (but not while shop is open — Esc closes shop instead)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (shopOpen) {
        setShopOpen(false);
        return;
      }
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shopOpen]);

  const openShop = useCallback(() => {
    setShopOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const isModal = paused || shopOpen;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0a10' }}>
      <Game paused={isModal} onOpenShop={openShop} />
      <HUD />
      {shopOpen && <PurchaseModal onClose={() => setShopOpen(false)} />}
      {paused && !shopOpen && <PauseMenu onResume={() => setPaused(false)} />}
    </div>
  );
}
