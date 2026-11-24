import { type Api, ZONE } from './common'

const iso = (d: Date): string => d.toISOString().slice(0, 10)
const DAY = 86_400_000

export function dateApi(): Api {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const wall = (t: number): string => fmt.format(t).replace(' ', 'T')
  const offsetOf = (t: number): number => Date.parse(wall(t) + 'Z') - Math.floor(t / 1000) * 1000

  return {
    addDays: (s) => {
      const d = new Date(s)

      d.setUTCDate(d.getUTCDate() + 1)

      return iso(d)
    },
    addMonths: (s) => {
      const d = new Date(s)
      const day = d.getUTCDate()
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()

      first.setUTCDate(Math.min(day, last))

      return iso(first)
    },
    diffDays: (a, b) => Math.trunc((Date.parse(b) - Date.parse(a)) / DAY),
    isBefore: (a, b) => Date.parse(a) < Date.parse(b),
    startOfWeek: (s) => {
      const d = new Date(s)

      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))

      return iso(d)
    },
    startOfMonth: (s) => {
      const d = new Date(s)

      return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    },
    grid: (ym) => {
      const first = Date.parse(ym + '-01')
      const lead = (new Date(first).getUTCDay() + 6) % 7
      const out: string[] = []

      for (let i = 0; i < 42; i++) out.push(iso(new Date(first + (i - lead) * DAY)))

      return out
    },
    parse: (s) => {
      const d = new Date(s)

      return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
    },
    toWall: wall,
    toInstant: (w) => {
      const guess = Date.parse(w + 'Z')
      const first = guess - offsetOf(guess)

      return guess - offsetOf(first)
    },
  }
}

