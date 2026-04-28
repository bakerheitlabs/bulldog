// Stock-market metadata + pure simulation helpers. The store owns the live
// price/history state; this module is purely data and math so it stays easy
// to test and re-seed deterministically from a save.

export type StockSymbol = string;

export type Stock = {
  symbol: StockSymbol;
  name: string;
  description: string;
  sector: string;
  basePrice: number;
  // Per-tick stddev of the geometric random walk. Tier conventions:
  //   low  ~ 0.008 — blue-chip, slow drift
  //   mid  ~ 0.018 — average everyday volatility
  //   high ~ 0.035 — speculative / event-sensitive
  volatility: number;
};

const VOL_LOW = 0.008;
const VOL_MID = 0.018;
const VOL_HIGH = 0.035;

// Detail sparkline shows ~24 in-game hours; with a 30-min tick that's 48 points.
export const HISTORY_LEN = 48;
// Time between price updates, in in-world seconds (= 30 in-game minutes).
export const TICK_INTERVAL_GAME_SEC = 1800;
// Hard floor so a long downtrend can't drive prices to zero or negative.
export const PRICE_FLOOR = 0.5;

export const STOCKS: readonly Stock[] = [
  {
    symbol: 'FLRD',
    name: 'Floord Motors',
    description:
      'Bulldog-built sedans, pickups, and the long-running Enforcer line. Steady fleet sales, modest growth.',
    sector: 'Automotive',
    basePrice: 74,
    volatility: VOL_LOW,
  },
  {
    symbol: 'KMRA',
    name: 'Kamura Skylines',
    description:
      'Domestic carrier flying out of Bulldog International. Margins live and die by jet fuel and headlines.',
    sector: 'Aviation',
    basePrice: 42,
    volatility: VOL_HIGH,
  },
  {
    symbol: 'CNTR',
    name: 'Centerline Bank',
    description:
      'Old-money commercial bank. Branches on every block downtown. Pays a sleepy dividend.',
    sector: 'Finance',
    basePrice: 58,
    volatility: VOL_LOW,
  },
  {
    symbol: 'PLZ',
    name: 'Pelican Pizza',
    description:
      'Fast-casual chain with bright neon storefronts city-wide. Famously open late, famously inconsistent.',
    sector: 'Food & Retail',
    basePrice: 19,
    volatility: VOL_MID,
  },
  {
    symbol: 'NCRP',
    name: 'Nimbus Cloud',
    description:
      'Hosting and developer services. Powers half the city’s websites and most of its outages.',
    sector: 'Technology',
    basePrice: 128,
    volatility: VOL_MID,
  },
  {
    symbol: 'GRDX',
    name: 'Guardex Defense',
    description:
      'Private security gear, riot kit, and unmarked black helicopters. Order book depends on the news.',
    sector: 'Defense',
    basePrice: 96,
    volatility: VOL_HIGH,
  },
  {
    symbol: 'OILX',
    name: 'Oilex Energy',
    description:
      'Refineries on the harbor and tanker traffic in the bay. The pump price barometer of Bulldog.',
    sector: 'Energy',
    basePrice: 63,
    volatility: VOL_LOW,
  },
  {
    symbol: 'CPHN',
    name: 'Cellphonics',
    description:
      'Maker of the phone in your pocket. Each new model is either the future or a recall waiting to happen.',
    sector: 'Consumer Tech',
    basePrice: 87,
    volatility: VOL_MID,
  },
  {
    symbol: 'REDM',
    name: 'Red Moon Studios',
    description:
      'Action-movie studio with a flagship lot in West Bulldog. One blockbuster from a moonshot quarter.',
    sector: 'Media',
    basePrice: 33,
    volatility: VOL_HIGH,
  },
  {
    symbol: 'BLDP',
    name: 'Bulldog Properties',
    description:
      'REIT with the marina, half of downtown, and rumors of more. Patient money, patient returns.',
    sector: 'Real Estate',
    basePrice: 111,
    volatility: VOL_LOW,
  },
  {
    symbol: 'ZNTH',
    name: 'Zenith Pharma',
    description:
      'Trial-stage biotech. Pipeline news moves the stock more than earnings ever will.',
    sector: 'Pharmaceutical',
    basePrice: 54,
    volatility: VOL_HIGH,
  },
  {
    symbol: 'STRM',
    name: 'Stream Telecom',
    description:
      'Phone, internet, and the towers on every rooftop. Subscriber churn keeps the analysts up at night.',
    sector: 'Telecom',
    basePrice: 46,
    volatility: VOL_MID,
  },
  {
    symbol: 'HLOS',
    name: 'Helios Solar',
    description:
      'Rooftop and utility-scale solar. Subsidies giveth; commodity-grade panels taketh away.',
    sector: 'Energy',
    basePrice: 22,
    volatility: VOL_HIGH,
  },
  {
    symbol: 'KRGR',
    name: 'Kruger Foods',
    description:
      'Neighborhood grocery banner. Recession-proof basket, razor-thin margins.',
    sector: 'Grocery',
    basePrice: 38,
    volatility: VOL_LOW,
  },
  {
    symbol: 'ARRO',
    name: 'Arrow Logistics',
    description:
      'Same-day shipping out of three depots. Trucks you see all over the bridges and tunnels.',
    sector: 'Shipping',
    basePrice: 69,
    volatility: VOL_MID,
  },
];

export const STOCK_BY_SYMBOL: Record<StockSymbol, Stock> = Object.fromEntries(
  STOCKS.map((s) => [s.symbol, s]),
);

// One mulberry32 step. We persist `state` directly (a 32-bit int) instead of
// a closure so saves round-trip the RNG cleanly.
export function advanceRng(state: number): { state: number; value: number } {
  let s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  return { state: s, value };
}

// Box-Muller. Consumes two uniforms; returns a single standard normal sample.
// Caller is responsible for advancing rngState by both uniforms.
export function standardNormalFromState(state: number): { state: number; value: number } {
  let { state: s1, value: u1 } = advanceRng(state);
  // Avoid log(0).
  if (u1 < 1e-12) u1 = 1e-12;
  const { state: s2, value: u2 } = advanceRng(s1);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return { state: s2, value: z };
}

// Geometric step: price *= 1 + vol * z; clamp to PRICE_FLOOR. Returns the
// new price and the advanced RNG state.
export function randomWalkStep(
  price: number,
  volatility: number,
  rngState: number,
): { state: number; price: number } {
  const { state, value: z } = standardNormalFromState(rngState);
  const next = price * (1 + volatility * z);
  return { state, price: Math.max(PRICE_FLOOR, next) };
}
