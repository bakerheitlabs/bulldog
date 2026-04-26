import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { starsFromHeat, useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import {
  getPrompt,
  subscribePrompt,
  type InteractionPrompt,
} from '@/game/interactions/interactionState';
import {
  readDrivenCarPos,
  readDrivenPlanePos,
  useVehicleStore,
} from '@/game/vehicles/vehicleState';
import { GROUND_Y } from '@/game/airplanes/airplaneConstants';
import { useSettingsStore } from '@/state/settingsStore';
import { tokens } from '@/ui/tokens';
import CityMap from './CityMap';

const HP_SEGMENTS = 10;

const panelBase: CSSProperties = {
  background: tokens.color.panel,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  boxShadow: tokens.shadow.panel,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  color: tokens.color.text,
};

const keycapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 22,
  padding: '0 6px',
  border: `1px solid ${tokens.color.borderStrong}`,
  borderRadius: tokens.radius.sm,
  background: 'rgba(255,255,255,0.06)',
  fontFamily: tokens.font.mono,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: 0.5,
  color: tokens.color.text,
};

function Keycap({ label }: { label: string }) {
  return <span style={keycapStyle}>{label}</span>;
}

function usePrev<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function hpColor(hp: number): string {
  if (hp > 50) return tokens.color.hpHigh;
  if (hp > 20) return tokens.color.hpMid;
  return tokens.color.hpLow;
}

