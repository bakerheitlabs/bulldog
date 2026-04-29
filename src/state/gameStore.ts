import { create } from 'zustand';
import { WEAPONS } from '@/game/weapons/weapons';
import type {
  GameStoreSnapshot,
  HotelRoomState,
  HotelRoomTier,
  WeaponId,
  WeatherType,
} from '@/save/schema';
import {
  buildSchedule,
  mulberry32,
  type WeatherSpell,
} from '@/game/world/weatherForecast';
import { advanceDate, type GameDate } from '@/game/world/gameDate';
import {
  STOCKS,
  HISTORY_LEN,
  TICK_INTERVAL_GAME_SEC,
  PRICE_FLOOR,
  randomWalkStep,
} from '@/game/world/stocks';

const PLAYER_START_POS: [number, number, number] = [0, 1, 0];
const STARTING_MONEY = 1500;
const STARTING_HEALTH = 100;

// In-memory weather schedule. Not part of the saved snapshot — only
// `weather.type` persists across saves. On load we rehydrate this from the
// saved type and a fresh random duration so play resumes coherently without
// bumping the save schema.
type WeatherSchedule = {
  current: WeatherSpell;
  // Real (not in-game) seconds elapsed in the current spell, scaled by
  // WORLD_TIME_RATE before we accumulate. Tracking elapsed separately means
  // dev-console time skips don't accidentally fast-forward weather.
  elapsedSec: number;
  upcoming: WeatherSpell[];
};

type GameState = GameStoreSnapshot & {
  godMode: boolean;
  weatherSchedule: WeatherSchedule;
  reset: () => void;
  snapshot: () => GameStoreSnapshot;
  load: (snap: GameStoreSnapshot) => void;
  setPlayerTransform: (position: [number, number, number], rotationY: number) => void;
  damagePlayer: (amount: number) => void;
  addMoney: (delta: number) => void;
  addWeapon: (id: WeaponId) => void;
  setEquipped: (id: WeaponId | null) => void;
  consumeAmmo: (id: WeaponId, n: number) => void;
  reloadWeapon: (id: WeaponId) => void;
  recordTargetHit: (targetId: string) => void;
  tickPlaytime: (deltaMs: number) => void;
  bumpHeat: (amount: number) => void;
  clearWanted: () => void;
  tickWanted: (deltaMs: number) => void;
  tickWorldTime: (deltaMs: number) => void;
  setWorldTimeSeconds: (seconds: number) => void;
  setWorldDate: (date: GameDate) => void;
  // Stocks: host-side price simulation and player trades.
  tickStocks: (gameSeconds: number) => void;
  buyStock: (symbol: string, shares: number) => { ok: boolean; reason?: string };
  sellStock: (symbol: string, shares: number) => { ok: boolean; reason?: string };
  // MP-client path: replace prices from a host snapshot, appending to history
  // only when the price actually changed.
  setStockPrices: (next: Record<string, number>) => void;
  // External hook for in-game events to nudge a single stock (e.g. plane crash
  // → applyStockEvent('KMRA', 0.85) for an instant -15%).
  applyStockEvent: (symbol: string, multiplier: number) => void;
  setWeather: (type: WeatherType) => void;
  // Replace the current spell with a custom override. Upcoming spells are
  // left intact so the regular schedule resumes once the override expires.
  overrideWeather: (type: WeatherType, durationSec: number) => void;
  // Re-roll the entire schedule, optionally pinning the first spell's type.
  regenerateWeatherSchedule: (opts?: { seedType?: WeatherType }) => void;
  // Advance elapsed time within the current spell; rolls over when the
  // duration is met. Pass *in-game* seconds (i.e. real seconds × world rate).
  tickWeather: (gameSeconds: number) => void;
  setGodMode: (on: boolean) => void;
  setHealth: (hp: number) => void;
  setAmmoReserve: (id: WeaponId, reserve: number) => void;
  setWantedStars: (stars: number) => void;
  // Hotel room rental: sets `properties.hotelRoom` with an expiry computed
  // as `advanceDate(currentDate, days)`. Deducts `days * costPerDay` up
  // front. Returns ok/reason like the trade actions.
  rentHotelRoom: (
    roomId: HotelRoomTier,
    days: number,
    costPerDay: number,
  ) => { ok: boolean; reason?: string };
  clearHotelRoom: () => void;
  setHotelStash: (stash: HotelRoomState['stash']) => void;
};

export const HEAT_MAX = 100;
export const HEAT_PER_STAR = HEAT_MAX / 5;
const HEAT_DECAY_PER_SEC = 3;
const HEAT_COOLDOWN_MS = 4000;

