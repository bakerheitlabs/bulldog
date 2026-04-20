import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import { tokens } from '@/ui/tokens';
import type { WeaponId } from '@/save/schema';

type Slot =
  | { kind: 'unarmed'; id: null; label: string; magazine: null; reserve: null }
  | { kind: 'weapon'; id: WeaponId; label: string; magazine: number; reserve: number };

const RADIUS_OUTER = 170;
const RADIUS_INNER = 70;
const DEAD_ZONE = 36; // cursor radius inside which no segment is selected

function describeWedge(startRad: number, endRad: number): string {
  const x1 = Math.cos(startRad) * RADIUS_OUTER;
  const y1 = Math.sin(startRad) * RADIUS_OUTER;
  const x2 = Math.cos(endRad) * RADIUS_OUTER;
  const y2 = Math.sin(endRad) * RADIUS_OUTER;
  const x3 = Math.cos(endRad) * RADIUS_INNER;
  const y3 = Math.sin(endRad) * RADIUS_INNER;
  const x4 = Math.cos(startRad) * RADIUS_INNER;
  const y4 = Math.sin(startRad) * RADIUS_INNER;
  const large = endRad - startRad > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${RADIUS_OUTER} ${RADIUS_OUTER} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${RADIUS_INNER} ${RADIUS_INNER} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export default function WeaponWheel() {
  const inv = useGameStore((s) => s.inventory);
  const setEquipped = useGameStore((s) => s.setEquipped);
  const [open, setOpen] = useState(false);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const pointerLockStoreRef = useRef<boolean>(false);

  const slots: Slot[] = useMemo(() => {
    const out: Slot[] = [
      { kind: 'unarmed', id: null, label: 'Unarmed', magazine: null, reserve: null },
    ];
    for (const id of inv.weapons) {
      const ammo = inv.ammo[id];
      out.push({
        kind: 'weapon',
        id,
        label: WEAPONS[id].name,
        magazine: ammo?.magazine ?? 0,
        reserve: ammo?.reserve ?? 0,
      });
    }
    return out;
  }, [inv.weapons, inv.ammo]);

  // Q key open/close. Keydown opens (once, non-repeating); keyup commits and closes.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ' || e.repeat) return;
      if (open) return;
      // Remember whether we were in pointer lock so we can restore after.
      pointerLockStoreRef.current = document.pointerLockElement != null;
      if (document.pointerLockElement) document.exitPointerLock();
      // Center cursor reference at viewport center; absolute mousemove will
      // update it once the user moves.
      cursorRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      setSelected(null);
      selectedRef.current = null;
      setOpen(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ') return;
      if (!open) return;
      const pick = selectedRef.current;
      if (pick != null && pick >= 0 && pick < slots.length) {
        const slot = slots[pick];
        if (slot.kind === 'unarmed') setEquipped(null);
        else if (inv.weapons.includes(slot.id)) setEquipped(slot.id);
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [open, slots, inv.weapons, setEquipped]);

  // Absolute cursor tracking + segment selection while open.
  useEffect(() => {
    if (!open) return;
    const n = slots.length;
    // Arrange segments starting from the top (−90°) going clockwise.
    const wedge = (2 * Math.PI) / n;
    const offset = -Math.PI / 2 - wedge / 2; // so segment 0 straddles 12 o'clock
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < DEAD_ZONE) {
        if (selectedRef.current != null) {
          selectedRef.current = null;
          setSelected(null);
        }
        return;
      }
      // Angle measured from +x axis (east) clockwise. Shift so segment 0 is up.
      let theta = Math.atan2(dy, dx) - offset;
      // Normalize to [0, 2π)
      theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const idx = Math.floor(theta / wedge) % n;
      if (selectedRef.current !== idx) {
        selectedRef.current = idx;
        setSelected(idx);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open, slots.length]);

  if (!open) return null;

  const n = slots.length;
  const wedge = (2 * Math.PI) / n;
  const offset = -Math.PI / 2 - wedge / 2;
  const selectedSlot = selected != null ? slots[selected] : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'auto',
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55), rgba(0,0,0,0.85))',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 25,
        animation: 'bulldog-wheel-in 120ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <style>{`
        @keyframes bulldog-wheel-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <svg
        viewBox={`${-RADIUS_OUTER - 20} ${-RADIUS_OUTER - 20} ${2 * (RADIUS_OUTER + 20)} ${2 * (RADIUS_OUTER + 20)}`}
        width={2 * (RADIUS_OUTER + 20)}
        height={2 * (RADIUS_OUTER + 20)}
        style={{ fontFamily: tokens.font.display }}
      >
        {slots.map((slot, i) => {
          const start = offset + i * wedge;
          const end = start + wedge;
          const isActive = selected === i;
          const isEquipped = slot.kind === 'weapon' ? inv.equipped === slot.id : inv.equipped == null;
          const d = describeWedge(start, end);
          const fill = isActive
            ? 'rgba(245,203,92,0.18)'
            : isEquipped
              ? 'rgba(245,203,92,0.06)'
              : 'rgba(16,18,24,0.6)';
          const stroke = isActive ? tokens.color.accent : tokens.color.border;
          const mid = start + wedge / 2;
          const labelR = (RADIUS_OUTER + RADIUS_INNER) / 2;
          const lx = Math.cos(mid) * labelR;
          const ly = Math.sin(mid) * labelR;
          return (
            <g key={i}>
              <path
                d={d}
                fill={fill}
                stroke={stroke}
                strokeWidth={isActive ? 2 : 1}
                style={{ transition: `fill 120ms linear, stroke 120ms linear` }}
              />
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                fontSize={14}
                fontWeight={600}
                fill={isActive ? tokens.color.accent : tokens.color.text}
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {slot.label}
              </text>
              {slot.kind === 'weapon' && (
                <text
                  x={lx}
                  y={ly + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily={tokens.font.mono}
                  fill={tokens.color.textMuted}
                >
                  {slot.magazine} / {slot.reserve}
                </text>
              )}
            </g>
          );
        })}
        {/* inner hub */}
        <circle
          r={RADIUS_INNER - 4}
          fill="rgba(10,12,16,0.82)"
          stroke={tokens.color.border}
          strokeWidth={1}
        />
        <text
          x={0}
          y={-6}
          textAnchor="middle"
          fontSize={10}
          fill={tokens.color.textMuted}
          fontFamily={tokens.font.mono}
          style={{ letterSpacing: 2, textTransform: 'uppercase' }}
        >
          Hold Q
        </text>
        <text
          x={0}
          y={14}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill={tokens.color.text}
        >
          {selectedSlot ? selectedSlot.label : 'Select'}
        </text>
      </svg>
    </div>
  );
}

