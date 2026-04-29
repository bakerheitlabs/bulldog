import { useGameStore } from '@/state/gameStore';
import { advanceDate } from '@/game/world/gameDate';

const HOUR_OPTIONS = [1, 4, 8, 12];

export default function SleepModal({ onClose }: { onClose: () => void }) {
  // Select primitives only — returning a fresh `{year, month, day}` object
  // here would re-fire the subscription each render under zustand's default
  // reference-equality comparator and loop forever.
  const setWorldTimeSeconds = useGameStore((s) => s.setWorldTimeSeconds);
  const setWorldDate = useGameStore((s) => s.setWorldDate);

  const sleep = (hours: number) => {
    const SECONDS_PER_DAY = 86400;
    const t = useGameStore.getState().time;
    const total = t.seconds + hours * 3600;
    const days = Math.floor(total / SECONDS_PER_DAY);
    const wrapped = total % SECONDS_PER_DAY;
    if (days > 0)
      setWorldDate(advanceDate({ year: t.year, month: t.month, day: t.day }, days));
    setWorldTimeSeconds(wrapped);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
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
          background: '#15151a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 24,
          minWidth: 360,
          color: '#eee',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Get some rest</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
          Skip ahead in the day. Time will resume when you wake up.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => sleep(h)}
              style={{
                flex: 1,
                minWidth: 70,
                padding: '10px 14px',
                background: '#26303d',
                color: '#fff',
                border: '1px solid #3a6df0',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {h} {h === 1 ? 'hr' : 'hrs'}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button
            style={{
              padding: '6px 14px',
              background: '#1f1f25',
              color: '#eee',
              border: '1px solid #333',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
