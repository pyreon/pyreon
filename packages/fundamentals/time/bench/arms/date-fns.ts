import { TZDate } from '@date-fns/tz'
import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  format as dfFormat,
  isBefore as dfIsBefore,
  parseISO,
  startOfMonth as dfStartOfMonth,
  startOfWeek as dfStartOfWeek,
} from 'date-fns'
import { type Api, ZONE } from './common'

const num = (s: string, from: number, len: number): number => Number(s.slice(from, from + len))

export function dateFnsApi(): Api {
  const f = 'yyyy-MM-dd'
  const startOfIsoWeek = (d: Date): Date => dfStartOfWeek(d, { weekStartsOn: 1 })

  return {
    addDays: (s) => dfFormat(dfAddDays(parseISO(s), 1), f),
    addMonths: (s) => dfFormat(dfAddMonths(parseISO(s), 1), f),
    diffDays: (a, b) => differenceInCalendarDays(parseISO(b), parseISO(a)),
    isBefore: (a, b) => dfIsBefore(parseISO(a), parseISO(b)),
    startOfWeek: (s) => dfFormat(startOfIsoWeek(parseISO(s)), f),
    startOfMonth: (s) => dfFormat(dfStartOfMonth(parseISO(s)), f),
    grid: (ym) => {
      const start = startOfIsoWeek(dfStartOfMonth(parseISO(ym + '-01')))

      return eachDayOfInterval({ start, end: dfAddDays(start, 41) }).map((d) => dfFormat(d, f))
    },
    parse: (s) => {
      const d = parseISO(s)

      return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate()
    },
    toWall: (t) => dfFormat(new TZDate(t, ZONE), "yyyy-MM-dd'T'HH:mm:ss"),
    toInstant: (w) => new TZDate(num(w, 0, 4), num(w, 5, 2) - 1, num(w, 8, 2), num(w, 11, 2), num(w, 14, 2), num(w, 17, 2), ZONE).getTime(),
  }
}

