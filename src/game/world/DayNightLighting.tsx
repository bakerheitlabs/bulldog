import { Sky } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore, SECONDS_PER_DAY } from '@/state/gameStore';
import type { WeatherType } from '@/save/schema';

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

// Per-weather modulation. `sunMul` darkens the directional light, `ambMul`
// scales ambient. `useSky` toggles between Drei's procedural Sky (sunny/
// cloudy — looks great with a visible sun) and a flat overcast background
// (rain/storm — Sky's atmospheric scattering can't render a truly dark sky,
// it always trends toward bright haze, so heavy weather swaps it out for a
// solid color that matches the fog tint). FogExp2 is GPU-cheap and blends
// distant geometry into the backdrop so the world reads as overcast.
type WeatherProfile = {
  sunMul: number;
  ambMul: number;
  useSky: boolean;
  skyTurbidity: number;
  skyRayleigh: number;
  bgDayColor: THREE.Color;
  bgNightColor: THREE.Color;
  fogDensity: number;
  // Fog color tracks the background so the horizon never shows a hard seam
  // between the sky color and the fogged-into-distance geometry.
  fogDayColor: THREE.Color;
  fogNightColor: THREE.Color;
};

const WEATHER_PROFILES: Record<WeatherType, WeatherProfile> = {
  sunny: {
    sunMul: 1.0,
    ambMul: 1.0,
    useSky: true,
    skyTurbidity: 4,
    skyRayleigh: 1.2,
    bgDayColor: new THREE.Color('#cdd6df'),
    bgNightColor: new THREE.Color('#10131a'),
    fogDensity: 0,
    fogDayColor: new THREE.Color('#cdd6df'),
    fogNightColor: new THREE.Color('#10131a'),
  },
  cloudy: {
    sunMul: 0.55,
    ambMul: 1.1,
    useSky: true,
    skyTurbidity: 12,
    skyRayleigh: 0.6,
    bgDayColor: new THREE.Color('#aab0b8'),
    bgNightColor: new THREE.Color('#1a1d24'),
    fogDensity: 0.0035,
    fogDayColor: new THREE.Color('#aab0b8'),
    fogNightColor: new THREE.Color('#1a1d24'),
  },
  // Rain: medium-dark overcast sky, sun knocked back hard, ambient slightly
  // dimmed so geometry feels gloomy rather than evenly lit.
  rain: {
    sunMul: 0.30,
    ambMul: 0.85,
    useSky: false,
    skyTurbidity: 18,
    skyRayleigh: 0.4,
    bgDayColor: new THREE.Color('#454b54'),
    bgNightColor: new THREE.Color('#0a0d12'),
    fogDensity: 0.010,
    fogDayColor: new THREE.Color('#454b54'),
    fogNightColor: new THREE.Color('#0a0d12'),
  },
  // Storm: distinctly darker than rain so the lightning flashes have
  // something to pop against; fog density bumped further to obscure
  // mid-distance buildings the way a downpour would.
  storm: {
    sunMul: 0.16,
    ambMul: 0.7,
    useSky: false,
    skyTurbidity: 24,
    skyRayleigh: 0.3,
    bgDayColor: new THREE.Color('#23272d'),
    bgNightColor: new THREE.Color('#04060a'),
    fogDensity: 0.014,
    fogDayColor: new THREE.Color('#23272d'),
    fogNightColor: new THREE.Color('#04060a'),
  },
};

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
  const weather = useGameStore((s) => s.weather.type);
  const sun = useMemo(() => computeSun(seconds), [seconds]);
  const profile = WEATHER_PROFILES[weather];

  const day = dayFactor(sun.height);
  const ambient = (NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * day) * profile.ambMul;
  const sunIntensity =
    (NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * day) * profile.sunMul;
  // Park the directional light just above the horizon when the sun has set so
  // shadows don't go bonkers from a light source below ground.
  const lightY = Math.max(sun.position[1], 8);

  // Lerp background and fog color between day and night profiles so dusk
  // renders a believable gradient rather than a hard switch.
  const bgColor = useMemo(
    () => profile.bgNightColor.clone().lerp(profile.bgDayColor, day),
    [profile, day],
  );
  const fogColor = useMemo(() => {
    if (profile.fogDensity <= 0) return null;
    return profile.fogNightColor.clone().lerp(profile.fogDayColor, day);
  }, [profile, day]);

  return (
    <>
      {profile.useSky ? (
        <Sky
          // Drei's default distance is 1000 — a box centered on world origin
          // that only spans ±500m. Once the player drives off to the airport
          // (~1100m west) they end up outside that box and see a black void
          // ahead while the half-sphere behind them still renders normally.
          // Bumping to 8000 keeps the dome larger than the city + airport
          // extent (~3km diagonal) with plenty of headroom for future regions.
          distance={8000}
          sunPosition={sun.position}
          turbidity={profile.skyTurbidity}
          rayleigh={profile.skyRayleigh}
        />
      ) : (
        // Flat overcast backdrop. Setting `attach="background"` swaps the
        // scene.background reference; the previous Sky mesh is unmounted
        // automatically by React, so the dome doesn't render at all.
        <color attach="background" args={[bgColor.getHex()]} />
      )}
      {fogColor && (
        <fogExp2 attach="fog" args={[fogColor.getHex(), profile.fogDensity]} />
      )}
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
