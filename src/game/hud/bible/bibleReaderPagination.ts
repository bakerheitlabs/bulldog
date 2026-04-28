import type { BibleBook, BibleVerseLocation } from '@/game/world/bibleData';

const PAGE_WEIGHT_LIMIT = 1380;

export type BibleReaderPageEntry =
  | {
      kind: 'heading';
      book: string;
      chapter: number;
      continued: boolean;
      location: BibleVerseLocation;
    }
  | {
      kind: 'verse';
      text: string;
      location: BibleVerseLocation;
    };

export type BibleReaderPage = {
  key: string;
  entries: BibleReaderPageEntry[];
  start: BibleVerseLocation | null;
};

export function buildBibleReaderPages(books: BibleBook[]): BibleReaderPage[] {
  const pages: BibleReaderPage[] = [];
  let entries: BibleReaderPageEntry[] = [];
  let weight = 0;

  const commitPage = () => {
    if (entries.length === 0) return;
    const start = entries[0]?.location ?? null;
    pages.push({
      key: `page-${pages.length}`,
      entries,
      start,
    });
    entries = [];
    weight = 0;
  };

  const addHeading = (
    book: string,
    chapter: number,
    location: BibleVerseLocation,
    continued: boolean,
  ) => {
    entries.push({ kind: 'heading', book, chapter, continued, location });
    weight += continued ? 70 : 95;
  };

  for (let bookIndex = 0; bookIndex < books.length; bookIndex++) {
    const book = books[bookIndex];
    for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex++) {
      const chapterLocation = { bookIndex, chapterIndex, verse: 1 };
      const firstVerse = book.chapters[chapterIndex][0] ?? '';
      const chapterStartWeight = 95 + getVerseWeight(firstVerse);
      if (entries.length > 0 && weight + chapterStartWeight > PAGE_WEIGHT_LIMIT) {
        commitPage();
      }
      addHeading(book.book, chapterIndex + 1, chapterLocation, false);

      for (let verseIndex = 0; verseIndex < book.chapters[chapterIndex].length; verseIndex++) {
        const text = book.chapters[chapterIndex][verseIndex];
        const location = { bookIndex, chapterIndex, verse: verseIndex + 1 };
        const verseWeight = getVerseWeight(text);
        const pageAlreadyHasVerse = entries.some((entry) => entry.kind === 'verse');

        if (pageAlreadyHasVerse && weight + verseWeight > PAGE_WEIGHT_LIMIT) {
          commitPage();
          addHeading(book.book, chapterIndex + 1, location, true);
        }

        entries.push({ kind: 'verse', text, location });
        weight += verseWeight;
      }
    }
  }

  commitPage();
  return pages;
}

export function findChapterPageIndex(
  pages: BibleReaderPage[],
  bookIndex: number,
  chapterIndex: number,
) {
  const headingPage = pages.findIndex((page) =>
    page.entries.some(
      (entry) =>
        entry.kind === 'heading' &&
        !entry.continued &&
        entry.location.bookIndex === bookIndex &&
        entry.location.chapterIndex === chapterIndex,
    ),
  );
  if (headingPage >= 0) return headingPage;
  const contentPage = pages.findIndex((page) =>
    page.entries.some(
      (entry) =>
        entry.location.bookIndex === bookIndex &&
        entry.location.chapterIndex === chapterIndex,
    ),
  );
  return contentPage >= 0 ? contentPage : null;
}

export function findVersePageIndex(
  pages: BibleReaderPage[],
  bookIndex: number,
  chapterIndex: number,
  verse: number,
) {
  const pageIndex = pages.findIndex((page) =>
    page.entries.some(
      (entry) =>
        entry.kind === 'verse' &&
        entry.location.bookIndex === bookIndex &&
        entry.location.chapterIndex === chapterIndex &&
        entry.location.verse === verse,
    ),
  );
  return pageIndex >= 0 ? pageIndex : null;
}

export function toSpreadStart(index: number) {
  return Math.max(0, index - (index % 2));
}

export function locationsMatch(
  a: BibleVerseLocation | null,
  b: BibleVerseLocation,
) {
  return (
    a?.bookIndex === b.bookIndex &&
    a.chapterIndex === b.chapterIndex &&
    a.verse === b.verse
  );
}

function getVerseWeight(text: string) {
  return text.length + Math.ceil(text.length / 54) * 36 + 44;
}
