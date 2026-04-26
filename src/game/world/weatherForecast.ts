import { useEffect } from 'react';
import { WEATHER_TYPES, type WeatherType } from '@/save/schema';
import { useGameStore } from '@/state/gameStore';

// Each forecast slot lasts 3 in-game hours. With world time running at 30×
// real time that's ~6 real minutes per slot — slow enough to feel like
// weather, fast enough that a forecast is meaningful within a play session.
export const FORECAST_SLOT_SECONDS = 3 * 3600;

const WEIGHTS: Record<WeatherType, number> = {
  sunny: 50,
  cloudy: 30,
  rain: 15,
  storm: 5,
};

const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// Mulberry32-style integer hash. Pure — same slot index always returns the
// same weather, so the forecast and the actual weather are derived from one
// source of truth.
function hash32(n: number): number {
  let x = (n >>> 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

export function weatherForSlot(slotIndex: number): WeatherType {
  const r = hash32(slotIndex) / 0x100000000;
  let cumulative = 0;
  for (const t of WEATHER_TYPES) {
    cumulative += WEIGHTS[t] / WEIGHT_TOTAL;
    if (r < cumulative) return t;
  }
  return 'sunny';
}

export function currentSlot(seconds: number): number {
  return Math.floor(seconds / FORECAST_SLOT_SECONDS);
}

export type ForecastEntry = {
  slotIndex: number;
  startSeconds: number;
  type: WeatherType;
};

export function forecast(seconds: number, slots: number): ForecastEntry[] {
  const start = currentSlot(seconds);
  const out: ForecastEntry[] = [];
  for (let i = 0; i < slots; i++) {
    const slotIndex = start + i;
    out.push({
      slotIndex,
      startSeconds: slotIndex * FORECAST_SLOT_SECONDS,
      type: weatherForSlot(slotIndex),
    });
  }
  return out;
}

// Drives the world's actual weather to match the forecast. Subscribed via a
// memoized selector so this only re-runs when the slot rolls over (~6 real
// minutes), not every frame.
export function useWeatherScheduler() {
  const slotIndex = useGameStore((s) => currentSlot(s.time.seconds));
  useEffect(() => {
    const expected = weatherForSlot(slotIndex);
    if (useGameStore.getState().weather.type !== expected) {
      useGameStore.getState().setWeather(expected);
    }
  }, [slotIndex]);
}
