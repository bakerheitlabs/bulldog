import { Billboard, Sky } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
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

// Hemisphere fill: sky color is weather-driven (reuses fog color), ground is a
// fixed warm asphalt tint so undersides of cars/buildings get a believable
// bounce instead of looking pitch-black.
const HEMI_GROUND = new THREE.Color('#3a3530');

// Moonlight: a second directional light that's bright at midnight and fades
// to zero through dawn. Cool pale-blue tint. No shadows — keeps night cheap
// (a second shadow map would double the shadow pass cost) and matches reality
// where moonlight is too faint to cast crisp shadows. The moon's intensity
// uses a higher floor than the sun did at night because *this* is now the
// primary night-time directional light; without it streets read pitch-black.
const NIGHT_MOON_INTENSITY = 0.45;
const MOON_COLOR = new THREE.Color('#a8c0ff');

// Visible celestial bodies. Sit well inside the Sky dome (distance 8000) so
// they read as objects in the sky from anywhere in the playable area. Radii
// are stylized — geometrically each would be ~10m at this distance, but we
// scale up so they're actually visible from the city.
const MOON_SKY_DISTANCE = 3000;
const MOON_RADIUS = 90;
const SUN_SKY_DISTANCE = 3000;
const SUN_RADIUS = 110;
// Bright near-white with a barely-there warm tint — close to how the real
// sun reads from the ground at noon. Stays toneMapped=false on the material
// so ACES doesn't pull the brightness down; the warm halo around the disc
// (drawn separately via the rays texture + Drei's Sky shader) handles the
// "yellower at the edges" feel.
const SUN_BODY_COLOR = '#fffaeb';
// Halo plane extends past the sun disc so the soft glow radiates outward.
// What you actually see around the sun in real life is atmospheric scattering
// — a smooth halo that fades with distance — not discrete starburst rays.
const SUN_RAYS_SIZE = SUN_RADIUS * 6;

// Paint a radial-gradient blob at three wrapped X positions so anything
// crossing the canvas seam tiles correctly on the sphere — the equirectangular
// UV wrap then shows no visible seam on the back of the body.
function drawWrappedBlob(
  ctx: CanvasRenderingContext2D,
  w: number,
  cx: number,
  cy: number,
  r: number,
  stops: Array<[number, string]>,
) {
  for (const ox of [-w, 0, w]) {
    const g = ctx.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, r);
    for (const [stop, color] of stops) g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx + ox, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Procedurally paint a moon texture in four layers so no part reads as flat
// pure white: a muted base, many overlapping mid-frequency splotches that
// vary lightness across the surface, then darker maria and craters on top,
// finished with seamless per-pixel grain. Generated once into a canvas and
// uploaded as a CanvasTexture — no asset pipeline.
function createMoonTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#bcbdc4';
  ctx.fillRect(0, 0, w, h);

  // Mid-frequency variegation: many overlapping soft splotches at random
  // brightnesses ensure no region of the surface is flat.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 20 + Math.random() * 70;
    const shade = Math.floor(150 + Math.random() * 100);
    const alpha = 0.06 + Math.random() * 0.12;
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, `rgba(${shade},${shade},${shade + 4},${alpha})`],
      [1, `rgba(${shade},${shade},${shade + 4},0)`],
    ]);
  }

  // Maria: large darker plains, kept away from the poles where extreme
  // equirectangular pinching would distort them.
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * w;
    const y = h * (0.2 + Math.random() * 0.6);
    const r = 60 + Math.random() * 90;
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, 'rgba(140,142,155,0.5)'],
      [1, 'rgba(140,142,155,0)'],
    ]);
  }

  // Craters: small darker spots with soft falloff.
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 3 + Math.random() * 16;
    const shade = Math.floor(120 + Math.random() * 60);
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, `rgba(${shade},${shade},${shade + 5},0.55)`],
      [0.7, `rgba(${shade},${shade},${shade + 5},0.22)`],
      [1, `rgba(${shade},${shade},${shade + 5},0)`],
    ]);
  }

  // Per-pixel grain. The first/last column are forced equal so the noise
  // layer also wraps cleanly across the seam (the macro features above
  // dominate visually, but this avoids a hairline noise mismatch).
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w * 4;
    const rightIdx = (y * w + (w - 1)) * 4;
    data[rightIdx] = data[leftIdx];
    data[rightIdx + 1] = data[leftIdx + 1];
    data[rightIdx + 2] = data[leftIdx + 2];
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Horizontal wrap is the dimension that maps around the sphere's longitude;
  // matching the seam-wrapped drawing above lets the GPU sample across the
  // boundary without a discontinuity.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Procedurally paint a sun texture: saturated yellow base with overlapping
