// Branch coverage for the calendar-heatmap family. Most of it is the ISO date
// parser — which must reject a bad digit at EVERY position and an impossible
// date that the civil arithmetic would otherwise silently roll over — plus the
// cell-size fit and the value ramp's clamps.
import { describe, expect, it } from 'vitest'
import { calendarCellValues, calendarDomain, civilFromDays, daysFromCivil, formatIsoDays, hitCalendarIndex, layoutCalendar, parseIsoDays, renderCalendar, weekdayOfDays } from './calendar'
import type { CalendarValue } from './calendar'

const box = { x: 0, y: 0, w: 400, h: 120 }

describe('calendar — civil date arithmetic', () => {
  it('the epoch is 1970-01-01, a Thursday', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0)
    expect(weekdayOfDays(0), '0 = Sunday, so Thursday is 4').toBe(4)
    expect(civilFromDays(0)).toEqual({ year: 1970, month: 1, day: 1 })
  })
  it('round-trips across leap years and century boundaries', () => {
    for (const [y, m, d] of [[2024, 2, 29], [1900, 3, 1], [2000, 2, 29], [1969, 12, 31], [2100, 1, 1]] as const) {
      expect(civilFromDays(daysFromCivil(y, m, d))).toEqual({ year: y, month: m, day: d })
    }
  })
  it('weekdays advance one per day and wrap after seven', () => {
    expect(weekdayOfDays(7)).toBe(weekdayOfDays(0))
    expect(weekdayOfDays(-1), 'a pre-epoch day still lands in 0..6').toBe(3)
  })
})

describe('calendar — the ISO parser', () => {
  it('a well-formed date parses', () => {
    expect(parseIsoDays('2024-03-15')).toEqual({ ok: true, days: daysFromCivil(2024, 3, 15) })
  })
  it('the wrong LENGTH or a missing dash is rejected', () => {
    for (const bad of ['', '2024-3-15', '2024/03/15', '2024-03-155', '20240315xx']) {
      expect(parseIsoDays(bad).ok, bad).toBe(false)
    }
  })
  it('a NON-DIGIT at any of the eight digit positions is rejected', () => {
    const good = '2024-03-15'
    for (const at of [0, 1, 2, 3, 5, 6, 8, 9]) {
      const bad = `${good.slice(0, at)}x${good.slice(at + 1)}`
      expect(parseIsoDays(bad), `position ${at}`).toEqual({ ok: false, days: 0 })
    }
  })
  it('an out-of-range month or day is rejected before the arithmetic runs', () => {
    expect(parseIsoDays('2024-00-15').ok).toBe(false)
    expect(parseIsoDays('2024-13-15').ok).toBe(false)
    expect(parseIsoDays('2024-03-00').ok).toBe(false)
    expect(parseIsoDays('2024-03-32').ok).toBe(false)
  })
  it('an IMPOSSIBLE but in-range date is rejected by the round trip, not rolled over', () => {
    expect(parseIsoDays('2023-02-29').ok, '2023 is not a leap year').toBe(false)
    expect(parseIsoDays('2024-02-29').ok, 'but 2024 is').toBe(true)
    expect(parseIsoDays('2024-04-31').ok, 'April has 30 days').toBe(false)
  })
})

describe('calendar — formatting', () => {
  it('pads the month and day to two digits', () => {
    expect(formatIsoDays(daysFromCivil(2024, 3, 5))).toBe('2024-03-05')
    expect(formatIsoDays(daysFromCivil(2024, 12, 25))).toBe('2024-12-25')
  })
  it('pads the YEAR to four digits at every decade boundary', () => {
    expect(formatIsoDays(daysFromCivil(999, 1, 1))).toBe('0999-01-01')
    expect(formatIsoDays(daysFromCivil(99, 1, 1))).toBe('0099-01-01')
    expect(formatIsoDays(daysFromCivil(9, 1, 1))).toBe('0009-01-01')
  })
  it('format and parse round-trip', () => {
    const d = daysFromCivil(2021, 7, 4)
    expect(parseIsoDays(formatIsoDays(d))).toEqual({ ok: true, days: d })
  })
})

