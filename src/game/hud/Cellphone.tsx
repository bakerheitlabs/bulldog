import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '@/state/gameStore';
import { tokens } from '@/ui/tokens';
import { buildForecast } from '@/game/world/weatherForecast';
import type { WeatherType } from '@/save/schema';

type AppId = 'map' | 'weather' | 'messages' | 'bank' | 'camera' | 'music';

const APPS: { id: AppId; label: string; glyph: string; tint: string }[] = [
  { id: 'map',      label: 'Map',      glyph: '🗺',  tint: '#3b82f6' },
  { id: 'weather',  label: 'Weather',  glyph: '⛅',  tint: '#0ea5e9' },
  { id: 'messages', label: 'Messages', glyph: '💬',  tint: '#22d3ee' },
  { id: 'bank',     label: 'Bank',     glyph: '💳',  tint: '#f5cb5c' },
  { id: 'camera',   label: 'Camera',   glyph: '📷',  tint: '#a78bfa' },
  { id: 'music',    label: 'Music',    glyph: '🎵',  tint: '#ef4444' },
];

const APP_BLURBS: Record<AppId, string> = {
  map: 'No saved waypoints. Open the world map for routing.',
  weather: '',
  messages: 'No new messages.',
  bank: 'Transfers and ATM withdrawals — coming soon.',
  camera: 'Snap a selfie. Roll not yet implemented.',
  music: 'Tune in to BD-Radio. Stations under construction.',
};

const WEATHER_META: Record<WeatherType, { label: string; glyph: string; tint: string; tagline: string }> = {
  sunny:  { label: 'Clear',  glyph: '☀️', tint: '#f5cb5c', tagline: 'Crisp skies, good visibility.' },
  cloudy: { label: 'Cloudy', glyph: '☁️', tint: '#94a3b8', tagline: 'Overcast with diffuse light.' },
  rain:   { label: 'Rain',   glyph: '🌧️', tint: '#38bdf8', tagline: 'Wet roads — drive carefully.' },
  storm:  { label: 'Storm',  glyph: '⛈️', tint: '#7c3aed', tagline: 'Heavy rain and thunder incoming.' },
};

