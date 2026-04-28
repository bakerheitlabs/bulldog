// Pure Gregorian date helpers for the in-world clock. Pair with
// `time.seconds` (0..86399) in gameStore — these helpers only handle
// year/month/day; midnight wrap is owned by the store.

export type GameDate = { year: number; month: number; day: number };

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Sunday=0..Saturday=6, matching Sakamoto's algorithm output below.
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12:
      return 31;
    case 4: case 6: case 9: case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      throw new Error(`Invalid month: ${month}`);
  }
}

// Advance forward by N whole days, rolling month and year boundaries.
// Days < 0 is unsupported (the world clock only moves forward); callers
// should guard. Iterative — fine even for multi-year jumps.
export function advanceDate(date: GameDate, days: number): GameDate {
  if (days <= 0) return date;
  let { year, month, day } = date;
  let remaining = Math.floor(days);
  while (remaining > 0) {
    const inMonth = daysInMonth(year, month);
    const room = inMonth - day;
    if (remaining <= room) {
      day += remaining;
      remaining = 0;
    } else {
      // Step to the first of next month, consuming `room + 1` days.
      remaining -= room + 1;
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return { year, month, day };
}

// Sakamoto's algorithm. Returns 0=Sun..6=Sat.
const SAKAMOTO_T = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export function dayOfWeek({ year, month, day }: GameDate): number {
  const y = month < 3 ? year - 1 : year;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      SAKAMOTO_T[month - 1] +
      day) %
    7
  );
}

export function dayName(date: GameDate): string {
  return DAY_NAMES_SHORT[dayOfWeek(date)];
}

export function monthName(date: GameDate): string {
  return MONTH_NAMES_SHORT[date.month - 1];
}

// Default:                           "Sat, Oct 31"
// { withYear: true }:                "Sat, Oct 31, 2020"
// { short: true }:                   "Sat 10/31"
// { short: true, withYear: true }:   "Sat 10/31/2020"
export function formatDate(
  date: GameDate,
  opts: { withYear?: boolean; short?: boolean } = {},
): string {
  const dow = dayName(date);
  if (opts.short) {
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    return opts.withYear
      ? `${dow} ${m}/${d}/${date.year}`
      : `${dow} ${m}/${d}`;
  }
  const base = `${dow}, ${monthName(date)} ${date.day}`;
  return opts.withYear ? `${base}, ${date.year}` : base;
}

// Validate a {y,m,d} triple (e.g. for dev console parsing). Rejects
// 2021-02-29, 2020-13-01, 2020-04-31, etc.
export function isValidDate(date: GameDate): boolean {
  const { year, month, day } = date;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= daysInMonth(year, month);
}
