// Lazy loader for the bundled WEB. The file lives in public/data/ and is
// served by Vite at /data/bible-web.json. Verse text is public domain (World
// English Bible, a modern-English revision of the ASV — chosen over KJV for
// readability). The first call kicks off a single fetch — concurrent callers
// reuse the same in-flight promise, and once parsed the flat index is cached
// for the rest of the session.

export type BibleBook = { book: string; chapters: string[][] };
export type BibleVerseLocation = { bookIndex: number; chapterIndex: number; verse: number };
export type BibleVerse = { text: string; reference: string };

type RawBook = BibleBook;
type IndexedBibleVerse = { book: string; chapter: number; verse: number; text: string };

let booksCache: BibleBook[] | null = null;
let verseIndexCache: IndexedBibleVerse[] | null = null;
let booksInFlight: Promise<BibleBook[]> | null = null;
let verseIndexInFlight: Promise<IndexedBibleVerse[]> | null = null;

export async function loadBibleBooks(): Promise<BibleBook[]> {
  if (booksCache) return booksCache;
  if (booksInFlight) return booksInFlight;
  booksInFlight = fetch('/data/bible-web.json')
    .then((r) => {
      if (!r.ok) throw new Error(`bible fetch ${r.status}`);
      return r.json() as Promise<RawBook[]>;
    })
    .then((books) => {
      booksCache = books;
      return books;
    })
    .finally(() => {
      booksInFlight = null;
    });
  return booksInFlight;
}

async function loadVerseIndex(): Promise<IndexedBibleVerse[]> {
  if (verseIndexCache) return verseIndexCache;
  if (verseIndexInFlight) return verseIndexInFlight;
  verseIndexInFlight = loadBibleBooks()
    .then((books) => {
      const verses: IndexedBibleVerse[] = [];
      for (const b of books) {
        for (let c = 0; c < b.chapters.length; c++) {
          const chap = b.chapters[c];
          for (let v = 0; v < chap.length; v++) {
            verses.push({ book: b.book, chapter: c + 1, verse: v + 1, text: chap[v] });
          }
        }
      }
      verseIndexCache = verses;
      return verses;
    })
    .finally(() => {
      verseIndexInFlight = null;
    });
  return verseIndexInFlight;
}

export async function pickRandomBibleVerse(): Promise<BibleVerse> {
  const verses = await loadVerseIndex();
  const v = verses[Math.floor(Math.random() * verses.length)];
  return {
    text: v.text,
    reference: `${v.book} ${v.chapter}:${v.verse}`,
  };
}

export function findBibleVerseLocation(
  books: BibleBook[],
  reference: string,
): BibleVerseLocation | null {
  const match = /^(.+) (\d+):(\d+)$/.exec(reference);
  if (!match) return null;
  const [, bookName, chapter, verse] = match;
  const bookIndex = books.findIndex((book) => book.book === bookName);
  if (bookIndex < 0) return null;
  const chapterIndex = Number(chapter) - 1;
  if (!books[bookIndex]?.chapters[chapterIndex]) return null;
  return { bookIndex, chapterIndex, verse: Number(verse) };
}
