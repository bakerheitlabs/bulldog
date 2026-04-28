import type { Verse } from '@/game/world/bibleVerses';

export default function BibleVersePopup({
  verse,
  onClose,
}: {
  verse: Verse;
  onClose: () => void;
}) {
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
          padding: 28,
          width: 'min(560px, 86vw)',
          maxHeight: '70vh',
          overflowY: 'auto',
          color: '#eee',
        }}
      >
        <div
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 18,
            lineHeight: 1.55,
            fontStyle: 'italic',
            color: '#f3ecd6',
            whiteSpace: 'pre-wrap',
          }}
        >
          “{verse.text}”
        </div>
        <div
          style={{
            marginTop: 16,
            fontWeight: 700,
            color: '#caa055',
            letterSpacing: 0.4,
          }}
        >
          — {verse.reference}
        </div>
        <div style={{ marginTop: 20, textAlign: 'right' }}>
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
