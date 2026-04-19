import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSaveStore } from '@/state/saveStore';
import CityMap from './CityMap';

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const navigate = useNavigate();
  const save = useSaveStore((s) => s.save);
  const [screen, setScreen] = useState<'menu' | 'map'>('menu');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
      }}
    >
      <div
        style={{
          background: '#15151a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 24,
          width: screen === 'map' ? 'min(980px, calc(100vw - 32px))' : 'min(340px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          color: '#eee',
        }}
      >
        {screen === 'menu' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Paused</div>
            <button
              style={btn}
              onClick={onResume}
            >
              Resume
            </button>
            <button
              style={btn}
              onClick={() => setScreen('map')}
            >
              Map
            </button>
            <button
              style={btn}
              onClick={() => save('auto', 'Auto Save')}
            >
              Save (auto slot)
            </button>
            <button
              style={btn}
              onClick={() => navigate('/menu')}
            >
              Main Menu
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700 }}>City Map</div>
              <button
                style={{ ...btn, width: 'auto' }}
                onClick={() => setScreen('menu')}
              >
                Back
              </button>
            </div>
            <CityMap variant="pause" />
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#aaa' }}>
              Drag to pan. Scroll to zoom. Yellow marker is your current position.
              G marks the gun store, R marks the range, P marks parking lots.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '10px 16px',
  background: '#1f1f25',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  width: '100%',
};