function formatHour(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds)) % 86400;
  const h24 = Math.floor(total / 3600);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${suffix}`;
}

const screenBg = 'linear-gradient(180deg, #1f2a44 0%, #2a1e3d 50%, #3a1f2f 100%)';

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds)) % 86400;
  const h24 = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function StatusBar({ time }: { time: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: tokens.font.mono,
        fontSize: 10,
        letterSpacing: 0.6,
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      <span>{time}</span>
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <span>▮▮▮▯</span>
        <span>100%</span>
      </span>
    </div>
  );
}

function AppIcon({
  glyph,
  tint,
  label,
  onClick,
  size = 40,
}: {
  glyph: string;
  tint: string;
  label: string;
  onClick: () => void;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: tint,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          boxShadow: hover
            ? `0 4px 14px ${tint}aa, 0 0 0 2px rgba(255,255,255,0.4)`
            : '0 2px 6px rgba(0,0,0,0.4)',
          transform: hover ? 'translateY(-1px)' : 'translateY(0)',
          transition: `transform ${tokens.motion.fast}ms ${tokens.motion.easeOut}, box-shadow ${tokens.motion.fast}ms linear`,
        }}
      >
        {glyph}
      </div>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)' }}>{label}</span>
    </button>
  );
}

function HomeScreen({
  time,
  money,
  onOpenApp,
}: {
  time: string;
  money: number;
  onOpenApp: (id: AppId) => void;
}) {
  return (
    <>
      <StatusBar time={time} />
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 300,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 1,
            lineHeight: 1,
          }}
        >
          {time}
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            color: 'rgba(255,255,255,0.65)',
            marginTop: 4,
            textTransform: 'uppercase',
          }}
        >
          Balance ${money.toLocaleString()}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginTop: 8,
        }}
      >
        {APPS.map((app) => (
          <AppIcon
            key={app.id}
            glyph={app.glyph}
            tint={app.tint}
            label={app.label}
            onClick={() => onOpenApp(app.id)}
          />
        ))}
      </div>
    </>
  );
}

function AppHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: tokens.color.text,
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        ‹ Back
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    </div>
  );
}

function formatDuration(sec: number): string {
  const hours = sec / 3600;
  if (hours < 1) {
    const m = Math.max(1, Math.round(sec / 60));
    return `${m}m`;
  }
  // Round to whole hours past 1.5h; show one decimal under that for short
  // tail-ends ("0.5h remaining" reads better than "30m" right next to "Now").
  if (hours < 1.5) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function WeatherAppBody({ worldSeconds }: { worldSeconds: number }) {
  const schedule = useGameStore((s) => s.weatherSchedule);
  const entries = buildForecast(
    worldSeconds,
    schedule.current,
    schedule.elapsedSec,
    schedule.upcoming,
    6,
  );
  const current = entries[0];
  const upcoming = entries.slice(1);
  const meta = WEATHER_META[current.type];
  const remainingLabel =
    current.remainingSec != null && current.remainingSec > 0
      ? `Now · ${formatDuration(current.remainingSec)} left · ends ${formatHour(current.endSeconds)}`
      : `Now · ends ${formatHour(current.endSeconds)}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      <div
        style={{
          borderRadius: 12,
          padding: '10px 12px',
          background: `linear-gradient(135deg, ${meta.tint}55 0%, rgba(0,0,0,0.25) 100%)`,
          border: `1px solid ${meta.tint}66`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>{meta.glyph}</span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.1 }}>{meta.label}</span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                color: 'rgba(255,255,255,0.65)',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {remainingLabel}
            </span>
          </div>
        </div>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 10,
            lineHeight: 1.4,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {meta.tagline}
        </p>
      </div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.4,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
        }}
      >
        Forecast
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {upcoming.map((entry) => {
          const m = WEATHER_META[entry.type];
          return (
            <div
              key={entry.index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 6px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <span
                style={{
                  fontFamily: tokens.font.mono,
                  fontSize: 10,
                  width: 36,
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {formatHour(entry.startSeconds)}
              </span>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{m.glyph}</span>
              <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                {m.label}
              </span>
              <span
                style={{
                  fontFamily: tokens.font.mono,
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {formatDuration(entry.durationSec)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppScreen({
  app,
  time,
  worldSeconds,
  onBack,
}: {
  app: (typeof APPS)[number];
  time: string;
  worldSeconds: number;
  onBack: () => void;
}) {
  return (
    <>
      <StatusBar time={time} />
      <AppHeader label={app.label} onBack={onBack} />
      {app.id === 'weather' ? (
        <WeatherAppBody worldSeconds={worldSeconds} />
      ) : (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: app.tint,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              boxShadow: `0 6px 18px ${app.tint}55`,
            }}
          >
            {app.glyph}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.85)',
              textAlign: 'center',
              padding: '0 6px',
            }}
          >
            {APP_BLURBS[app.id]}
          </p>
        </div>
      )}
    </>
  );
}

export default function Cellphone({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const worldSeconds = useGameStore((s) => s.time.seconds);
  const money = useGameStore((s) => s.player.money);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);

  // Reset to home screen each time the phone is reopened.
  useEffect(() => {
    if (!open) setActiveApp(null);
  }, [open]);

  const time = formatTime(worldSeconds);
  const app = activeApp ? APPS.find((a) => a.id === activeApp) ?? null : null;

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    bottom: 18,
    right: 18,
    pointerEvents: open ? 'auto' : 'none',
    transform: open ? 'translateY(0) scale(1)' : 'translateY(120%) scale(0.96)',
    opacity: open ? 1 : 0,
    transition: `transform ${tokens.motion.med}ms ${tokens.motion.easeOut}, opacity ${tokens.motion.fast}ms linear`,
    transformOrigin: '100% 100%',
  };

  return (
    <div style={wrapperStyle}>
      <div
        style={{
          width: 220,
          height: 380,
          borderRadius: 26,
          background: 'linear-gradient(160deg, #1a1d24 0%, #0a0c10 100%)',
          border: '2px solid #2a2e36',
          boxShadow: '0 18px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: 10,
          boxSizing: 'border-box',
          fontFamily: tokens.font.display,
          color: tokens.color.text,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 70,
            height: 14,
            borderRadius: 8,
            background: '#05060a',
          }}
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 18,
            background: screenBg,
            padding: '24px 14px 14px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflow: 'hidden',
          }}
        >
          {app ? (
            <AppScreen
              app={app}
              time={time}
              worldSeconds={worldSeconds}
              onBack={() => setActiveApp(null)}
            />
          ) : (
            <HomeScreen time={time} money={money} onOpenApp={setActiveApp} />
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close phone"
            style={{
              width: 70,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.55)',
              alignSelf: 'center',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          textAlign: 'center',
          fontFamily: tokens.font.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          color: tokens.color.textMuted,
          textTransform: 'uppercase',
        }}
      >
        ↑ to close
      </div>
    </div>
  );
}
