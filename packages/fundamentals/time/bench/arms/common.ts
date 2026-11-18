/** Shared fixtures and the operation interface every arm implements (all ISO string in, ISO string out). */

export const ZONE = 'Europe/Prague'
export const DATES = ['2026-11-18', '2026-01-31', '2024-02-29', '2026-12-31', '2026-03-29', '2026-10-25', '2025-06-15', '2027-03-01'] as const
export const MONTH_ENDS = ['2026-01-31', '2024-01-31', '2026-03-31', '2026-05-31', '2024-02-29', '2026-08-31', '2026-10-31', '2026-11-30'] as const
export const PAIRS = [
  ['2026-11-18', '2026-12-24'],
  ['2026-01-31', '2027-03-01'],
  ['2024-02-29', '2025-02-28'],
  ['2026-12-31', '2026-01-01'],
  ['2025-06-15', '2026-06-15'],
  ['2026-03-28', '2026-03-30'],
  ['2026-10-24', '2026-10-26'],
  ['2020-01-01', '2026-11-18'],
] as const
export const MONTHS = ['2026-11', '2026-02', '2024-02', '2026-12', '2026-05', '2027-01'] as const
/** Instants spread over 2026 and well away from the Prague transitions (Mar 29 and Oct 25). */
export const INSTANTS = [1_767_225_600_000, 1_771_372_800_000, 1_774_000_000_000, 1_778_500_000_000, 1_782_900_000_000, 1_787_000_000_000, 1_792_000_000_000, 1_796_400_000_000] as const
export const WALLS = ['2026-01-15T08:30:00', '2026-02-20T12:00:00', '2026-04-10T23:15:30', '2026-06-01T00:00:00', '2026-07-20T14:45:10', '2026-09-05T06:05:00', '2026-11-18T14:30:00', '2026-12-24T18:00:00'] as const


/** One arm's implementation of every operation, all ISO string in / ISO string out. */
export interface Api {
  addDays: (d: string) => string
  addMonths: (d: string) => string
  diffDays: (a: string, b: string) => number
  isBefore: (a: string, b: string) => boolean
  startOfWeek: (d: string) => string
  startOfMonth: (d: string) => string
  grid: (ym: string) => string[]
  parse: (d: string) => number
  toWall: (t: number) => string
  toInstant: (w: string) => number
}

