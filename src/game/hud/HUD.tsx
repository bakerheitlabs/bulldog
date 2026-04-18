import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import { getPrompt, subscribePrompt, type InteractionPrompt } from '@/game/interactions/interactionState';
import { readDrivenCarPos, useVehicleStore } from '@/game/vehicles/vehicleState';

export default function HUD() {
  const player = useGameStore((s) => s.player);
  const inv = useGameStore((s) => s.inventory);
  const [prompt, setPromptState] = useState<InteractionPrompt | null>(getPrompt());
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const [speedKph, setSpeedKph] = useState(0);
  const lastCarPos = useRef<{ x: number; z: number; t: number } | null>(null);

  useEffect(() => subscribePrompt(() => setPromptState(getPrompt())), []);

  useEffect(() => {
    if (!drivenCarId) {
      lastCarPos.current = null;
      setSpeedKph(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const p = readDrivenCarPos();
      const now = performance.now();
      if (p) {
        if (lastCarPos.current) {
          const dx = p.x - lastCarPos.current.x;
          const dz = p.z - lastCarPos.current.z;
          const dt = Math.max(1, now - lastCarPos.current.t) / 1000;
          const mps = Math.hypot(dx, dz) / dt;
          setSpeedKph((prev) => prev * 0.7 + mps * 3.6 * 0.3);
        }
        lastCarPos.current = { x: p.x, z: p.z, t: now };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drivenCarId]);

  const equipped = inv.equipped;
  const ammo = equipped ? inv.ammo[equipped] : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: 'system-ui, sans-serif',
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      }}
    >
      {/* crosshair */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          border: '2px solid rgba(255,255,255,0.8)',
          borderRadius: '50%',
        }}
      />

      {/* bottom-left: health + money */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            width: 220,
            height: 18,
            border: '1px solid rgba(255,255,255,0.4)',
            background: 'rgba(0,0,0,0.4)',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${player.health}%`,
              height: '100%',
              background: player.health > 50 ? '#3fa362' : player.health > 20 ? '#c9a23a' : '#b04a3f',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            HP {player.health}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#f5cb5c' }}>${player.money.toLocaleString()}</div>
      </div>

      {/* bottom-right: equipped weapon + ammo, or speedometer while driving */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          textAlign: 'right',
          fontFamily: 'monospace',
        }}
      >
        {drivenCarId ? (
          <>
            <div style={{ fontSize: 14, opacity: 0.8 }}>Driving</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {Math.round(speedKph)} <span style={{ opacity: 0.5, fontSize: 16 }}>km/h</span>
            </div>
          </>
        ) : equipped && ammo ? (
          <>
            <div style={{ fontSize: 14, opacity: 0.8 }}>{WEAPONS[equipped].name}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {ammo.magazine} <span style={{ opacity: 0.5, fontSize: 18 }}>/ {ammo.reserve}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, opacity: 0.7 }}>Unarmed</div>
        )}
      </div>

      {/* controls hint (top-left, faint) */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          fontSize: 11,
          opacity: 0.55,
          lineHeight: 1.4,
          fontFamily: 'monospace',
        }}
      >
        {drivenCarId
          ? 'W/S throttle · A/D steer · E exit · Esc pause'
          : 'WASD move · Shift sprint · Mouse look · LMB shoot · F punch · R reload · 1/2 weapon · E interact · Esc pause'}
      </div>

      {/* center prompt */}
      {prompt && (
        <div
          style={{
            position: 'absolute',
            top: '60%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          {prompt.label}
        </div>
      )}
    </div>
  );
}