describe('calendar — layout', () => {
  it('one cell per day, laid out in week columns', () => {
    const l = layoutCalendar('2024-01-01', '2024-01-31', box)
    expect(l.cells).toHaveLength(31)
    expect(l.days).toBe(31)
    expect(l.startDay).toBe(daysFromCivil(2024, 1, 1))
    expect(l.cells[0]!.date).toBe('2024-01-01')
    expect(new Set(l.cells.map((c) => c.week)).size).toBeGreaterThan(1)
  })
  it('an UNPARSEABLE or BACKWARDS range lays out nothing', () => {
    for (const [s, e] of [['bad', '2024-01-31'], ['2024-01-01', 'bad'], ['2024-02-01', '2024-01-01']] as const) {
      expect(layoutCalendar(s, e, box)).toEqual({ cells: [], monthLabels: [], dayLabels: [], cellSize: 0, startDay: 0, days: 0 })
    }
  })
  it('a single-day range is one cell', () => {
    expect(layoutCalendar('2024-01-01', '2024-01-01', box).cells).toHaveLength(1)
  })
  it('firstDay shifts the starting row and is CLAMPED to 0..6', () => {
    const sunday = layoutCalendar('2024-01-01', '2024-01-31', box, { firstDay: 0 })
    const monday = layoutCalendar('2024-01-01', '2024-01-31', box, { firstDay: 1 })
    expect(monday.cells[0]!.row).not.toBe(sunday.cells[0]!.row)
    expect(layoutCalendar('2024-01-01', '2024-01-31', box, { firstDay: -5 }).cells[0]!.row).toBe(sunday.cells[0]!.row)
    expect(layoutCalendar('2024-01-01', '2024-01-31', box, { firstDay: 99 }).cells[0]!.row).toBe(layoutCalendar('2024-01-01', '2024-01-31', box, { firstDay: 6 }).cells[0]!.row)
  })
  it('hiding the day labels gives the left gutter back to the grid', () => {
    const shown = layoutCalendar('2024-01-01', '2024-03-31', box)
    const hidden = layoutCalendar('2024-01-01', '2024-03-31', box, { showDayLabels: false })
    expect(hidden.cells[0]!.rect.x).toBeLessThan(shown.cells[0]!.rect.x)
    expect(hidden.dayLabels).toEqual([])
  })
  it('hiding the month labels drops them and lifts the grid', () => {
    const shown = layoutCalendar('2024-01-01', '2024-03-31', box)
    const hidden = layoutCalendar('2024-01-01', '2024-03-31', box, { showMonthLabels: false })
    expect(shown.monthLabels.length).toBeGreaterThan(0)
    expect(hidden.monthLabels).toEqual([])
    expect(hidden.cells[0]!.rect.y).toBeLessThan(shown.cells[0]!.rect.y)
  })
  it('a box too small for the gutters collapses the cell size to zero rather than a negative one', () => {
    const l = layoutCalendar('2024-01-01', '2024-12-31', { x: 0, y: 0, w: 4, h: 4 })
    expect(l.cellSize).toBe(0)
    for (const c of l.cells) expect(c.rect.w).toBe(0)
  })
  it('a fixed cellSize overrides the fit, and a NEGATIVE one falls back to it', () => {
    const fixed = layoutCalendar('2024-01-01', '2024-01-31', box, { cellSize: 9 })
    expect(fixed.cellSize).toBe(9)
    const fitted = layoutCalendar('2024-01-01', '2024-01-31', box)
    expect(layoutCalendar('2024-01-01', '2024-01-31', box, { cellSize: -3 }).cellSize).toBe(fitted.cellSize)
  })
})

