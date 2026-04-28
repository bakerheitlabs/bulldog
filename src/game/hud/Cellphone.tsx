import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useGameStore } from '@/state/gameStore';
import { tokens } from '@/ui/tokens';
import { buildForecast } from '@/game/world/weatherForecast';
import { formatDate, type GameDate } from '@/game/world/gameDate';
import {
  HISTORY_LEN,
  STOCKS,
  STOCK_BY_SYMBOL,
  type Stock,
} from '@/game/world/stocks';
import type { WeatherType } from '@/save/schema';

type AppId = 'map' | 'weather' | 'messages' | 'bank' | 'stocks' | 'camera' | 'music';

const APPS: { id: AppId; label: string; glyph: string; tint: string }[] = [
  { id: 'map',      label: 'Map',      glyph: '🗺',  tint: '#3b82f6' },
  { id: 'weather',  label: 'Weather',  glyph: '⛅',  tint: '#0ea5e9' },
  { id: 'stocks',   label: 'Stocks',   glyph: '📈',  tint: '#10b981' },
  { id: 'messages', label: 'Messages', glyph: '💬',  tint: '#22d3ee' },
  { id: 'bank',     label: 'Bank',     glyph: '💳',  tint: '#f5cb5c' },
  { id: 'camera',   label: 'Camera',   glyph: '📷',  tint: '#a78bfa' },
  { id: 'music',    label: 'Music',    glyph: '🎵',  tint: '#ef4444' },
];

const APP_BLURBS: Record<AppId, string> = {
  map: 'No saved waypoints. Open the world map for routing.',
  weather: '',
  stocks: '',
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

const phoneScrollCss = `
.phone-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.phone-scroll::-webkit-scrollbar { width: 4px; }
.phone-scroll::-webkit-scrollbar-track { background: transparent; }
.phone-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 2px; }
.phone-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
`;

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
  size = 46,
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
  date,
  money,
  onOpenApp,
}: {
  time: string;
  date: GameDate;
  money: number;
  onOpenApp: (id: AppId) => void;
}) {
  return (
    <>
      <div style={{ textAlign: 'center' }}>
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
            fontSize: 11,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 4,
            letterSpacing: 0.6,
          }}
        >
          {formatDate(date, { withYear: true })}
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
          Balance ${money.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 14,
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

// ─── Stocks app ────────────────────────────────────────────────────────────

const TREND_UP = '#10b981';
const TREND_DOWN = '#ef4444';

function formatPrice(p: number): string {
  return `$${p.toFixed(2)}`;
}

function changePct(points: number[]): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

function formatChangePct(pct: number): string {
  // Clamp tiny so saves don't render "-0.0%".
  if (Math.abs(pct) < 0.05) return '0.0%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function trendColorFor(points: number[]): string {
  if (points.length < 2) return tokens.color.textMuted;
  const first = points[0];
  const last = points[points.length - 1];
  if (last > first) return TREND_UP;
  if (last < first) return TREND_DOWN;
  return tokens.color.textMuted;
}

function Sparkline({
  points,
  width,
  height,
  color,
  strokeWidth = 1.5,
}: {
  points: number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
}) {
  if (points.length < 2) {
    // Single sample (fresh game / late MP join) — render a centered dot so
    // the slot doesn't collapse and the column alignment stays steady.
    return (
      <svg width={width} height={height} aria-hidden>
        <circle cx={width / 2} cy={height / 2} r={1.5} fill={color} />
      </svg>
    );
  }
  let min = points[0];
  let max = points[0];
  for (const p of points) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const x = (i * stepX).toFixed(2);
    const y = (height - ((points[i] - min) / range) * height).toFixed(2);
    d += `${i === 0 ? 'M' : 'L'}${x},${y} `;
  }
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d.trim()} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}

