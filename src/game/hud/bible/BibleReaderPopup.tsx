import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  findBibleVerseLocation,
  loadBibleBooks,
  pickRandomBibleVerse,
  type BibleBook,
  type BibleVerseLocation,
} from '@/game/world/bibleData';
import {
  buildBibleReaderPages,
  findChapterPageIndex,
  findVersePageIndex,
  locationsMatch,
  toSpreadStart,
  type BibleReaderPage,
} from './bibleReaderPagination';

const PAGE_TURN_MS = 520;

export default function BibleReaderPopup({
  onClose,
}: {
  onClose: () => void;
}) {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [controlSelection, setControlSelection] = useState({
    bookIndex: 0,
    chapterIndex: 0,
  });
  const [highlightVerse, setHighlightVerse] = useState<BibleVerseLocation | null>(null);
  const [status, setStatus] = useState('Loading Bible...');
  const [pageTurn, setPageTurn] = useState<{
    direction: 'next' | 'previous';
    page: BibleReaderPage;
  } | null>(null);
  const turnTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBibleBooks()
      .then((loadedBooks) => {
        if (cancelled) return;
        setBooks(loadedBooks);
        setStatus('');
      })
      .catch((err) => {
        console.error('bible load failed', err);
        if (!cancelled) setStatus('Bible failed to load.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (turnTimerRef.current != null) window.clearTimeout(turnTimerRef.current);
    };
  }, []);

  const pages = useMemo(() => buildBibleReaderPages(books), [books]);
  const leftPage = pages[pageIndex] ?? null;
  const rightPage = pages[pageIndex + 1] ?? null;
  const previousPageIndex = pageIndex > 0 ? Math.max(0, pageIndex - 2) : null;
  const nextPageIndex = pageIndex + 2 < pages.length ? pageIndex + 2 : null;

  const chooseChapter = useCallback((bookIndex: number, chapterIndex: number) => {
    setControlSelection({ bookIndex, chapterIndex });
    setHighlightVerse(null);
  }, []);

  const turnToPage = useCallback((targetPageIndex: number | null, direction: 'next' | 'previous') => {
    if (targetPageIndex == null || pageTurn) return;
    const animatedPage = direction === 'next' ? rightPage : leftPage;
    if (!animatedPage) return;
    setPageTurn({ direction, page: animatedPage });
    setPageIndex(targetPageIndex);
    const targetStart = pages[targetPageIndex]?.start;
    if (targetStart) {
      setControlSelection({
        bookIndex: targetStart.bookIndex,
        chapterIndex: targetStart.chapterIndex,
      });
    }
    setHighlightVerse(null);
    if (turnTimerRef.current != null) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(() => {
      setPageTurn(null);
      turnTimerRef.current = null;
    }, PAGE_TURN_MS);
  }, [leftPage, pageTurn, pages, rightPage]);

  const jumpToChapter = useCallback((bookIndex: number, chapterIndex: number) => {
    if (turnTimerRef.current != null) {
      window.clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
    }
    setPageTurn(null);
    chooseChapter(bookIndex, chapterIndex);
    const targetPage = findChapterPageIndex(pages, bookIndex, chapterIndex);
    if (targetPage != null) setPageIndex(toSpreadStart(targetPage));
  }, [chooseChapter, pages]);

  const showRandomVerse = useCallback(() => {
    setStatus('Finding a random verse...');
    pickRandomBibleVerse()
      .then((verse) => {
        const location = findBibleVerseLocation(books, verse.reference);
        if (!location) {
          setStatus(verse.reference);
          return;
        }
        const targetPage = findVersePageIndex(
          pages,
          location.bookIndex,
          location.chapterIndex,
          location.verse,
        );
        if (targetPage != null) {
          setPageIndex(toSpreadStart(targetPage));
        }
        setControlSelection({
          bookIndex: location.bookIndex,
          chapterIndex: location.chapterIndex,
        });
        setHighlightVerse(location);
        setStatus(`Random verse: ${verse.reference}`);
      })
      .catch((err) => {
        console.error('random bible verse failed', err);
        setStatus('Random verse failed to load.');
      });
  }, [books, pages]);

  const selectedBook = books[controlSelection.bookIndex];

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
          background: '#1d1712',
          border: '1px solid #4a3523',
          borderRadius: 8,
          padding: 20,
          width: 'min(980px, 92vw)',
          maxHeight: '84vh',
          color: '#f6ecda',
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button style={buttonStyle} onClick={showRandomVerse} disabled={books.length === 0}>
              Random Verse
            </button>
            <select
              value={controlSelection.bookIndex}
              disabled={books.length === 0}
              onChange={(e) => jumpToChapter(Number(e.target.value), 0)}
              style={selectStyle}
            >
              {books.map((book, index) => (
                <option key={book.book} value={index}>
                  {book.book}
                </option>
              ))}
            </select>
            <select
              value={controlSelection.chapterIndex}
              disabled={!selectedBook}
              onChange={(e) =>
                jumpToChapter(controlSelection.bookIndex, Number(e.target.value))
              }
              style={selectStyle}
            >
              {selectedBook?.chapters.map((_, index) => (
                <option key={index} value={index}>
                  Chapter {index + 1}
                </option>
              ))}
            </select>
          </div>
          <button style={buttonStyle} onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ minHeight: 22, color: '#d8b970', marginBottom: 10 }}>
          {status}
        </div>
        <style>{pageTurnCss}</style>
        <div style={bookStyle}>
          <BiblePage page={leftPage} highlightedVerse={highlightVerse} />
          <BiblePage page={rightPage} highlightedVerse={highlightVerse} />
          {pageTurn && (
            <div
              aria-hidden="true"
              className={`bible-page-turn bible-page-turn-${pageTurn.direction}`}
              style={{
                ...turningPageStyle,
                left: pageTurn.direction === 'next' ? '50%' : 0,
                transformOrigin:
                  pageTurn.direction === 'next' ? 'left center' : 'right center',
              }}
            >
              <BiblePage page={pageTurn.page} highlightedVerse={null} />
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 14,
          }}
        >
          <button
            style={buttonStyle}
            onClick={() => turnToPage(previousPageIndex, 'previous')}
            disabled={previousPageIndex == null || pageTurn !== null}
          >
            Previous Page
          </button>
          <div style={pageCountStyle}>
            {pages.length > 0
              ? `Pages ${pageIndex + 1}-${Math.min(pageIndex + 2, pages.length)} of ${pages.length}`
              : ''}
          </div>
          <button
            style={buttonStyle}
            onClick={() => turnToPage(nextPageIndex, 'next')}
            disabled={nextPageIndex == null || pageTurn !== null}
          >
            Next Page
          </button>
        </div>
      </div>
    </div>
  );
}