describe('calendar — values', () => {
  const layout = layoutCalendar('2024-01-01', '2024-01-07', box)
  const values: CalendarValue[] = [{ date: '2024-01-02', value: 5 }, { date: '2024-01-05', value: 1 }]

  it('a datum lands on its own day and nowhere else', () => {
    const cv = calendarCellValues(layout, values)
    expect(cv.has.map((h, i) => (h ? layout.cells[i]!.date : null)).filter(Boolean)).toEqual(['2024-01-02', '2024-01-05'])
    expect(cv.value[1]).toBe(5)
  })
  it('a datum OUTSIDE the range, or with a bad date or value, is ignored', () => {
    const cv = calendarCellValues(layout, [{ date: '2023-06-01', value: 9 }, { date: 'nonsense', value: 9 }, { date: '2024-01-03', value: Number.NaN }])
    expect(cv.has.some(Boolean)).toBe(false)
  })
  it('the LAST datum for a day wins', () => {
    const cv = calendarCellValues(layout, [{ date: '2024-01-02', value: 1 }, { date: '2024-01-02', value: 7 }])
    expect(cv.value[1]).toBe(7)
  })
  it('the domain spans only the days that have data, in both directions', () => {
    expect(calendarDomain(layout, [{ date: '2024-01-02', value: 5 }, { date: '2024-01-03', value: -2 }, { date: '2024-01-04', value: 9 }])).toEqual({ min: -2, max: 9 })
  })
  it('no data at all gives a zero domain', () => {
    expect(calendarDomain(layout, [])).toEqual({ min: 0, max: 0 })
  })
})

describe('calendar — render', () => {
  const layout = layoutCalendar('2024-01-01', '2024-02-29', box)
  const values: CalendarValue[] = [{ date: '2024-01-02', value: 5 }, { date: '2024-01-20', value: 50 }]

  it('progress is clamped at both ends; zero progress shows no weeks', () => {
    const settled = renderCalendar(layout, values)
    expect(renderCalendar(layout, values, { progress: 9 })).toEqual(settled)
    expect(renderCalendar(layout, values, { progress: -1 })).toEqual([])
  })
  it('a partial frame reveals whole weeks from the left, and holds the labels back', () => {
    const half = renderCalendar(layout, values, { progress: 0.5 })
    expect(half.length).toBeGreaterThan(0)
    expect(half.length).toBeLessThan(settledCells(layout, values))
    expect(half.some((c) => c.kind === 'text')).toBe(false)
  })
  it('a day with NO value takes the empty colour', () => {
    const cmds = renderCalendar(layout, values, { emptyColor: '#eeeeee' }) as { fill: string }[]
    expect(cmds[0]!.fill).toBe('#eeeeee')
  })
  it('a value OUTSIDE an explicit domain is clamped onto the ends of the ramp', () => {
    const inside = renderCalendar(layout, [{ date: '2024-01-02', value: 0 }, { date: '2024-01-03', value: 10 }], { domain: { min: 0, max: 10 } }) as { fill: string }[]
    const outside = renderCalendar(layout, [{ date: '2024-01-02', value: -99 }, { date: '2024-01-03', value: 99 }], { domain: { min: 0, max: 10 } }) as { fill: string }[]
    expect(outside.map((c) => c.fill)).toEqual(inside.map((c) => c.fill))
  })
  it('a COLLAPSED domain puts every valued day at the top of the ramp', () => {
    const cmds = renderCalendar(layout, [{ date: '2024-01-02', value: 5 }, { date: '2024-01-03', value: 5 }]) as { fill: string }[]
    expect(cmds[1]!.fill).toBe(cmds[2]!.fill)
  })
  it('month and weekday labels are drawn on the settled frame', () => {
    const texts = renderCalendar(layout, values).filter((c) => c.kind === 'text')
    expect(texts.length).toBeGreaterThan(0)
  })
})

function settledCells(layout: ReturnType<typeof layoutCalendar>, values: CalendarValue[]): number {
  return renderCalendar(layout, values).length
}

describe('calendar — hit test', () => {
  const layout = layoutCalendar('2024-01-01', '2024-01-31', box)
  it('a point inside a cell reports it', () => {
    const r = layout.cells[5]!.rect
    expect(hitCalendarIndex(layout, r.x + r.w / 2, r.y + r.h / 2)).toBe(5)
  })
  it('a point outside the grid is a miss', () => {
    expect(hitCalendarIndex(layout, -10, -10)).toBe(-1)
    expect(hitCalendarIndex(layout, 1e6, 1e6)).toBe(-1)
  })
  it('an empty layout can never be hit', () => {
    expect(hitCalendarIndex(layoutCalendar('bad', 'bad', box), 0, 0)).toBe(-1)
  })
})
