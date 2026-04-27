import { useNavigate } from 'react-router-dom';
import { useGameStore } from '@/state/gameStore';

const buttonStyle: React.CSSProperties = {
  padding: '14px 28px',
  fontSize: 18,
  background: '#1f1f1f',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 6,
  cursor: 'pointer',
  minWidth: 220,
};

const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  cursor: 'not-allowed',
  opacity: 0.4,
};

export default function MenuRoute() {
  const navigate = useNavigate();
  const reset = useGameStore((s) => s.reset);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 18,
        background: 'linear-gradient(180deg, #0c0c10 0%, #1a1a22 100%)',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800, color: '#f5cb5c', marginBottom: 24 }}>BULLDOG</div>
      <button
        style={buttonStyle}
        onClick={() => {
          reset();
          navigate('/game');
        }}
      >
        New Game
      </button>
      <button style={disabledStyle} disabled title="Coming soon">
        Load Game
      </button>
      <button style={buttonStyle} onClick={() => navigate('/multiplayer')}>
        Multiplayer
      </button>
      <button style={buttonStyle} onClick={() => navigate('/settings')}>
        Settings
      </button>
    </div>
  );
}
