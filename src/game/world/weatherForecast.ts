import { WEATHER_TYPES, type WeatherType } from '@/save/schema';

const SECONDS_PER_DAY = 24 * 3600;

// Variable-duration "spells" replace the old fixed 3-hour slots. Each spell
// is a single weather type held for some random number of in-game hours.
// Bucket weights bias toward short spells but leave room for the occasional
// 6-8h downpour, so rain/storm can actually settle in for a long stretch.
//
// Weights are taken verbatim from the design spec (60 / 20 / 10) and
// renormalized internally — they don't have to sum to 100.
export const DURATION_BUCKETS: ReadonlyArray<{
  minHours: number;
  maxHours: number;
  weight: number;
}> = [
  { minHours: 1, maxHours: 3, weight: 60 },
  { minHours: 4, maxHours: 6, weight: 20 },
  { minHours: 6, maxHours: 8, weight: 10 },
];

const DURATION_WEIGHT_TOTAL = DURATION_BUCKETS.reduce((a, b) => a + b.weight, 0);

const TYPE_WEIGHTS: Record<WeatherType, number> = {
  sunny: 50,
  cloudy: 30,
  rain: 15,
  storm: 5,
};

const TYPE_WEIGHT_TOTAL = Object.values(TYPE_WEIGHTS).reduce((a, b) => a + b, 0);

export type WeatherSpell = {
  type: WeatherType;
  durationSec: number;
};

function pickDurationSec(rng: () => number): number {
  let r = rng() * DURATION_WEIGHT_TOTAL;
  for (const b of DURATION_BUCKETS) {
    if (r < b.weight) {
      const span = b.maxHours - b.minHours;
      const hours = b.minHours + rng() * span;
      return hours * 3600;
    }
    r -= b.weight;
  }
  return DURATION_BUCKETS[0].minHours * 3600;
}

function pickType(rng: () => number, avoid?: WeatherType): WeatherType {
  // Avoiding the previous type cuts immediate repeats, which felt unnatural
  // when two back-to-back rain spells effectively stretched into one long run
  // that didn't follow the bucket distribution.
  const total = avoid != null ? TYPE_WEIGHT_TOTAL - TYPE_WEIGHTS[avoid] : TYPE_WEIGHT_TOTAL;
  let r = rng() * total;
  for (const t of WEATHER_TYPES) {
    if (t === avoid) continue;
    if (r < TYPE_WEIGHTS[t]) return t;
    r -= TYPE_WEIGHTS[t];
  }
  return 'sunny';
}

export function makeSpell(rng: () => number, prev?: WeatherType): WeatherSpell {
  return {
    type: pickType(rng, prev),
    durationSec: pickDurationSec(rng),
  };
}

// Mulberry32 — a small, high-quality 32-bit PRNG. We use it both for
// deterministic seeding (tests, save migration) and as the workhorse when the
// caller wants non-determinism (just seed from `Math.random()`).
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function buildSchedule(
  rng: () => number,
  count: number,
  seedType?: WeatherType,
): { current: WeatherSpell; upcoming: WeatherSpell[] } {
  // If the caller supplies a seed type (e.g. the value just loaded from a
  // save) we honor it for the current spell — the player should still see
  // whatever weather was active when they saved — but we randomize the
  // duration so the spell ends at a realistic time.
  const current: WeatherSpell = seedType
    ? { type: seedType, durationSec: pickDurationSec(rng) }
    : makeSpell(rng);
  const upcoming: WeatherSpell[] = [];
  let prev = current.type;
  for (let i = 0; i < count; i++) {
    const s = makeSpell(rng, prev);
    upcoming.push(s);
    prev = s.type;
  }
  return { current, upcoming };
}

export type ForecastEntry = {
  index: number;
  type: WeatherType;
  // World-clock seconds at which this entry begins/ends. Wraps modulo
  // SECONDS_PER_DAY — formatHour() in the UI handles display.
  startSeconds: number;
  endSeconds: number;
  durationSec: number;
  // Only set on the current spell. Lets the UI render "X h remaining".
  remainingSec: number | null;
};

export function buildForecast(
  worldSeconds: number,
  current: WeatherSpell,
  elapsedSec: number,
  upcoming: WeatherSpell[],
  count: number,
): ForecastEntry[] {
  const out: ForecastEntry[] = [];
  const remaining = Math.max(0, current.durationSec - elapsedSec);
  // The current spell's "start" is in the past — back it out from now.
  const currentStart = worldSeconds - elapsedSec;
  const currentEnd = worldSeconds + remaining;
  out.push({
    index: 0,
    type: current.type,
    startSeconds: ((currentStart % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY,
    endSeconds: ((currentEnd % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY,
    durationSec: current.durationSec,
    remainingSec: remaining,
  });
  let cursor = currentEnd;
  const limit = Math.min(count - 1, upcoming.length);
  for (let i = 0; i < limit; i++) {
    const spell = upcoming[i];
    const startWrapped = ((cursor % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    const end = cursor + spell.durationSec;
    const endWrapped = ((end % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    out.push({
      index: i + 1,
      type: spell.type,
      startSeconds: startWrapped,
      endSeconds: endWrapped,
      durationSec: spell.durationSec,
      remainingSec: null,
    });
    cursor = end;
  }
  return out;
}