function StockListRow({
  stock,
  price,
  history,
  subtitle,
  onSelect,
}: {
  stock: Stock;
  price: number;
  history: number[];
  // Second line on the left column. Defaults to the company name; portfolio
  // rows replace this with "N sh · avg $X" since the player already knows
  // the company they bought.
  subtitle: string;
  onSelect: () => void;
}) {
  // List sparkline samples the most recent 24 ticks (~12 in-game hours) for
  // visual density at small width; the change% uses the full HISTORY_LEN
  // window so the headline number lines up with the detail view.
  const sparkPoints = useMemo(() => history.slice(-24), [history]);
  const pct = changePct(history.slice(-HISTORY_LEN));
  const color = trendColorFor(history.slice(-HISTORY_LEN));
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 6px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        border: 'none',
        color: 'inherit',
        fontFamily: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
          }}
        >
          {stock.symbol}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'rgba(255,255,255,0.6)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </span>
      </div>
      <Sparkline points={sparkPoints} width={56} height={20} color={color} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 56 }}>
        <span
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatPrice(price)}
        </span>
        <span
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 9,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatChangePct(pct)}
        </span>
      </div>
    </button>
  );
}

function StocksList({
  prices,
  onSelect,
}: {
  prices: Record<string, { price: number; history: number[] }>;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {STOCKS.map((stock) => {
        const entry = prices[stock.symbol];
        if (!entry) return null;
        return (
          <StockListRow
            key={stock.symbol}
            stock={stock}
            price={entry.price}
            history={entry.history}
            subtitle={stock.name}
            onSelect={() => onSelect(stock.symbol)}
          />
        );
      })}
    </div>
  );
}

function PortfolioList({
  prices,
  holdings,
  onSelect,
}: {
  prices: Record<string, { price: number; history: number[] }>;
  holdings: Record<string, { shares: number; avgCost: number }>;
  onSelect: (symbol: string) => void;
}) {
  const held = STOCKS.filter((s) => (holdings[s.symbol]?.shares ?? 0) > 0);
  if (held.length === 0) {
    return (
      <div
        style={{
          marginTop: 14,
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(255,255,255,0.65)',
          padding: '0 8px',
        }}
      >
        No holdings yet. Browse the All tab to buy.
      </div>
    );
  }
  let totalValue = 0;
  let totalCost = 0;
  for (const stock of held) {
    const h = holdings[stock.symbol];
    const p = prices[stock.symbol]?.price ?? stock.basePrice;
    totalValue += h.shares * p;
    totalCost += h.shares * h.avgCost;
  }
  const pl = totalValue - totalCost;
  const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;
  const plColor = pl > 0 ? TREND_UP : pl < 0 ? TREND_DOWN : tokens.color.textMuted;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '4px 6px 6px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontFamily: tokens.font.mono,
          fontSize: 10,
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.65)' }}>
          {held.length} pos · {formatPrice(totalValue)}
        </span>
        <span style={{ color: plColor, fontVariantNumeric: 'tabular-nums' }}>
          {pl >= 0 ? '+' : '−'}${Math.abs(pl).toFixed(2)} {formatChangePct(plPct)}
        </span>
      </div>
      {held.map((stock) => {
        const entry = prices[stock.symbol];
        if (!entry) return null;
        const h = holdings[stock.symbol];
        return (
          <StockListRow
            key={stock.symbol}
            stock={stock}
            price={entry.price}
            history={entry.history}
            subtitle={`${h.shares} sh · avg ${formatPrice(h.avgCost)}`}
            onSelect={() => onSelect(stock.symbol)}
          />
        );
      })}
    </div>
  );
}

function StocksTabToggle({
  view,
  onChange,
  portfolioCount,
}: {
  view: 'all' | 'portfolio';
  onChange: (next: 'all' | 'portfolio') => void;
  portfolioCount: number;
}) {
  const baseStyle: CSSProperties = {
    flex: 1,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    color: tokens.color.text,
    borderRadius: 6,
    padding: '4px 0',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const activeStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.35)',
    fontWeight: 600,
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <button
        type="button"
        style={{ ...baseStyle, ...(view === 'all' ? activeStyle : null) }}
        onClick={() => onChange('all')}
      >
        All
      </button>
      <button
        type="button"
        style={{ ...baseStyle, ...(view === 'portfolio' ? activeStyle : null) }}
        onClick={() => onChange('portfolio')}
      >
        Portfolio{portfolioCount > 0 ? ` (${portfolioCount})` : ''}
      </button>
    </div>
  );
}

function StepperButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '0 0 auto',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: tokens.color.text,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        minWidth: 22,
      }}
    >
      {label}
    </button>
  );
}

function TradeButton({
  label,
  onClick,
  disabled,
  tint,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: disabled ? 'rgba(255,255,255,0.06)' : tint,
        border: '1px solid rgba(255,255,255,0.18)',
        color: disabled ? 'rgba(255,255,255,0.4)' : '#0a0c10',
        borderRadius: 6,
        padding: '6px 0',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        letterSpacing: 0.4,
      }}
    >
      {label}
    </button>
  );
}

function StockDetail({
  symbol,
  onBackToList,
}: {
  symbol: string;
  onBackToList: () => void;
}) {
  const stock = STOCK_BY_SYMBOL[symbol];
  const entry = useGameStore((s) => s.stocks.prices[symbol]);
  const holding = useGameStore((s) => s.stocks.holdings[symbol]);
  const money = useGameStore((s) => s.player.money);
  const buyStock = useGameStore((s) => s.buyStock);
  const sellStock = useGameStore((s) => s.sellStock);
  const [qty, setQty] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stock vanished (shouldn't happen in normal play, but be safe).
  if (!stock || !entry) {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onBackToList}
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
        <p style={{ marginTop: 8, fontSize: 11 }}>Stock unavailable.</p>
      </div>
    );
  }

  const price = entry.price;
  const recent = entry.history.slice(-HISTORY_LEN);
  const pct = changePct(recent);
  const color = trendColorFor(recent);
  const shares = holding?.shares ?? 0;
  const avgCost = holding?.avgCost ?? 0;
  const plDollars = shares > 0 ? (price - avgCost) * shares : 0;
  const plPct = shares > 0 && avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
  const maxBuy = price > 0 ? Math.floor(money / price) : 0;
  const maxSell = shares;
  const buyDisabled = qty <= 0 || qty * price > money;
  const sellDisabled = qty <= 0 || qty > shares;

  const tryBuy = () => {
    const res = buyStock(symbol, qty);
    if (!res.ok) setErrorMsg(res.reason ?? 'buy failed');
    else setErrorMsg(null);
  };
  const trySell = () => {
    const res = sellStock(symbol, qty);
    if (!res.ok) setErrorMsg(res.reason ?? 'sell failed');
    else setErrorMsg(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onBackToList}
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
          ‹ List
        </button>
        <span style={{ fontFamily: tokens.font.mono, fontSize: 13, fontWeight: 700 }}>
          {stock.symbol}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{stock.sector}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600 }}>{stock.name}</div>
      <p
        style={{
          margin: 0,
          fontSize: 10,
          lineHeight: 1.4,
          color: 'rgba(255,255,255,0.78)',
        }}
      >
        {stock.description}
      </p>

      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${color}55`,
          borderRadius: 8,
          padding: '8px 8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <Sparkline points={recent} width={180} height={56} color={color} strokeWidth={1.5} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 16,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatPrice(price)}
          </span>
          <span
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 11,
              color,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatChangePct(pct)} <span style={{ color: 'rgba(255,255,255,0.5)' }}>24h</span>
          </span>
        </div>
      </div>

      <div
        style={{
          fontFamily: tokens.font.mono,
          fontSize: 10,
          color: 'rgba(255,255,255,0.78)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {shares > 0 ? (
          <>
            <div>
              Holding: {shares} sh @ {formatPrice(avgCost)}
            </div>
            <div style={{ color: plDollars > 0 ? TREND_UP : plDollars < 0 ? TREND_DOWN : 'rgba(255,255,255,0.6)' }}>
              P/L: {plDollars >= 0 ? '+' : '−'}${Math.abs(plDollars).toFixed(2)} ({formatChangePct(plPct)})
            </div>
          </>
        ) : (
          <div>Holding: 0 sh</div>
        )}
        <div style={{ color: 'rgba(255,255,255,0.55)' }}>
          Cash: {formatPrice(money)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepperButton label="−" onClick={() => setQty((q) => Math.max(1, q - 1))} />
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: tokens.font.mono,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6,
            padding: '4px 0',
          }}
        >
          {qty}
        </div>
        <StepperButton label="+" onClick={() => setQty((q) => q + 1)} />
        <StepperButton
          label="MAX"
          onClick={() => {
            // Buy-mode default unless the player can sell more than they could
            // afford to buy — then prefer the sell-side max so MAX is useful
            // both ways. Cheap heuristic; the explicit Buy/Sell buttons
            // adjudicate the actual transaction.
            const target = maxSell > maxBuy ? maxSell : maxBuy;
            if (target > 0) setQty(target);
          }}
          disabled={maxBuy <= 0 && maxSell <= 0}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <TradeButton label="Buy" tint={TREND_UP} onClick={tryBuy} disabled={buyDisabled} />
        <TradeButton label="Sell" tint={TREND_DOWN} onClick={trySell} disabled={sellDisabled} />
      </div>
      {errorMsg && (
        <div style={{ fontSize: 10, color: TREND_DOWN, fontFamily: tokens.font.mono }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}

function StocksAppBody() {
  const prices = useGameStore((s) => s.stocks.prices);
  const holdings = useGameStore((s) => s.stocks.holdings);
  const [selected, setSelected] = useState<string | null>(null);
  // Tab is preserved while drilling into detail and back, so the player
  // stays where they were.
  const [view, setView] = useState<'all' | 'portfolio'>('all');
  const portfolioCount = useMemo(
    () =>
      Object.values(holdings).reduce(
        (n, h) => (h.shares > 0 ? n + 1 : n),
        0,
      ),
    [holdings],
  );
  if (selected) {
    return <StockDetail symbol={selected} onBackToList={() => setSelected(null)} />;
  }
  return (
    <>
      <StocksTabToggle view={view} onChange={setView} portfolioCount={portfolioCount} />
      {view === 'all' ? (
        <StocksList prices={prices} onSelect={setSelected} />
      ) : (
        <PortfolioList prices={prices} holdings={holdings} onSelect={setSelected} />
      )}
    </>
  );
}

function AppScreen({
  app,
  worldSeconds,
  onBack,
}: {
  app: (typeof APPS)[number];
  worldSeconds: number;
  onBack: () => void;
}) {
  return (
    <>
      <AppHeader label={app.label} onBack={onBack} />
      {app.id === 'weather' ? (
        <WeatherAppBody worldSeconds={worldSeconds} />
      ) : app.id === 'stocks' ? (
        <StocksAppBody />
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
  const worldYear = useGameStore((s) => s.time.year);
  const worldMonth = useGameStore((s) => s.time.month);
  const worldDay = useGameStore((s) => s.time.day);
  const date: GameDate = { year: worldYear, month: worldMonth, day: worldDay };
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
      {/* Webkit/Chromium scrollbar styling — Firefox honors `scrollbar-*`
          props inline, but Webkit needs a CSS rule. The phone is the only
          place we want this thin translucent style, so the rule is scoped
          via the .phone-scroll class. */}
      <style>{phoneScrollCss}</style>
      <div
        style={{
          width: 248,
          height: 440,
          borderRadius: 28,
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
            gap: 8,
            overflow: 'hidden',
          }}
        >
          <StatusBar time={time} />
          {/* Scrollable body — apps with content longer than the screen
              (weather forecast, eventually messages, etc.) get a vertical
              scroll inside the screen frame rather than overflowing the
              phone. Padding-right reserves a small gutter for the thumb so
              content doesn't shift width when the scrollbar appears. */}
          <div
            className="phone-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              paddingRight: 4,
              marginRight: -4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {app ? (
              <AppScreen
                app={app}
                worldSeconds={worldSeconds}
                onBack={() => setActiveApp(null)}
              />
            ) : (
              <HomeScreen time={time} date={date} money={money} onOpenApp={setActiveApp} />
            )}
          </div>
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
              flexShrink: 0,
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
