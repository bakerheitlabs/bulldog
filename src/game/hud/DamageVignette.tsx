import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/state/gameStore';
import { tokens } from '@/ui/tokens';

// Red radial vignette that pulses on health drops and holds a low-intensity
// pulse when HP is critical. Intensity scales with how low HP is so a hit at
// 10% reads much stronger than a hit at 80%.
const FADE_MS = 450;
const CRITICAL_HP = 20;

export default function DamageVignette() {
  const health = useGameStore((s) => s.player.health);
  const [flash, setFlash] = useState(0); // transient hit flash, 0..1
  const prevHpRef = useRef(health);

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = health;
    if (health < prev) {
      const intensity = Math.min(0.9, 1 - health / 100 + 0.25);
      setFlash(intensity);
      const id = window.setTimeout(() => setFlash(0), FADE_MS);
      return () => window.clearTimeout(id);
    }
  }, [health]);

  const critical = health > 0 && health <= CRITICAL_HP;

  return (
    <>
      <style>{`
        @keyframes bulldog-dmg-pulse {
          0%, 100% { opacity: 0.12; }
          50%      { opacity: 0.32; }
        }
      `}</style>
      {/* transient flash layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, ${tokens.color.danger}cc 100%)`,
          opacity: flash,
          transition: `opacity ${FADE_MS}ms ${tokens.motion.easeOut}`,
          zIndex: 5,
        }}
      />
      {/* persistent low-HP pulse */}
      {critical && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, ${tokens.color.danger}99 100%)`,
            animation: 'bulldog-dmg-pulse 1.2s ease-in-out infinite',
            zIndex: 4,
          }}
        />
      )}
    </>
  );
}
