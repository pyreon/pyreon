import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek.js'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { type Api, ZONE } from './common'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

export function dayjsApi(): Api {
  const f = 'YYYY-MM-DD'

  return {
    addDays: (s) => dayjs(s).add(1, 'day').format(f),
    addMonths: (s) => dayjs(s).add(1, 'month').format(f),
    diffDays: (a, b) => dayjs(b).diff(a, 'day'),
    isBefore: (a, b) => dayjs(a).isBefore(b),
    startOfWeek: (s) => dayjs(s).startOf('isoWeek').format(f),
    startOfMonth: (s) => dayjs(s).startOf('month').format(f),
    grid: (ym) => {
      const start = dayjs(ym + '-01').startOf('isoWeek')
      const out: string[] = []

      for (let i = 0; i < 42; i++) out.push(start.add(i, 'day').format(f))

      return out
    },
    parse: (s) => {
      const d = dayjs(s)

      return d.year() * 10_000 + (d.month() + 1) * 100 + d.date()
    },
    toWall: (t) => dayjs(t).tz(ZONE).format('YYYY-MM-DDTHH:mm:ss'),
    toInstant: (w) => dayjs.tz(w, ZONE).valueOf(),
  }
}

