import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  endElevator,
  getElevator,
  subscribeElevator,
} from '@/game/world/buildings/elevatorState';
import { requestTeleport } from '@/game/world/teleport';

const FADE_IN_MS = 600;
const HOLD_MS = 900;
const FADE_OUT_MS = 600;
const TOTAL_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;

type Phase = 'idle' | 'fadeIn' | 'hold' | 'fadeOut';

// Full-screen black overlay that covers the brief teleport between hotel
// floors. Drives a three-phase timeline: fade to black, hold while we warp
// the player, fade back. The player is paused via GameRoute reading
// isElevatorActive() — we don't need to gate input here.
export default function ElevatorTransition() {
  const trans = useSyncExternalStore(subscribeElevator, getElevator, getElevator);
  const [phase, setPhase] = useState<Phase>('idle');
  const startedRef = useRef<number>(0);
  const teleportedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!trans) {
      setPhase('idle');
      teleportedRef.current = false;
      return;
    }
    startedRef.current = performance.now();
    teleportedRef.current = false;
    setPhase('fadeIn');
    let raf = 0;
    const loop = () => {
      const elapsed = performance.now() - startedRef.current;
      if (elapsed < FADE_IN_MS) {
        setPhase('fadeIn');
      } else if (elapsed < FADE_IN_MS + HOLD_MS) {
        setPhase('hold');
        // Teleport at the start of the hold phase so the player is moved
        // while the screen is fully opaque. requestTeleport queues the
        // warp; Player.tsx consumes it on the next frame.
        if (!teleportedRef.current) {
          teleportedRef.current = true;
          requestTeleport(trans.targetPos);
        }
      } else if (elapsed < TOTAL_MS) {
        setPhase('fadeOut');
      } else {
        endElevator();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trans]);

  if (!trans || phase === 'idle') return null;

  // Opacity ramp: linear fade in/out, fully opaque while we hold + warp.
  const elapsed = performance.now() - startedRef.current;
  let opacity: number;
  if (elapsed < FADE_IN_MS) {
    opacity = elapsed / FADE_IN_MS;
  } else if (elapsed < FADE_IN_MS + HOLD_MS) {
    opacity = 1;
  } else {
    const t = (elapsed - FADE_IN_MS - HOLD_MS) / FADE_OUT_MS;
    opacity = Math.max(0, 1 - t);
  }
  // Show the floor label only while the screen is fully (or near-fully)
  // black so it doesn't pop in/out under a translucent overlay.
  const labelVisible = phase === 'hold' || phase === 'fadeOut';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        opacity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 50,
        transition: 'opacity 80ms linear',
      }}
    >
      {labelVisible && (
        <div
          style={{
            color: '#f5cb5c',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 2,
            opacity: phase === 'fadeOut' ? Math.max(0, opacity - 0.2) : 1,
          }}
        >
          {trans.label}
        </div>
      )}
    </div>
  );
}