// World time runs at 30× real time: 1 in-game hour = 2 real minutes,
// 24 in-game hours = 48 real minutes.
export const WORLD_TIME_RATE = 30;
export const SECONDS_PER_DAY = 24 * 3600;
const WORLD_TIME_START = 8 * 3600;
// Halloween 2020 — Saturday. Set as the in-world starting date.
export const WORLD_DATE_START: GameDate = { year: 2020, month: 10, day: 31 };

function wrapSeconds(s: number): number {
  const n = s % SECONDS_PER_DAY;
  return n < 0 ? n + SECONDS_PER_DAY : n;
}

export function starsFromHeat(heat: number): number {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / HEAT_PER_STAR));
}

// Number of upcoming spells we keep buffered. The forecast UI renders ~6.
const UPCOMING_BUFFER = 8;

function freshSchedule(seedType?: WeatherType): WeatherSchedule {
  const rng = mulberry32((Math.random() * 0x7fffffff) >>> 0);
  const { current, upcoming } = buildSchedule(rng, UPCOMING_BUFFER, seedType);
  return { current, upcoming, elapsedSec: 0 };
}

function initialStocks(): GameStoreSnapshot['stocks'] {
  const prices: Record<string, { price: number; history: number[] }> = {};
  for (const s of STOCKS) {
    prices[s.symbol] = { price: s.basePrice, history: [s.basePrice] };
  }
  return {
    prices,
    holdings: {},
    elapsedSinceLastTick: 0,
    rngState: (Math.random() * 0x7fffffff) >>> 0,
  };
}

function initialSnapshot(): GameStoreSnapshot {
  return {
    player: {
      position: [...PLAYER_START_POS] as [number, number, number],
      rotationY: 0,
      health: STARTING_HEALTH,
      money: STARTING_MONEY,
    },
    inventory: {
      weapons: [],
      equipped: null,
      ammo: {},
    },
    world: { destroyedTargets: [] },
    wanted: { heat: 0, lastCrimeAt: 0 },
    time: { seconds: WORLD_TIME_START, ...WORLD_DATE_START },
    weather: { type: 'sunny' },
    stocks: initialStocks(),
    properties: { hotelRoom: null },
    meta: { startedAt: Date.now(), playtimeMs: 0 },
  };
}

