import { Sky } from '@react-three/drei';
import { useMemo } from 'react';
import { useGameStore, SECONDS_PER_DAY } from '@/state/gameStore';

// Headlights flip on at 6 PM and off at 6 AM — covers the full window in which
// the directional sun light has dropped below the horizon plus the twilight
// fade. Selecting on a derived boolean (rather than the raw seconds) means
// subscribers only re-render at the two flip points, not every tick.
const HEADLIGHTS_ON_HOUR = 18;
const HEADLIGHTS_OFF_HOUR = 6;

// Sun travels a great-circle arc tilted ~25° off the world's east-west line so
// it doesn't pass exactly through (0, 1, 0) at noon — gives the directional
// light a more interesting shadow angle than a perfectly overhead sun.
const SUN_DISTANCE = 100;
const SUN_TILT_RAD = (25 * Math.PI) / 180;

const DAY_AMBIENT = 0.5;
const NIGHT_AMBIENT = 0.18;

const DAY_SUN_INTENSITY = 1.1;
const NIGHT_SUN_INTENSITY = 0.05;

// Smoothly fades sun intensity and ambient between day and night across the
// horizon transition. `h` is the normalized sun height in [-1, 1].
function dayFactor(h: number) {
  // Twilight band ±0.15 of horizon — sin(angle) is small near sunrise/sunset.
  const t = (h + 0.15) / 0.3;
  return Math.max(0, Math.min(1, t));
}

export type SunInfo = {
  position: [number, number, number];
  height: number;
  isDay: boolean;
};

export function isNightAt(seconds: number): boolean {
  const hour = seconds / 3600;
  return hour >= HEADLIGHTS_ON_HOUR || hour < HEADLIGHTS_OFF_HOUR;
}

export function useIsNight(): boolean {
  return useGameStore((s) => isNightAt(s.time.seconds));
}

export function computeSun(seconds: number): SunInfo {
  // Map time-of-day onto an angle so noon → zenith, midnight → nadir.
  // angle = (frac * 2π) - π/2 means 06:00 → 0 (east horizon),
  // 12:00 → π/2 (overhead), 18:00 → π (west horizon).
  const frac = seconds / SECONDS_PER_DAY;
  const angle = frac * Math.PI * 2 - Math.PI / 2;
  const horizontal = Math.cos(angle);
  const vertical = Math.sin(angle);
  // Tilt the arc so the sun's azimuth shifts as it crosses the sky rather
  // than tracing a flat east-up-west line.
  const x = horizontal * Math.cos(SUN_TILT_RAD);
  const z = horizontal * Math.sin(SUN_TILT_RAD);
  return {
    position: [x * SUN_DISTANCE, vertical * SUN_DISTANCE, z * SUN_DISTANCE],
    height: vertical,
    isDay: vertical > 0,
  };
}

export default function DayNightLighting() {
  const seconds = useGameStore((s) => s.time.seconds);
  const sun = useMemo(() => computeSun(seconds), [seconds]);

  const day = dayFactor(sun.height);
  const ambient = NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * day;
  const sunIntensity = NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * day;
  // Park the directional light just above the horizon when the sun has set so
  // shadows don't go bonkers from a light source below ground.
  const lightY = Math.max(sun.position[1], 8);

  return (
    <>
      <Sky sunPosition={sun.position} turbidity={4} rayleigh={1.2} />
      <ambientLight intensity={ambient} />
      <directionalLight
        position={[sun.position[0], lightY, sun.position[2]]}
        intensity={sunIntensity}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
    </>
  );
}
