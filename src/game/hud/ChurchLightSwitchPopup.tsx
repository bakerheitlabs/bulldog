import { useChurchLightingStore } from '@/game/world/churchLighting';
import { tokens } from '@/ui/tokens';

export default function ChurchLightSwitchPopup({ onClose }: { onClose: () => void }) {
  const dimmer = useChurchLightingStore((s) => s.dimmer);
  const setDimmer = useChurchLightingStore((s) => s.setDimmer);
  const pct = Math.round(dimmer * 100);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: tokens.color.panelSolid,
          border: `1px solid ${tokens.color.borderStrong}`,
          borderRadius: tokens.radius.lg,
          padding: 28,
          width: 'min(420px, 86vw)',
          color: tokens.color.text,
          fontFamily: tokens.font.display,
          boxShadow: tokens.shadow.panel,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: tokens.color.textMuted,
            marginBottom: 6,
          }}
        >
          Church Lights
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.4 }}>
            Dimmer
          </div>
          <div
            style={{
              fontFamily: tokens.font.mono,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 20,
              color: tokens.color.accent,
            }}
          >
            {pct}%
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setDimmer(Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: tokens.color.accent }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: tokens.font.mono,
            fontSize: 10,
            letterSpacing: 1.2,
            color: tokens.color.textMuted,
            marginTop: 4,
          }}
        >
          <span>OFF</span>
          <span>FULL</span>
        </div>
        <div style={{ marginTop: 22, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: '#1f1f25',
              color: tokens.color.text,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.sm,
              cursor: 'pointer',
              fontFamily: tokens.font.display,
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
