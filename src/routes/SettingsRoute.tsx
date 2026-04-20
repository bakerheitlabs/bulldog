import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '@/state/settingsStore';
import { tokens } from '@/ui/tokens';

const CONTROLS: { section: string; binds: { keys: string[]; label: string }[] }[] = [
  {
    section: 'On Foot',
    binds: [
      { keys: ['WASD'], label: 'Move' },
      { keys: ['Shift'], label: 'Sprint' },
      { keys: ['LMB'], label: 'Shoot' },
      { keys: ['F'], label: 'Punch' },
      { keys: ['R'], label: 'Reload' },
      { keys: ['Q'], label: 'Weapon Wheel (hold)' },
      { keys: ['E'], label: 'Interact' },
    ],
  },
  {
    section: 'In Vehicle',
    binds: [
      { keys: ['W', 'S'], label: 'Throttle / Brake' },
      { keys: ['A', 'D'], label: 'Steer' },
      { keys: ['E'], label: 'Exit Vehicle' },
    ],
  },
  {
    section: 'System',
    binds: [{ keys: ['Esc'], label: 'Pause / Close Menu' }],
  },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 360 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ opacity: 0.7 }}>{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export default function SettingsRoute() {
  const navigate = useNavigate();
  const { mouseSensitivity, fov, masterVolume, setMouseSensitivity, setFov, setMasterVolume } =
    useSettingsStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 24,
        background: 'linear-gradient(180deg, #0c0c10 0%, #1a1a22 100%)',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700 }}>Settings</div>
      <Slider
        label="Mouse Sensitivity"
        value={mouseSensitivity}
        min={0.1}
        max={3}
        step={0.05}
        onChange={setMouseSensitivity}
      />
      <Slider
        label="Field of View"
        value={fov}
        min={50}
        max={100}
        step={1}
        onChange={setFov}
        format={(n) => `${n.toFixed(0)}°`}
      />
      <Slider
        label="Master Volume"
        value={masterVolume}
        min={0}
        max={1}
        step={0.05}
        onChange={setMasterVolume}
        format={(n) => `${Math.round(n * 100)}%`}
      />

      <div
        style={{
          width: 420,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.md,
          background: tokens.color.panel,
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2.4,
            textTransform: 'uppercase',
            color: tokens.color.accent,
            fontFamily: tokens.font.mono,
          }}
        >
          Controls
        </div>
        {CONTROLS.map((group) => (
          <div key={group.section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: tokens.color.textMuted,
                fontFamily: tokens.font.mono,
              }}
            >
              {group.section}
            </div>
            {group.binds.map((b) => (
              <div
                key={b.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 13,
                  color: tokens.color.text,
                }}
              >
                <span>{b.label}</span>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {b.keys.map((k) => (
                    <span
                      key={k}
                      style={{
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
                        letterSpacing: 0.5,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button
        style={{
          padding: '10px 22px',
          background: '#1f1f1f',
          color: '#eee',
          border: '1px solid #333',
          borderRadius: 6,
          cursor: 'pointer',
        }}
        onClick={() => navigate('/menu')}
      >
        Back
      </button>
    </div>
  );
}
