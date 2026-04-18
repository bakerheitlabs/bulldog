import { useNavigate } from 'react-router-dom';
import { useSaveStore } from '@/state/saveStore';

export default function PauseMenu({ onResume }: { onResume: () => void }) {
  const navigate = useNavigate();
  const save = useSaveStore((s) => s.save);

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
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 280,
          color: '#eee',
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
};
