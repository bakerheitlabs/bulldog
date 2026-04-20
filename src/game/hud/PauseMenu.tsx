import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSaveStore } from '@/state/saveStore';
import { tokens } from '@/ui/tokens';
import CityMap from './CityMap';

type MenuItem = {
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
};

function MenuRow({
  item,
  active,
  onFocus,
}: {
  item: MenuItem;
  active: boolean;
  onFocus: () => void;
}) {
  return (
    <button
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={item.onClick}
      style={{
        position: 'relative',
        background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${tokens.color.border}`,
        color: item.variant === 'danger' ? tokens.color.hpLow : tokens.color.text,
        padding: '14px 18px 14px 22px',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: tokens.font.display,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: 0.4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: `background ${tokens.motion.fast}ms linear`,
      }}
    >
      <span>{item.label}</span>
      {item.hint && (
        <span
          style={{
            fontSize: 11,
            fontFamily: tokens.font.mono,
            color: tokens.color.textMuted,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {item.hint}
        </span>
      )}
    </button>
  );
}

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const navigate = useNavigate();
  const save = useSaveStore((s) => s.save);
  const [screen, setScreen] = useState<'menu' | 'map'>('menu');
  const [activeIdx, setActiveIdx] = useState(0);

  const items: MenuItem[] = [
    { label: 'Resume', hint: 'Esc', onClick: onResume, variant: 'primary' },
    { label: 'Map', hint: '↵', onClick: () => setScreen('map') },
    { label: 'Save Game', hint: 'Auto', onClick: () => save('auto', 'Auto Save') },
    { label: 'Main Menu', onClick: () => navigate('/menu'), variant: 'danger' },
  ];

  const panelStyle: CSSProperties = {
    background: tokens.color.panelStrong,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.lg,
    boxShadow: tokens.shadow.panel,
    color: tokens.color.text,
    overflow: 'hidden',
    animation: 'bulldog-pause-in 180ms cubic-bezier(0.2,0.8,0.2,1)',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(4,5,8,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
        fontFamily: tokens.font.display,
      }}
    >
      <style>{`
        @keyframes bulldog-pause-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {screen === 'menu' ? (
        <div
          style={{
            ...panelStyle,
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <div
            style={{
              padding: '20px 22px 16px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${tokens.color.border}`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: tokens.color.accent,
                  fontFamily: tokens.font.mono,
                  marginBottom: 4,
                }}
              >
                Paused
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Game Menu</div>
            </div>
            <button
              onClick={onResume}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.sm,
                width: 28,
                height: 28,
                color: tokens.color.textMuted,
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* accent bar that slides to the active row */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 3,
                height: 50,
                background: tokens.color.accent,
                transform: `translateY(${activeIdx * 51}px)`,
                transition: `transform ${tokens.motion.fast}ms ${tokens.motion.easeOut}`,
                boxShadow: tokens.shadow.glow,
              }}
            />
            {items.map((it, i) => (
              <MenuRow
                key={it.label}
                item={it}
                active={activeIdx === i}
                onFocus={() => setActiveIdx(i)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            ...panelStyle,
            width: 'min(980px, calc(100vw - 32px))',
            maxHeight: 'calc(100vh - 32px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${tokens.color.border}`,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: tokens.color.accent,
                  fontFamily: tokens.font.mono,
                  marginBottom: 4,
                }}
              >
                Navigation
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>City Map</div>
            </div>
            <button
              onClick={() => setScreen('menu')}
              style={{
                background: 'transparent',
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.sm,
                padding: '6px 14px',
                color: tokens.color.text,
                cursor: 'pointer',
                fontFamily: tokens.font.mono,
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              ← Back
            </button>
          </div>
          <div style={{ padding: 18, overflow: 'auto' }}>
            <CityMap variant="pause" />
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: tokens.color.textMuted,
                marginTop: 12,
                fontFamily: tokens.font.mono,
              }}
            >
              Drag to pan · Scroll to zoom · Gold marker is your position ·
              <span style={{ color: tokens.color.accent }}> G</span> gun store ·
              <span style={{ color: tokens.color.accent }}> R</span> range ·
              <span style={{ color: tokens.color.accent }}> P</span> parking
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
