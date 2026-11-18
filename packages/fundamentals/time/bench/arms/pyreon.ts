import { add, compare, dateParts, diff, monthGrid, startOf, toInstant, toPlainDateTime } from '../../src/core'
import { type Api, ZONE } from './common'

export function pyreonApi(): Api {
  const D = (s: string): '2026-01-01' => s as '2026-01-01'

  return {
    addDays: (s) => add(D(s), { days: 1 }),
    addMonths: (s) => add(D(s), { months: 1 }),
    diffDays: (a, b) => diff(D(a), D(b), 'day'),
    isBefore: (a, b) => compare(D(a), D(b)) < 0,
    startOfWeek: (s) => startOf(D(s), 'week'),
    startOfMonth: (s) => startOf(D(s), 'month'),
    grid: (ym) => monthGrid(ym as '2026-01', { weeks: 6 }).flat(),
    parse: (s) => {
      const p = dateParts(D(s))

      return p.year * 10_000 + p.month * 100 + p.day
    },
    toWall: (t) => toPlainDateTime(t, ZONE),
    toInstant: (w) => toInstant(w as '2026-01-01T10:00', ZONE),
  }
}