function BiblePage({
  page,
  highlightedVerse,
}: {
  page: BibleReaderPage | null;
  highlightedVerse: BibleVerseLocation | null;
}) {
  if (!page) {
    return <div style={pageStyle} />;
  }
  return (
    <div style={pageStyle}>
      <div style={{ fontFamily: 'Georgia, serif', lineHeight: 1.5, color: '#2c2117' }}>
        {page.entries.map((entry, index) => {
          if (entry.kind === 'heading') {
            return (
              <div
                key={`${page.key}-heading-${index}`}
                style={{
                  color: '#6f4d2a',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  margin: index === 0 ? '0 0 12px' : '18px 0 10px',
                }}
              >
                {entry.book} {entry.chapter}
              </div>
            );
          }
          const highlighted = locationsMatch(highlightedVerse, entry.location);
          return (
            <p
              key={`${page.key}-verse-${index}`}
              style={{
                margin: '0 0 7px',
                background: highlighted ? 'rgba(206, 164, 74, 0.35)' : 'transparent',
                borderRadius: 4,
                padding: highlighted ? '2px 4px' : '2px 0',
              }}
            >
              <sup style={{ color: '#8f7048', fontWeight: 700, marginRight: 4 }}>
                {entry.location.verse}
              </sup>
              {entry.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '7px 12px',
  background: '#2c211a',
  color: '#f6ecda',
  border: '1px solid #6f4d2a',
  borderRadius: 4,
  cursor: 'pointer',
} satisfies CSSProperties;

const selectStyle = {
  padding: '7px 10px',
  background: '#f2e2c5',
  color: '#2c2117',
  border: '1px solid #8f7048',
  borderRadius: 4,
} satisfies CSSProperties;

const pageCountStyle = {
  color: '#d8b970',
  alignSelf: 'center',
  fontSize: 14,
} satisfies CSSProperties;

const bookStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  position: 'relative',
  perspective: 1400,
  background: '#5e3d22',
  border: '1px solid #8a6540',
  borderRadius: 6,
  overflow: 'hidden',
  height: 'min(58vh, 570px)',
} satisfies CSSProperties;

const pageStyle = {
  height: '100%',
  overflow: 'hidden',
  padding: '22px 26px',
  background: '#f1e4c9',
  borderRight: '1px solid rgba(76, 49, 24, 0.35)',
  boxShadow: 'inset 0 0 32px rgba(105, 77, 43, 0.16)',
  fontSize: 16,
  boxSizing: 'border-box',
} satisfies CSSProperties;

const turningPageStyle = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '50%',
  zIndex: 2,
  overflow: 'hidden',
  backfaceVisibility: 'hidden',
  transformStyle: 'preserve-3d',
  boxShadow: '0 12px 28px rgba(36, 24, 13, 0.34)',
} satisfies CSSProperties;

const pageTurnCss = `
@keyframes bibleTurnNext {
  0% { transform: rotateY(0deg); filter: brightness(1); }
  42% { filter: brightness(0.9); }
  100% { transform: rotateY(-178deg); filter: brightness(0.78); }
}

@keyframes bibleTurnPrevious {
  0% { transform: rotateY(0deg); filter: brightness(1); }
  42% { filter: brightness(0.9); }
  100% { transform: rotateY(178deg); filter: brightness(0.78); }
}

.bible-page-turn-next {
  animation: bibleTurnNext ${PAGE_TURN_MS}ms cubic-bezier(0.2, 0.72, 0.21, 1) forwards;
}

.bible-page-turn-previous {
  animation: bibleTurnPrevious ${PAGE_TURN_MS}ms cubic-bezier(0.2, 0.72, 0.21, 1) forwards;
}
`;
