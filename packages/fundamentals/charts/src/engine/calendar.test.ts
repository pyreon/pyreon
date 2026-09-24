import { describe, expect, it } from 'vitest'
import { calendarDomain, civilFromDays, daysFromCivil, layoutCalendar, renderCalendar, weekdayOfDays } from './calendar'
import { calendarValues, formatIsoDate, hitCalendar, parseIsoDate } from './calendar-web'
import { calendarToSvg } from './family-svg'

const box = { x: 0, y: 0, w: 720, h: 120 }

describe('calendar dates', () => {
  it('parses and formats ISO dates, rejecting impossible ones', () => {
    expect(formatIsoDate(parseIsoDate('2024-02-29')!)).toBe('2024-02-29')
    expect(parseIsoDate('2023-02-29')).toBeNull()
    expect(parseIsoDate('2024-13-01')).toBeNull()
    expect(parseIsoDate('24-01-01')).toBeNull()
    expect(parseIsoDate('2024/01/01')).toBeNull()
  })
  it('civil-date arithmetic round-trips across leap years, centuries and the epoch', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0)
    expect(weekdayOfDays(0)).toBe(4)
    expect(civilFromDays(daysFromCivil(2000, 2, 29))).toEqual({ year: 2000, month: 2, day: 29 })
    expect(civilFromDays(daysFromCivil(1900, 3, 1) - 1)).toEqual({ year: 1900, month: 2, day: 28 })
    expect(civilFromDays(daysFromCivil(1969, 12, 31))).toEqual({ year: 1969, month: 12, day: 31 })
    expect(formatIsoDate(parseIsoDate('0099-01-05')!)).toBe('0099-01-05')
    expect(formatIsoDate(Date.UTC(2024, 6, 4))).toBe('2024-07-04')
    expect(parseIsoDate('2024-07-04')).toBe(Date.UTC(2024, 6, 4))
  })
})

describe('calendar layout', () => {
  it('one cell per day, rows by weekday, weeks by column, months labelled at their first column', () => {
    // 2024-01-01 is a Monday.
    const l = layoutCalendar('2024-01-01', '2024-02-29', box)
    expect(l.cells).toHaveLength(60)
    expect(l.cells[0]!.row).toBe(1)
    expect(l.cells[0]!.week).toBe(0)
    expect(l.cells[6]!.row).toBe(0)
    expect(l.cells[6]!.week).toBe(1)
    expect(l.cells[59]!.date).toBe('2024-02-29')
    expect(l.monthLabels.map((m) => m.text)).toEqual(['Jan', 'Feb'])
    const feb1 = l.cells.find((c) => c.date === '2024-02-01')!
    expect(l.monthLabels[1]!.at.x).toBeCloseTo(feb1.rect.x, 9)
    expect(l.dayLabels.map((d) => d.text)).toEqual(['Mon', 'Wed', 'Fri'])
    expect(l.cellSize).toBeGreaterThan(0)
  })
  it('firstDay: 1 makes Monday row 0 and rotates the weekday labels', () => {
    const l = layoutCalendar('2024-01-01', '2024-01-14', box, { firstDay: 1 })
    expect(l.cells[0]!.row).toBe(0)
    expect(l.cells[6]!.row).toBe(6)
    expect(l.cells[7]!.week).toBe(1)
    expect(l.dayLabels.map((d) => d.text)).toEqual(['Tue', 'Thu', 'Sat'])
  })
  it('fits the box: cells never overlap and the grid stays inside', () => {
    const l = layoutCalendar('2024-01-01', '2024-12-31', box, { cellGap: 2 })
    const last = l.cells[l.cells.length - 1]!
    expect(last.rect.x + last.rect.w).toBeLessThanOrEqual(720 + 1e-9)
    for (const c of l.cells) expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(120 + 1e-9)
    const a = l.cells[0]!
    const b = l.cells[1]!
    expect(b.rect.y).toBeGreaterThanOrEqual(a.rect.y + a.rect.h + 2 - 1e-9)
    const fixed = layoutCalendar('2024-01-01', '2024-01-31', box, { cellSize: 9, cellGap: 1 })
    expect(fixed.cellSize).toBe(9)
    expect(fixed.cells[7]!.rect.x - fixed.cells[0]!.rect.x).toBeCloseTo(10, 9)
  })
  it('an empty or inverted range lays out nothing', () => {
    expect(layoutCalendar('2024-03-01', '2024-02-01', box).cells).toEqual([])
    expect(layoutCalendar('nope', '2024-02-01', box).cells).toEqual([])
  })
})

describe('calendar render', () => {
  const l = layoutCalendar('2024-01-01', '2024-01-14', box)
  const values = { '2024-01-01': 1, '2024-01-02': 5, '2024-01-03': 10 }
  const vals = calendarValues(values)
  it('colours by value through the ramp, empties get the empty colour, domain is the data extent', () => {
    expect(calendarDomain(l, vals)).toEqual({ min: 1, max: 10 })
    const cmds = renderCalendar(l, vals)
    const rects = cmds.filter((c) => c.kind === 'rect')
    expect(rects).toHaveLength(14)
    const fill = (i: number) => (rects[i]!.kind === 'rect' ? rects[i]!.fill : '')
    expect(fill(0)).not.toBe(fill(2))
    expect(fill(1)).not.toBe(fill(2))
    expect(fill(3)).toBe('#e2e8f0')
    expect(fill(3)).toBe(fill(13))
    expect(cmds.filter((c) => c.kind === 'text').length).toBe(l.monthLabels.length + l.dayLabels.length)
  })
  it('a fixed domain moves the colours; entrance fills week by week', () => {
    const wide = renderCalendar(l, vals, { domain: { min: 0, max: 100 } })
    const tight = renderCalendar(l, vals)
    const f = (cmds: typeof wide, i: number) => (cmds[i]!.kind === 'rect' ? cmds[i]!.fill : '')
    expect(f(wide, 2)).not.toBe(f(tight, 2))
    const half = renderCalendar(l, vals, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'rect').length).toBeLessThan(14)
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('hit-testing returns the cell under the point', () => {
    const c = l.cells[5]!
    expect(hitCalendar(l, c.rect.x + 1, c.rect.y + 1)!.date).toBe(c.date)
    expect(hitCalendar(l, -10, -10)).toBeNull()
  })
  it('calendarToSvg renders and describes', () => {
    const svg = calendarToSvg({ start: '2024-01-01', end: '2024-01-14', values, title: 'Commits' })
    expect(svg).toContain('<rect')
    expect(svg).toContain('14 days from 2024-01-01 to 2024-01-14, 3 with values from 1 to 10')
    expect(svg).not.toContain('NaN')
  })
})