function HealthPanel({ hp }: { hp: number }) {
  const color = hpColor(hp);
  return (
    <div style={{ ...panelBase, padding: '6px 10px', width: 240 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: tokens.font.mono,
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: tokens.color.textMuted,
          marginBottom: 4,
        }}
      >
        <span>Health</span>
        <span style={{ color: tokens.color.text, fontWeight: 600 }}>{hp}</span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${hp}%`,
            height: '100%',
            background: color,
            transition: `width ${tokens.motion.med}ms ${tokens.motion.easeOut}, background ${tokens.motion.med}ms linear`,
            boxShadow: `0 0 10px ${color}55`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            pointerEvents: 'none',
          }}
        >
          {Array.from({ length: HP_SEGMENTS - 1 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                borderRight:
                  i === HP_SEGMENTS - 2 ? 'none' : '1px solid rgba(0,0,0,0.45)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatClock(seconds: number): { time: string; suffix: string } {
  const total = Math.max(0, Math.floor(seconds)) % 86400;
  const h24 = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { time: `${h12}:${m.toString().padStart(2, '0')}`, suffix };
}

const WEATHER_LABELS: Record<string, string> = {
  sunny: 'CLEAR',
  cloudy: 'CLOUDY',
  rain: 'RAIN',
  storm: 'STORM',
};

function ClockReadout({ seconds, weather }: { seconds: number; weather: string }) {
  const { time, suffix } = formatClock(seconds);
  const label = WEATHER_LABELS[weather] ?? weather.toUpperCase();
  return (
    <div
      style={{
        ...panelBase,
        padding: '6px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 2,
        fontFamily: tokens.font.mono,
        width: 240,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            color: tokens.color.text,
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0.5,
          }}
        >
          {time}
        </span>
        <span style={{ color: tokens.color.textMuted, fontSize: 12, letterSpacing: 1.4 }}>
          {suffix}
        </span>
      </div>
      <span
        style={{
          color: tokens.color.textMuted,
          fontSize: 9,
          letterSpacing: 1.6,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MoneyReadout({ money }: { money: number }) {
  return (
    <div
      style={{
        ...panelBase,
        padding: '6px 12px',
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        fontFamily: tokens.font.mono,
        width: 240,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ color: tokens.color.textMuted, fontSize: 12, letterSpacing: 1 }}>$</span>
      <span
        style={{
          color: tokens.color.accent,
          fontSize: 20,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 0.5,
          textShadow: '0 1px 0 rgba(0,0,0,0.5)',
        }}
      >
        {money.toLocaleString()}
      </span>
    </div>
  );
}

function WantedStars({ stars }: { stars: number }) {
  const prev = usePrev(stars);
  const bumped = prev != null && stars > prev;
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!bumped) return;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 240);
    return () => window.clearTimeout(id);
  }, [bumped, stars]);
  return (
    <div
      style={{
        ...panelBase,
        padding: '4px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontFamily: tokens.font.mono,
        transform: pulse ? 'scale(1.06)' : 'scale(1)',
        transition: `transform ${tokens.motion.fast}ms ${tokens.motion.easeOut}`,
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const active = i < stars;
        return (
          <span
            key={i}
            style={{
              fontSize: 22,
              lineHeight: 1,
              color: active ? tokens.color.accent : 'rgba(255,255,255,0.16)',
              textShadow: active ? tokens.shadow.glow : 'none',
              transition: `color ${tokens.motion.fast}ms linear, text-shadow ${tokens.motion.fast}ms linear`,
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

function StatusPanel({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...panelBase,
        padding: '8px 14px',
        minWidth: 170,
        textAlign: 'right',
        fontFamily: tokens.font.mono,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: tokens.color.textMuted,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {primary}
      </div>
      {secondary != null && (
        <div
          style={{
            fontSize: 11,
            color: tokens.color.textMuted,
            marginTop: 4,
            letterSpacing: 0.8,
          }}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}

function InteractionPill({ prompt }: { prompt: InteractionPrompt }) {
  return (
    <div
      style={{
        ...panelBase,
        padding: '8px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: tokens.font.display,
        fontSize: 14,
        lineHeight: 1,
        color: tokens.color.text,
      }}
    >
      <Keycap label="E" />
      <span>{prompt.label}</span>
    </div>
  );
}

export default function HUD() {
  const player = useGameStore((s) => s.player);
  const inv = useGameStore((s) => s.inventory);
  const heat = useGameStore((s) => s.wanted.heat);
  const stars = starsFromHeat(heat);
  const worldSeconds = useGameStore((s) => s.time.seconds);
  const weather = useGameStore((s) => s.weather.type);
  const [prompt, setPromptState] = useState<InteractionPrompt | null>(getPrompt());
  const drivenCarId = useVehicleStore((s) => s.drivenCarId);
  const drivenPlaneId = useVehicleStore((s) => s.drivenPlaneId);
  const speedUnit = useSettingsStore((s) => s.speedUnit);
  const [speedMps, setSpeedMps] = useState(0);
  const [altitudeM, setAltitudeM] = useState(0);
  const lastVehiclePos = useRef<{ x: number; y: number; z: number; t: number } | null>(null);

  useEffect(() => subscribePrompt(() => setPromptState(getPrompt())), []);

  useEffect(() => {
    const inVehicle = drivenCarId != null || drivenPlaneId != null;
    if (!inVehicle) {
      lastVehiclePos.current = null;
      setSpeedMps(0);
      setAltitudeM(0);
      return;
    }
    let raf = 0;
    const readPose = () => (drivenPlaneId ? readDrivenPlanePos() : readDrivenCarPos());
    const tick = () => {
      const p = readPose();
      const now = performance.now();
      if (p) {
        if (lastVehiclePos.current) {
          const dx = p.x - lastVehiclePos.current.x;
          const dy = p.y - lastVehiclePos.current.y;
          const dz = p.z - lastVehiclePos.current.z;
          const dt = Math.max(1, now - lastVehiclePos.current.t) / 1000;
          // For planes, factor altitude change into the speed reading so the
          // speedo doesn't flatline during a vertical climb. Cars stay 2D.
          const mps = drivenPlaneId
            ? Math.hypot(dx, dy, dz) / dt
            : Math.hypot(dx, dz) / dt;
          setSpeedMps((prev) => prev * 0.7 + mps * 0.3);
        }
        lastVehiclePos.current = { x: p.x, y: p.y, z: p.z, t: now };
        if (drivenPlaneId) {
          // Altitude above the airport ground reference; clamp to zero on
          // the runway so noise around GROUND_Y doesn't show "1m" while
          // sitting still.
          setAltitudeM(Math.max(0, p.y - GROUND_Y));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drivenCarId, drivenPlaneId]);

  // Display conversion. m/s × 2.237 = mph; m/s × 3.6 = km/h. Source of truth
  // stays in m/s so flipping the setting is instant with no state migration.
  const speedDisplay =
    speedUnit === 'mph' ? speedMps * 2.23694 : speedMps * 3.6;
  const speedUnitLabel = speedUnit === 'mph' ? 'mph' : 'km/h';
  // Cruise threshold ≈ 12.5 m/s (was 45 km/h ≈ 28 mph) — keep the same
  // physical speed regardless of unit selection.
  const speedTier = speedMps < 0.14 ? 'IDLE' : speedMps > 12.5 ? 'CRUISE' : 'DRIVE';

  const equipped = inv.equipped;
  const ammo = equipped ? inv.ammo[equipped] : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: tokens.font.display,
        color: tokens.color.text,
        textShadow: '0 1px 2px rgba(0,0,0,0.7)',
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
          border: `1.5px solid ${tokens.color.borderStrong}`,
          borderRadius: '50%',
          boxShadow: '0 0 4px rgba(0,0,0,0.8)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 2,
          height: 2,
          marginLeft: -1,
          marginTop: -1,
          background: tokens.color.text,
          borderRadius: '50%',
        }}
      />

      {/* top-right: wanted stars (conditional) + health + money */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 18,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {stars > 0 && <WantedStars stars={stars} />}
        <HealthPanel hp={player.health} />
        <MoneyReadout money={player.money} />
        <ClockReadout seconds={worldSeconds} weather={weather} />
      </div>

      {/* top-left: minimap */}
      <div style={{ position: 'absolute', top: 14, left: 14 }}>
        <CityMap variant="minimap" />
      </div>

      {/* bottom-right: weapon/ammo OR speedometer (+ altimeter when flying) */}
      <div style={{ position: 'absolute', bottom: 18, right: 18 }}>
        {drivenPlaneId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <StatusPanel
              label="Airspeed"
              primary={
                <>
                  {Math.round(speedDisplay)}
                  <span
                    style={{
                      color: tokens.color.textMuted,
                      fontSize: 13,
                      marginLeft: 6,
                      fontWeight: 500,
                    }}
                  >
                    {speedUnitLabel}
                  </span>
                </>
              }
              secondary={altitudeM < 1 ? 'GROUND' : 'AIRBORNE'}
            />
            <StatusPanel
              label="Altitude"
              primary={
                <>
                  {Math.round(altitudeM)}
                  <span
                    style={{
                      color: tokens.color.textMuted,
                      fontSize: 13,
                      marginLeft: 6,
                      fontWeight: 500,
                    }}
                  >
                    m
                  </span>
                </>
              }
            />
          </div>
        ) : drivenCarId ? (
          <StatusPanel
            label="Speed"
            primary={
              <>
                {Math.round(speedDisplay)}
                <span
                  style={{
                    color: tokens.color.textMuted,
                    fontSize: 13,
                    marginLeft: 6,
                    fontWeight: 500,
                  }}
                >
                  {speedUnitLabel}
                </span>
              </>
            }
            secondary={speedTier}
          />
        ) : equipped && ammo ? (
          <StatusPanel
            label={WEAPONS[equipped].name}
            primary={
              <>
                {ammo.magazine}
                <span
                  style={{
                    color: tokens.color.textMuted,
                    fontSize: 16,
                    fontWeight: 500,
                    marginLeft: 4,
                  }}
                >
                  / {ammo.reserve}
                </span>
              </>
            }
            secondary={
              ammo.magazine === 0 ? (
                <span style={{ color: tokens.color.hpLow, letterSpacing: 1.4 }}>RELOAD</span>
              ) : undefined
            }
          />
        ) : (
          <StatusPanel label="Weapon" primary={<span style={{ fontSize: 18 }}>Unarmed</span>} />
        )}
      </div>

      {/* center prompt */}
      {prompt && (
        <div
          style={{
            position: 'absolute',
            top: '62%',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <InteractionPill prompt={prompt} />
        </div>
      )}
    </div>
  );
}
