// Lazy loader for the bundled WEB. The file lives in public/data/ and is
// served by Vite at /data/bible-web.json. Verse text is public domain (World
// English Bible, a modern-English revision of the ASV — chosen over KJV for
// readability). The first call kicks off a single fetch — concurrent callers
// reuse the same in-flight promise, and once parsed the flat index is cached
// for the rest of the session.

type RawBook = { book: string; chapters: string[][] };
type FlatVerse = { book: string; chapter: number; verse: number; text: string };

export type Verse = { text: string; reference: string };

let flatCache: FlatVerse[] | null = null;
let inFlight: Promise<FlatVerse[]> | null = null;

async function loadFlat(): Promise<FlatVerse[]> {
  if (flatCache) return flatCache;
  if (inFlight) return inFlight;
  inFlight = fetch('/data/bible-web.json')
    .then((r) => {
      if (!r.ok) throw new Error(`bible fetch ${r.status}`);
      return r.json() as Promise<RawBook[]>;
    })
    .then((books) => {
      const flat: FlatVerse[] = [];
      for (const b of books) {
        for (let c = 0; c < b.chapters.length; c++) {
          const chap = b.chapters[c];
          for (let v = 0; v < chap.length; v++) {
            flat.push({ book: b.book, chapter: c + 1, verse: v + 1, text: chap[v] });
          }
        }
      }
      flatCache = flat;
      return flat;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function pickRandomVerse(): Promise<Verse> {
  const flat = await loadFlat();
  const v = flat[Math.floor(Math.random() * flat.length)];
  return {
    text: v.text,
    reference: `${v.book} ${v.chapter}:${v.verse}`,
  };
}
