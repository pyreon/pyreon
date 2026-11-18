import { DateTime, IANAZone } from 'luxon'
import { type Api, ZONE } from './common'

export function luxonApi(): Api {
  const zone = IANAZone.create(ZONE)

  return {
    addDays: (s) => DateTime.fromISO(s).plus({ days: 1 }).toISODate() as string,
    addMonths: (s) => DateTime.fromISO(s).plus({ months: 1 }).toISODate() as string,
    diffDays: (a, b) => Math.trunc(DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days),
    isBefore: (a, b) => DateTime.fromISO(a) < DateTime.fromISO(b),
    startOfWeek: (s) => DateTime.fromISO(s).startOf('week').toISODate() as string,
    startOfMonth: (s) => DateTime.fromISO(s).startOf('month').toISODate() as string,
    grid: (ym) => {
      const start = DateTime.fromISO(ym + '-01').startOf('week')
      const out: string[] = []

      for (let i = 0; i < 42; i++) out.push(start.plus({ days: i }).toISODate() as string)

      return out
    },
    parse: (s) => {
      const d = DateTime.fromISO(s)

      return d.year * 10_000 + d.month * 100 + d.day
    },
    toWall: (t) => DateTime.fromMillis(t, { zone }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    toInstant: (w) => DateTime.fromISO(w, { zone }).toMillis(),
  }
}

