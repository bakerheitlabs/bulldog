import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '@/state/settingsStore';

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
