import { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '@/state/gameStore';
import { findCellByTag } from '@/game/world/cityLayout';
import { CHURCH_BELL_NOTES, playChurchBell } from '@/game/audio/synth';

// Bell tower height above the church cell center, in meters. Roughly the
// church's roof line so the spatial source is up at belfry height rather
// than ground level.
const BELL_TOWER_Y = 14;
// Real-time spacing between successive strikes within an hour-chime
// sequence. 2.5s lets each strike's tail breathe into the next.
const STRIKE_INTERVAL_MS = 2500;

// Plays church bells on every in-game hour boundary between 7 AM and 7 PM
// inclusive — quiet at night so the chimes don't disturb sleeping. Number of
// strikes = (hour % 12) || 12, so 1 o'clock rings once and noon rings
// twelve times. The actual playback uses playChurchBell with a spatial
// position so the bells are panned + attenuated based on the player's
// distance from the church. Re-renders are gated to once per game-hour by
// the useGameStore selector deriving the hour directly from time.seconds.
const QUIET_HOUR_START = 20; // 8 PM and after — bells silent
const QUIET_HOUR_END = 7;    // before 7 AM — bells silent
export default function ChurchBells() {
  const churchPos = useMemo(() => {
    const cell = findCellByTag('church');
    if (!cell) return null;
    return { x: cell.center[0], y: cell.center[1] + BELL_TOWER_Y, z: cell.center[2] };
  }, []);

  const hour = useGameStore((s) => Math.floor(s.time.seconds / 3600) % 24);

  // Skip ringing on initial mount (we don't want a chime when the game first
  // loads at 8:00 AM — only on actual hour transitions during play).
  const isFirst = useRef(true);
  // Outstanding setTimeout handles, so a re-mount or pause doesn't queue
  // up overlapping chimes.
  const pendingRef = useRef<number[]>([]);

  useEffect(() => {
    if (!churchPos) return;
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    // Cancel any in-flight chime sequence from the previous hour (rare —
    // would only matter at very fast WORLD_TIME_RATEs).
    for (const h of pendingRef.current) clearTimeout(h);
    pendingRef.current = [];

    // Silent overnight: skip the chime entirely outside the 7 AM–7 PM window.
    if (hour < QUIET_HOUR_END || hour >= QUIET_HOUR_START) return;

    const count = hour % 12 || 12;
    for (let i = 0; i < count; i++) {
      // Cycle through the tuned bell set so a long chime sounds melodic
      // (E, G#, B, E, G#, B, ...) instead of one bell repeating.
      const pitch = CHURCH_BELL_NOTES[i % CHURCH_BELL_NOTES.length];
      const h = window.setTimeout(() => {
        playChurchBell({ ...churchPos, pitch });
      }, i * STRIKE_INTERVAL_MS);
      pendingRef.current.push(h);
    }
  }, [hour, churchPos]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const h of pendingRef.current) clearTimeout(h);
      pendingRef.current = [];
    };
  }, []);

  return null;
}
