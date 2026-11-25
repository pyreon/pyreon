import { describe, expect, it } from 'vitest'
import { businessTimeBetween, isOpen, openingWindows } from '@pyreon/schedule'
import type { BusinessCalendar, WorkingHours } from '@pyreon/schedule'
import type { PlainDateTime } from '@pyreon/time'
import { createCalendar } from '../index'
import { fitsWindows } from '../edit'
import { businessMinutes } from '../models'

// One interpretation of a business calendar: the time grid's shading and `constrainTo: 'businessHours'` must say exactly
// what @pyreon/schedule's isOpen says, minute by minute, across special hours, holidays, weekends and overnight windows.

const nine5 = [{ from: '09:00', to: '17:00' }] as const
const short = [{ from: '09:00', to: '13:00' }] as const
const office = { 1: nine5, 2: nine5, 3: nine5, 4: nine5, 5: nine5 } as const
const DATES = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27'] as const

const CASES: Record<string, BusinessCalendar | WorkingHours> = {
  'special hours, a holiday, a weekend opening, an empty list': { hours: office, holidays: ['2026-12-25'], specialHours: { '2026-12-24': short, '2026-12-26': short, '2026-12-23': [] } },
  'an overnight window spilling into a holiday and into a closed special day': { hours: { 4: [{ from: '22:00', to: '02:00' }], 5: [{ from: '22:00', to: '03:00' }] }, weekend: [], holidays: ['2026-12-25'], specialHours: { '2026-12-26': [] } },
  'special hours only': { specialHours: { '2026-12-22': short, '2026-12-27': [{ from: '20:00', to: '01:00' }] } },
  'function forms of holidays and special hours': { hours: office, holidays: (d) => d.endsWith('-12-25'), specialHours: (d) => (d.endsWith('-12-24') ? short : undefined) },
  'the default weekend closes listed Saturday hours': { hours: { ...office, 6: short } },
  'a bare WorkingHours opens every weekday it lists': { ...office, 6: short },
}

const asCalendar = (c: BusinessCalendar | WorkingHours): BusinessCalendar =>
  'hours' in c || 'specialHours' in c || 'holidays' in c || 'weekend' in c ? (c as BusinessCalendar) : { hours: c as WorkingHours, weekend: [] }

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

describe('business hours: calendar and schedule agree', () => {
  for (const [name, hours] of Object.entries(CASES)) {
    it(name, () => {
      const calendar = asCalendar(hours)
      const grid = createCalendar({ events: () => [], date: '2026-12-23', view: 'week', timeZone: () => 'UTC', locale: () => 'en-GB', businessHours: hours, now: () => 0 }).timeGrid()
      const state = { options: { businessHours: hours } } as never

      for (const date of DATES) {
        const day = grid.days.find((d) => d.date === date)!
        const windows = businessMinutes(state, date)!

        expect(openingWindows(date, calendar).length > 0, date).toBe(windows.length > 0)
        for (let m = 0; m < 1440; m += 15) {
          const at = `${date}T${hhmm(m)}` as PlainDateTime
          const open = isOpen(at, calendar)
          const shaded = day.business!.some((w) => w.top * 1440 <= m + 1e-9 && m < (w.top + w.height) * 1440 - 1e-9)
          const end = m + 15 === 1440 ? `${DATES[DATES.indexOf(date) + 1] ?? '2026-12-28'}T00:00` : `${date}T${hhmm(m + 15)}`
          const fits = fitsWindows(at, end as PlainDateTime, (d) => businessMinutes(state, d))
          const quarter = businessTimeBetween(at, end as PlainDateTime, calendar)

          expect(shaded, `${at} shaded`).toBe(open)
          expect(fits, `${at} constrainTo`).toBe(quarter.hours === 0 && quarter.minutes === 15)
        }
      }
    })
  }
})
