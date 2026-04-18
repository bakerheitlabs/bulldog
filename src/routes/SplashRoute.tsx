import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SPLASH_MS = 2000;

export default function SplashRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    const go = () => navigate('/menu', { replace: true });
    const timer = window.setTimeout(go, SPLASH_MS);
    const skip = () => {
      window.clearTimeout(timer);
      go();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('mousedown', skip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('mousedown', skip);
    };
  }, [navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        background: 'radial-gradient(circle at 50% 40%, #1a1a1a 0%, #000 80%)',
      }}
    >
      <div style={{ fontSize: 96, letterSpacing: 4, fontWeight: 800, color: '#f5cb5c' }}>BULLDOG</div>
      <div style={{ fontSize: 14, opacity: 0.6 }}>Press any key to continue</div>
    </div>
  );
}
