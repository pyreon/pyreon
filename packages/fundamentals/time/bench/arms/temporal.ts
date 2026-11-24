/// <reference lib="esnext.temporal" />
import { type Api, ZONE } from './common'

export function temporalApi(): Api {
  const T = (globalThis as unknown as { Temporal: typeof Temporal }).Temporal

  return {
    addDays: (s) => T.PlainDate.from(s).add({ days: 1 }).toString(),
    addMonths: (s) => T.PlainDate.from(s).add({ months: 1 }).toString(),
    diffDays: (a, b) => T.PlainDate.from(a).until(b, { largestUnit: 'day' }).days,
    isBefore: (a, b) => T.PlainDate.compare(a, b) < 0,
    startOfWeek: (s) => {
      const d = T.PlainDate.from(s)

      return d.subtract({ days: d.dayOfWeek - 1 }).toString()
    },
    startOfMonth: (s) => T.PlainDate.from(s).with({ day: 1 }).toString(),
    grid: (ym) => {
      const first = T.PlainDate.from(ym + '-01')
      const start = first.subtract({ days: first.dayOfWeek - 1 })
      const out: string[] = []

      for (let i = 0; i < 42; i++) out.push(start.add({ days: i }).toString())

      return out
    },
    parse: (s) => {
      const d = T.PlainDate.from(s)

      return d.year * 10_000 + d.month * 100 + d.day
    },
    toWall: (t) => T.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(ZONE).toPlainDateTime().toString(),
    toInstant: (w) => T.PlainDateTime.from(w).toZonedDateTime(ZONE).epochMilliseconds,
  }
}