// lighter and slightly warmer splotches that read as plasma granulation, plus
// a few darker sunspots. No starkly bright "core" — the sun is uniformly
// luminous; surface character comes from subtle warm-on-warm variation.
// Uses the same wrapped-blob trick so the equirectangular UV seam is hidden.
function createSunTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  // Very light warm-white base — multiplies with SUN_BODY_COLOR on the
  // material; both kept near pure white so the disc reads as bright white.
  ctx.fillStyle = '#fffbf094';
  ctx.fillRect(0, 0, w, h);

  // Pure-white granules: tiny brightness lift so the surface isn't flat.
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 6 + Math.random() * 22;
    const alpha = 0.10 + Math.random() * 0.15;
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, `rgba(255,255,255,${alpha})`],
      [1, 'rgba(255,255,255,0)'],
    ]);
  }

  // Faintly warmer splotches — kept very subtle so they don't tint the disc.
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 10 + Math.random() * 30;
    const alpha = 0.03 + Math.random() * 0.05;
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, `rgba(255,235,190,${alpha})`],
      [1, 'rgba(255,235,190,0)'],
    ]);
  }

  // Tiny near-white sunspots — barely darker than the base, just enough to
  // register as surface variation without carving holes in the brightness.
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * w;
    const y = h * (0.25 + Math.random() * 0.5);
    const r = 3 + Math.random() * 8;
    drawWrappedBlob(ctx, w, x, y, r, [
      [0, 'rgba(240,225,190,0.20)'],
      [1, 'rgba(240,225,190,0)'],
    ]);
  }

  // Subtle grain so even smooth regions have micro-variation.
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w * 4;
    const rightIdx = (y * w + (w - 1)) * 4;
    data[rightIdx] = data[leftIdx];
    data[rightIdx + 1] = data[leftIdx + 1];
    data[rightIdx + 2] = data[leftIdx + 2];
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Paint a soft atmospheric halo around the sun. What people actually perceive
// as "rays" from a real sun isn't discrete spikes — it's smooth atmospheric
// scattering that's intense near the disc and fades exponentially with
// distance. Two layered radial gradients model this: a tight bright inner
// halo (white→warm) and a wide soft outer halo (warm yellow→deep transparent
// orange), drawn additively so they accumulate naturally.
function createSunRaysTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Tight inner halo: bright near-white, fades fast. This is the intense
  // glow immediately around the sun's edge that the eye reads as "the sun is
  // really bright."
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.18);
  inner.addColorStop(0, 'rgba(255,250,225,0.85)');
  inner.addColorStop(0.45, 'rgba(255,243,200,0.4)');
  inner.addColorStop(1, 'rgba(255,235,170,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(0, 0, size, size);

  // Wide outer halo: low-amplitude warm yellow that decays quickly so the
  // exterior of the rays plane reads as nearly transparent — only the area
  // immediately around the disc carries warmth.
  ctx.globalCompositeOperation = 'lighter';
  const outer = ctx.createRadialGradient(cx, cy, size * 0.12, cx, cy, size * 0.42);
  outer.addColorStop(0, 'rgba(255,232,170,0.22)');
  outer.addColorStop(0.35, 'rgba(255,215,140,0.08)');
  outer.addColorStop(0.7, 'rgba(255,195,110,0.02)');
  outer.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Half-extent of the shadow camera's orthographic frustum, in metres. The
// frustum is centered on the player each frame, so this is the radius of
// "things that cast/receive shadows" around the camera. 90 → 180m halo,
// comfortably past fog horizon at all weather profiles.
const SHADOW_HALF_EXTENT = 90;
// Distance the directional light sits from the player along the sun direction.
// Far enough that the orthographic projection is stable, near enough that the
// near/far planes don't waste depth precision.
const SHADOW_LIGHT_DISTANCE = 120;

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
  const hemiIntensity = (NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * day) * profile.ambMul;
  const sunIntensity =
    (NIGHT_SUN_INTENSITY + (DAY_SUN_INTENSITY - NIGHT_SUN_INTENSITY) * day) * profile.sunMul;

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
  // Hemisphere sky color tracks the same day/night fog lerp so an overcast
  // afternoon fills the world with grey light from above and a clear night
  // fills with near-black — keeps the fill consistent with the sky people see.
  const hemiSky = useMemo(
    () => profile.fogNightColor.clone().lerp(profile.fogDayColor, day),
    [profile, day],
  );

  // Sun direction unit vector, recomputed when sun moves. Used by useFrame to
  // place the light a fixed distance from the player along the same heading.
  const sunDir = useMemo(() => {
    const v = new THREE.Vector3(sun.position[0], sun.position[1], sun.position[2]);
    v.normalize();
    // When the sun drops below the horizon, push it up a little so shadows
    // don't spear the world from underground.
    if (v.y < 0.08) v.y = 0.08;
    v.normalize();
    return v;
  }, [sun.position]);

  // Moon direction = sun direction inverted, so when the sun is at noon the
  // moon is below ground and when the sun sets the moon rises. Position is
  // arbitrary for a non-shadow-casting directional light — three.js uploads
  // the (position - target) direction as a uniform and uses it everywhere.
  const moonPos = useMemo<[number, number, number]>(
    () => [-sun.position[0], Math.max(-sun.position[1], 8), -sun.position[2]],
    [sun.position],
  );
  const moonIntensity = NIGHT_MOON_INTENSITY * (1 - day) * profile.ambMul;

  // Visible moon body — pushed out to skybox distance along the moon direction
  // so it reads as a celestial object in the sky regardless of where the
  // player is in the city. Opacity fades with `day` so the moon is brightest
  // at midnight and invisible at noon (where it's also below the horizon).
  // Hidden entirely under heavy weather where overcast clouds would block it.
  const moonBodyPos = useMemo<[number, number, number]>(() => {
    const len = Math.hypot(sun.position[0], sun.position[1], sun.position[2]) || 1;
    return [
      (-sun.position[0] / len) * MOON_SKY_DISTANCE,
      (-sun.position[1] / len) * MOON_SKY_DISTANCE,
      (-sun.position[2] / len) * MOON_SKY_DISTANCE,
    ];
  }, [sun.position]);
  const moonOpacity = Math.max(0, 1 - day) * (profile.useSky ? 1 : 0.15);
  // Generated lazily on first render and cached for the component's lifetime.
  const moonTexture = useMemo(() => createMoonTexture(), []);

  // Sun body — same skybox treatment as the moon, but along the actual sun
  // direction. Visible during the day, hidden under heavy weather where
  // overcast clouds would block it.
  const sunBodyPos = useMemo<[number, number, number]>(() => {
    const len = Math.hypot(sun.position[0], sun.position[1], sun.position[2]) || 1;
    return [
      (sun.position[0] / len) * SUN_SKY_DISTANCE,
      (sun.position[1] / len) * SUN_SKY_DISTANCE,
      (sun.position[2] / len) * SUN_SKY_DISTANCE,
    ];
  }, [sun.position]);
  const sunOpacity = day * (profile.useSky ? 1 : 0.1);
  const sunTexture = useMemo(() => createSunTexture(), []);
  const sunRaysTexture = useMemo(() => createSunRaysTexture(), []);

  const lightRef = useRef<THREE.DirectionalLight>(null);
  // Keep the shadow frustum centered on the player. Reads the player position
  // imperatively so this doesn't subscribe to every store change.
  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const [px, , pz] = useGameStore.getState().player.position;
    light.position.set(
      px + sunDir.x * SHADOW_LIGHT_DISTANCE,
      sunDir.y * SHADOW_LIGHT_DISTANCE,
      pz + sunDir.z * SHADOW_LIGHT_DISTANCE,
    );
    light.target.position.set(px, 0, pz);
    light.target.updateMatrixWorld();
  });

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
      {moonOpacity > 0.01 && (
        <mesh position={moonBodyPos}>
          <sphereGeometry args={[MOON_RADIUS, 32, 32]} />
          <meshBasicMaterial
            map={moonTexture}
            color="#ffffff"
            toneMapped={false}
            transparent
            opacity={moonOpacity}
            depthWrite={false}
          />
        </mesh>
      )}
      {sunOpacity > 0.01 && (
        <>
          {/* Rays plane: billboarded so it always faces the camera. Drawn
              first (and additively) so the sun sphere renders cleanly on
              top while the rays brighten the surrounding sky. */}
          <Billboard position={sunBodyPos}>
            <mesh>
              <planeGeometry args={[SUN_RAYS_SIZE, SUN_RAYS_SIZE]} />
              <meshBasicMaterial
                map={sunRaysTexture}
                toneMapped={false}
                transparent
                opacity={sunOpacity * 0.9}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </Billboard>
          <mesh position={sunBodyPos}>
            <sphereGeometry args={[SUN_RADIUS, 32, 32]} />
            <meshBasicMaterial
              map={sunTexture}
              color={SUN_BODY_COLOR}
              toneMapped={false}
              transparent
              opacity={sunOpacity}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <hemisphereLight args={[hemiSky, HEMI_GROUND, hemiIntensity]} />
      <directionalLight
        position={moonPos}
        color={MOON_COLOR}
        intensity={moonIntensity}
      />
      <directionalLight
        ref={lightRef}
        intensity={sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-SHADOW_HALF_EXTENT}
        shadow-camera-right={SHADOW_HALF_EXTENT}
        shadow-camera-top={SHADOW_HALF_EXTENT}
        shadow-camera-bottom={-SHADOW_HALF_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      {/* The light's target is a separate Object3D — adding it to the scene
          ensures its world matrix updates each frame for the shadow camera. */}
      {lightRef.current && <primitive object={lightRef.current.target} />}
    </>
  );
}
