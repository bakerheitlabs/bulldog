import { useEffect, useState } from 'react';
import { useVehicleStore } from '@/game/vehicles/vehicleState';
import { tokens } from '@/ui/tokens';

// GTA-style transient banner: shows brand + model in the bottom-left when
// the player enters a vehicle, then fades after ~3.5s. Driven by
// `lastEnteredBanner` in the vehicle store; we hold a local copy so the
// text survives the fade-out animation after the store value is replaced
// or cleared.
const HOLD_MS = 2800;
const FADE_MS = 600;

export default function VehicleEntered() {
  const lastEntered = useVehicleStore((s) => s.lastEnteredBanner);
  const [shown, setShown] = useState<{ brand: string; model: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastEntered) return;
    setShown({ brand: lastEntered.brand, model: lastEntered.model });
    setVisible(true);
    const fadeAt = window.setTimeout(() => setVisible(false), HOLD_MS);
    const clearAt = window.setTimeout(() => setShown(null), HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(clearAt);
    };
  }, [lastEntered]);

  if (!shown) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        pointerEvents: 'none',
        background: tokens.color.panel,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        padding: '10px 16px',
        boxShadow: tokens.shadow.panel,
        fontFamily: tokens.font.display,
        color: tokens.color.text,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity ${FADE_MS}ms ${tokens.motion.easeOut}, transform ${FADE_MS}ms ${tokens.motion.easeOut}`,
        zIndex: 6,
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: tokens.color.textMuted,
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
        }}
      >
        {shown.brand}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: tokens.color.accent,
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          lineHeight: 1.1,
        }}
      >
        {shown.model}
      </div>
    </div>
  );
}