// Pure derived selector: is there a hotel rental whose expiry is still in
// the future relative to the current world date? Comparing year/month/day
// in lex order avoids dragging in a Date object for what is just a triple.
export function hotelRoomActive(s: Pick<GameStoreSnapshot, 'time' | 'properties'>): boolean {
  const room = s.properties.hotelRoom;
  if (!room) return false;
  const t = s.time;
  const e = room.expires;
  if (t.year !== e.year) return t.year < e.year;
  if (t.month !== e.month) return t.month < e.month;
  return t.day < e.day;
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialSnapshot(),
  godMode: false,
  weatherSchedule: freshSchedule('sunny'),
  reset: () =>
    set({ ...initialSnapshot(), godMode: false, weatherSchedule: freshSchedule('sunny') }),
  snapshot: () => {
    const s = get();
    return {
      player: { ...s.player, position: [...s.player.position] as [number, number, number] },
      inventory: {
        weapons: [...s.inventory.weapons],
        equipped: s.inventory.equipped,
        ammo: Object.fromEntries(
          Object.entries(s.inventory.ammo).map(([k, v]) => [k, { ...(v as any) }]),
        ) as GameStoreSnapshot['inventory']['ammo'],
      },
      world: { destroyedTargets: [...s.world.destroyedTargets] },
      wanted: { ...s.wanted },
      time: { ...s.time },
      weather: { ...s.weather },
      stocks: {
        prices: Object.fromEntries(
          Object.entries(s.stocks.prices).map(([k, v]) => [
            k,
            { price: v.price, history: [...v.history] },
          ]),
        ),
        holdings: Object.fromEntries(
          Object.entries(s.stocks.holdings).map(([k, v]) => [k, { ...v }]),
        ),
        elapsedSinceLastTick: s.stocks.elapsedSinceLastTick,
        rngState: s.stocks.rngState,
      },
      properties: {
        hotelRoom: s.properties.hotelRoom
          ? {
              roomId: s.properties.hotelRoom.roomId,
              expires: { ...s.properties.hotelRoom.expires },
              stash: {
                weapons: [...s.properties.hotelRoom.stash.weapons],
                cash: s.properties.hotelRoom.stash.cash,
              },
            }
          : null,
      },
      meta: { ...s.meta },
    };
  },
  load: (snap) =>
    set({ ...snap, weatherSchedule: freshSchedule(snap.weather.type) }),
  setPlayerTransform: (position, rotationY) =>
    set((s) => ({ player: { ...s.player, position, rotationY } })),
  damagePlayer: (amount) =>
    set((s) => {
      if (s.godMode) return {};
      return { player: { ...s.player, health: Math.max(0, s.player.health - amount) } };
    }),
  addMoney: (delta) => set((s) => ({ player: { ...s.player, money: s.player.money + delta } })),
  addWeapon: (id) =>
    set((s) => {
      if (s.inventory.weapons.includes(id)) return {};
      const def = WEAPONS[id];
      const ammo = {
        ...s.inventory.ammo,
        [id]: { magazine: def.magazine, reserve: def.magazine * 2 },
      };
      return {
        inventory: {
          weapons: [...s.inventory.weapons, id],
          equipped: s.inventory.equipped ?? id,
          ammo,
        },
      };
    }),
  setEquipped: (id) => set((s) => ({ inventory: { ...s.inventory, equipped: id } })),
  consumeAmmo: (id, n) =>
    set((s) => {
      if (s.godMode) return {};
      const cur = s.inventory.ammo[id];
      if (!cur) return {};
      return {
        inventory: {
          ...s.inventory,
          ammo: { ...s.inventory.ammo, [id]: { ...cur, magazine: Math.max(0, cur.magazine - n) } },
        },
      };
    }),
  reloadWeapon: (id) =>
    set((s) => {
      const cur = s.inventory.ammo[id];
      if (!cur) return {};
      const def = WEAPONS[id];
      const need = def.magazine - cur.magazine;
      const take = Math.min(need, cur.reserve);
      if (take <= 0) return {};
      return {
        inventory: {
          ...s.inventory,
          ammo: {
            ...s.inventory.ammo,
            [id]: { magazine: cur.magazine + take, reserve: cur.reserve - take },
          },
        },
      };
    }),
  recordTargetHit: (targetId) =>
    set((s) =>
      s.world.destroyedTargets.includes(targetId)
        ? {}
        : { world: { ...s.world, destroyedTargets: [...s.world.destroyedTargets, targetId] } },
    ),
  tickPlaytime: (deltaMs) => set((s) => ({ meta: { ...s.meta, playtimeMs: s.meta.playtimeMs + deltaMs } })),
  bumpHeat: (amount) =>
    set((s) => ({
      wanted: {
        heat: Math.min(HEAT_MAX, s.wanted.heat + amount),
        lastCrimeAt: Date.now(),
      },
    })),
  clearWanted: () => set({ wanted: { heat: 0, lastCrimeAt: 0 } }),
  tickWanted: (deltaMs) =>
    set((s) => {
      if (s.wanted.heat <= 0) return {};
      const sinceCrime = Date.now() - s.wanted.lastCrimeAt;
      if (sinceCrime < HEAT_COOLDOWN_MS) return {};
      const next = Math.max(0, s.wanted.heat - (HEAT_DECAY_PER_SEC * deltaMs) / 1000);
      if (next === s.wanted.heat) return {};
      return { wanted: { ...s.wanted, heat: next } };
    }),
  tickWorldTime: (deltaMs) =>
    set((s) => {
      const raw = s.time.seconds + (deltaMs / 1000) * WORLD_TIME_RATE;
      const daysAdvanced = Math.floor(raw / SECONDS_PER_DAY);
      const seconds = wrapSeconds(raw);
      if (daysAdvanced <= 0) return { time: { ...s.time, seconds } };
      const next = advanceDate(
        { year: s.time.year, month: s.time.month, day: s.time.day },
        daysAdvanced,
      );
      return { time: { seconds, ...next } };
    }),
  setWorldTimeSeconds: (seconds) =>
    set((s) => ({ time: { ...s.time, seconds: wrapSeconds(seconds) } })),
  setWorldDate: (date) =>
    set((s) => ({ time: { ...s.time, year: date.year, month: date.month, day: date.day } })),
  tickStocks: (gameSeconds) =>
    set((s) => {
      if (gameSeconds <= 0) return {};
      let elapsed = s.stocks.elapsedSinceLastTick + gameSeconds;
      // Drain loop — a long tab-defocus or pause should advance multiple
      // ticks rather than dropping them, mirroring tickWeather.
      if (elapsed < TICK_INTERVAL_GAME_SEC) {
        return { stocks: { ...s.stocks, elapsedSinceLastTick: elapsed } };
      }
      let rngState = s.stocks.rngState;
      // Clone prices so we mutate a fresh map; histories are arrays we extend.
      const prices: Record<string, { price: number; history: number[] }> = {};
      for (const [sym, entry] of Object.entries(s.stocks.prices)) {
        prices[sym] = { price: entry.price, history: [...entry.history] };
      }
      while (elapsed >= TICK_INTERVAL_GAME_SEC) {
        elapsed -= TICK_INTERVAL_GAME_SEC;
        for (const stock of STOCKS) {
          const cur = prices[stock.symbol];
          if (!cur) continue;
          const step = randomWalkStep(cur.price, stock.volatility, rngState);
          rngState = step.state;
          cur.price = step.price;
          cur.history.push(step.price);
          if (cur.history.length > HISTORY_LEN) {
            cur.history.splice(0, cur.history.length - HISTORY_LEN);
          }
        }
      }
      return {
        stocks: {
          ...s.stocks,
          prices,
          rngState,
          elapsedSinceLastTick: elapsed,
        },
      };
    }),
  buyStock: (symbol, shares) => {
    if (!Number.isInteger(shares) || shares <= 0) {
      return { ok: false, reason: 'shares must be a positive integer' };
    }
    const s = get();
    const entry = s.stocks.prices[symbol];
    if (!entry) return { ok: false, reason: `unknown symbol: ${symbol}` };
    const cost = entry.price * shares;
    if (s.player.money < cost) return { ok: false, reason: 'insufficient funds' };
    const cur = s.stocks.holdings[symbol] ?? { shares: 0, avgCost: 0 };
    const total = cur.shares + shares;
    const avgCost = (cur.avgCost * cur.shares + entry.price * shares) / total;
    set({
      player: { ...s.player, money: s.player.money - cost },
      stocks: {
        ...s.stocks,
        holdings: { ...s.stocks.holdings, [symbol]: { shares: total, avgCost } },
      },
    });
    return { ok: true };
  },
  sellStock: (symbol, shares) => {
    if (!Number.isInteger(shares) || shares <= 0) {
      return { ok: false, reason: 'shares must be a positive integer' };
    }
    const s = get();
    const entry = s.stocks.prices[symbol];
    if (!entry) return { ok: false, reason: `unknown symbol: ${symbol}` };
    const cur = s.stocks.holdings[symbol];
    if (!cur || cur.shares < shares) {
      return { ok: false, reason: 'not enough shares' };
    }
    const proceeds = entry.price * shares;
    const remaining = cur.shares - shares;
    // Hard-zero the entry on a full sell so callers can stop checking
    // shares > 0 before reading avgCost.
    const nextHolding = remaining === 0 ? { shares: 0, avgCost: 0 } : { shares: remaining, avgCost: cur.avgCost };
    set({
      player: { ...s.player, money: s.player.money + proceeds },
      stocks: {
        ...s.stocks,
        holdings: { ...s.stocks.holdings, [symbol]: nextHolding },
      },
    });
    return { ok: true };
  },
  setStockPrices: (next) =>
    set((s) => {
      const prices: Record<string, { price: number; history: number[] }> = {};
      let changed = false;
      for (const [sym, entry] of Object.entries(s.stocks.prices)) {
        const incoming = next[sym];
        if (incoming == null || incoming === entry.price) {
          prices[sym] = entry;
          continue;
        }
        const history = [...entry.history, incoming];
        if (history.length > HISTORY_LEN) {
          history.splice(0, history.length - HISTORY_LEN);
        }
        prices[sym] = { price: incoming, history };
        changed = true;
      }
      if (!changed) return {};
      return { stocks: { ...s.stocks, prices } };
    }),
  applyStockEvent: (symbol, multiplier) =>
    set((s) => {
      const entry = s.stocks.prices[symbol];
      if (!entry || !Number.isFinite(multiplier) || multiplier <= 0) return {};
      const next = Math.max(PRICE_FLOOR, entry.price * multiplier);
      const history = [...entry.history, next];
      if (history.length > HISTORY_LEN) {
        history.splice(0, history.length - HISTORY_LEN);
      }
      return {
        stocks: {
          ...s.stocks,
          prices: { ...s.stocks.prices, [symbol]: { price: next, history } },
        },
      };
    }),
  setWeather: (type) =>
    set((s) => {
      if (s.weather.type === type) return {};
      // Keep the schedule in sync so a forced type swap (e.g. from the
      // scheduler at spell rollover, or a save-load reconciling) doesn't leave
      // weather.type and weatherSchedule.current.type drifting apart.
      const cur = s.weatherSchedule.current;
      return {
        weather: { type },
        weatherSchedule:
          cur.type === type
            ? s.weatherSchedule
            : { ...s.weatherSchedule, current: { ...cur, type } },
      };
    }),
  overrideWeather: (type, durationSec) =>
    set((s) => ({
      weather: { type },
      weatherSchedule: {
        ...s.weatherSchedule,
        current: { type, durationSec: Math.max(60, durationSec) },
        elapsedSec: 0,
      },
    })),
  regenerateWeatherSchedule: (opts) =>
    set(() => {
      const next = freshSchedule(opts?.seedType);
      return { weather: { type: next.current.type }, weatherSchedule: next };
    }),
  tickWeather: (gameSeconds) =>
    set((s) => {
      if (gameSeconds <= 0) return {};
      const sched = s.weatherSchedule;
      let elapsed = sched.elapsedSec + gameSeconds;
      let current = sched.current;
      let upcoming = sched.upcoming;
      let typeChanged = false;
      // A single tick can theoretically span multiple spells (e.g. a long
      // pause + tab refocus). Drain the queue in a loop instead of assuming
      // one rollover per tick.
      while (elapsed >= current.durationSec) {
        elapsed -= current.durationSec;
        if (upcoming.length === 0) {
          // Schedule exhausted — re-roll a fresh tail. This is rare in normal
          // play (we keep an 8-spell buffer ≈ ~30 in-game hours of forecast),
          // but covers the edge case so we never get stuck on an ended spell.
          const refill = freshSchedule(current.type);
          current = refill.current;
          upcoming = refill.upcoming;
          typeChanged = true;
          continue;
        }
        const next = upcoming[0];
        // Top up the buffer so the forecast UI keeps a consistent depth of
        // slots ahead of "now". buildSchedule with count=1 returns one spell
        // in `upcoming`, with `current` pinned to the prev type so we get a
        // followup that respects the no-immediate-repeat rule.
        const rng = mulberry32((Math.random() * 0x7fffffff) >>> 0);
        const tail = buildSchedule(
          rng,
          1,
          upcoming[upcoming.length - 1]?.type ?? next.type,
        );
        upcoming = [...upcoming.slice(1), tail.upcoming[0]];
        if (next.type !== current.type) typeChanged = true;
        current = next;
      }
      return {
        weatherSchedule: { current, upcoming, elapsedSec: elapsed },
        ...(typeChanged ? { weather: { type: current.type } } : {}),
      };
    }),
  setGodMode: (on) => set({ godMode: on }),
  setHealth: (hp) =>
    set((s) => ({ player: { ...s.player, health: Math.max(0, Math.min(100, Math.round(hp))) } })),
  setAmmoReserve: (id, reserve) =>
    set((s) => {
      const def = WEAPONS[id];
      const r = Math.max(0, Math.round(reserve));
      const hasWeapon = s.inventory.weapons.includes(id);
      const cur = s.inventory.ammo[id];
      const nextEntry = cur
        ? { magazine: def.magazine, reserve: r }
        : { magazine: def.magazine, reserve: r };
      return {
        inventory: {
          weapons: hasWeapon ? s.inventory.weapons : [...s.inventory.weapons, id],
          equipped: s.inventory.equipped ?? id,
          ammo: { ...s.inventory.ammo, [id]: nextEntry },
        },
      };
    }),
  setWantedStars: (stars) =>
    set(() => {
      const n = Math.max(0, Math.min(5, Math.round(stars)));
      if (n === 0) return { wanted: { heat: 0, lastCrimeAt: 0 } };
      return { wanted: { heat: n * HEAT_PER_STAR, lastCrimeAt: Date.now() } };
    }),
  rentHotelRoom: (roomId, days, costPerDay) => {
    if (!Number.isInteger(days) || days <= 0) {
      return { ok: false, reason: 'days must be a positive integer' };
    }
    const cost = days * costPerDay;
    const s = get();
    if (s.player.money < cost) return { ok: false, reason: 'insufficient funds' };
    const today = { year: s.time.year, month: s.time.month, day: s.time.day };
    const expires = advanceDate(today, days);
    // Preserve any existing stash if the player re-rents — they keep what's
    // already inside the wardrobe across rentals. Fresh stash on first rent.
    const stash = s.properties.hotelRoom?.stash ?? { weapons: [], cash: 0 };
    set({
      player: { ...s.player, money: s.player.money - cost },
      properties: { hotelRoom: { roomId, expires, stash } },
    });
    return { ok: true };
  },
  clearHotelRoom: () => set({ properties: { hotelRoom: null } }),
  setHotelStash: (stash) =>
    set((s) => {
      const room = s.properties.hotelRoom;
      if (!room) return {};
      return {
        properties: {
          hotelRoom: {
            ...room,
            stash: {
              weapons: [...stash.weapons],
              cash: stash.cash,
            },
          },
        },
      };
    }),
}));
