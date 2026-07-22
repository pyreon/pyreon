/**
 * State-machine coverage for `CalendarBase` — the headless date-grid calendar.
 * Drives the `CalendarState` object directly: month/year navigation (with
 * boundary wrap), the day grid, selection + predicates (isSelected/isDisabled/
 * isToday/isCurrentMonth), the date-grid keyboard handler (Arrow/Home/End/
 * PageUp/PageDown day arithmetic), and grid/root/day prop helpers. Pure date
 * logic + signals → identical in happy-dom and Chromium.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { CalendarBase, type CalendarState, type CalendarDay } from './index'

const mount = (props: Record<string, unknown> = {}): CalendarState => {
  let captured: CalendarState | undefined
  mountInBrowser(
    h(CalendarBase as never, {
      ...props,
      children: (s: CalendarState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const kd = (key: string, shiftKey = false) =>
  ({ key, shiftKey, preventDefault() {} }) as unknown as KeyboardEvent

/** A day cell that belongs to the current view month. */
const currentMonthDay = (s: CalendarState): CalendarDay => {
  for (const week of s.days()) for (const d of week) if (s.isCurrentMonth(d.date)) return d
  throw new Error('no current-month day')
}

describe('CalendarBase — navigation', () => {
  it('nextMonth/prevMonth wrap the year; prevYear/nextYear; goTo', () => {
    const s = mount()
    s.goTo(11, 2024) // December 2024
    expect(s.viewMonth()).toBe(11)
    expect(s.viewYear()).toBe(2024)
    s.nextMonth() // → January 2025
    expect(s.viewMonth()).toBe(0)
    expect(s.viewYear()).toBe(2025)
    s.prevMonth() // → December 2024
    expect(s.viewMonth()).toBe(11)
    expect(s.viewYear()).toBe(2024)
    s.nextYear()
    expect(s.viewYear()).toBe(2025)
    s.prevYear()
    expect(s.viewYear()).toBe(2024)
  })

  it('days() is a grid of weeks; weekdays() has 7 labels; monthLabel() is a string', () => {
    const s = mount()
    s.goTo(0, 2024)
    const grid = s.days()
    expect(grid.length).toBeGreaterThanOrEqual(4)
    expect(grid.every((week) => week.length === 7)).toBe(true)
    expect(s.weekdays()).toHaveLength(7)
    expect(typeof s.monthLabel()).toBe('string')
  })
})

describe('CalendarBase — selection + predicates', () => {
  it('select sets the date; isSelected reflects it; onChange fires', () => {
    const calls: unknown[] = []
    const s = mount({ onChange: (d: unknown) => calls.push(d) })
    const date = { year: 2024, month: 0, day: 15 }
    s.select(date)
    expect(s.selected()).toEqual(date)
    expect(s.isSelected(date)).toBe(true)
    expect(s.isSelected({ year: 2024, month: 0, day: 16 })).toBe(false)
    expect(calls).toEqual([date])
  })

  it('isDisabled honors min/max; isCurrentMonth distinguishes spillover days', () => {
    const s = mount({
      min: { year: 2024, month: 0, day: 10 },
      max: { year: 2024, month: 0, day: 20 },
    })
    s.goTo(0, 2024)
    expect(s.isDisabled({ year: 2024, month: 0, day: 5 })).toBe(true) // before min
    expect(s.isDisabled({ year: 2024, month: 0, day: 15 })).toBe(false)
    expect(s.isDisabled({ year: 2024, month: 0, day: 25 })).toBe(true) // after max
    const spill = s.days().flat().find((d) => !s.isCurrentMonth(d.date))
    expect(spill).toBeDefined()
  })

  it('isToday matches the real today', () => {
    const s = mount()
    const t = new Date()
    expect(s.isToday({ year: t.getFullYear(), month: t.getMonth(), day: t.getDate() })).toBe(true)
    expect(s.isToday({ year: 1999, month: 0, day: 1 })).toBe(false)
  })

  it('a disabled date cannot be selected', () => {
    const calls: unknown[] = []
    const s = mount({
      min: { year: 2024, month: 0, day: 10 },
      onChange: (d: unknown) => calls.push(d),
    })
    s.select({ year: 2024, month: 0, day: 1 }) // before min → disabled
    expect(s.selected()).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('CalendarBase — date-grid keyboard', () => {
  it('PageDown/PageUp move the view by a month; Shift jumps a year; Arrows/Home/End do not throw', () => {
    const s = mount()
    s.goTo(5, 2024) // June 2024
    const day = currentMonthDay(s)
    const onKey = s.getDayProps(day).onKeyDown as (e: KeyboardEvent) => void

    // Each handler operates on the ORIGINAL captured June (month 5) day, not
    // the moved view — addMonths is relative to `day.date`.
    onKey(kd('PageDown')) // June → July
    expect(s.viewMonth()).toBe(6)
    onKey(kd('PageUp')) // June → May
    expect(s.viewMonth()).toBe(4)
    onKey(kd('PageDown', true)) // June + 12 months → June 2025
    expect(s.viewYear()).toBe(2025)
    expect(s.viewMonth()).toBe(5)

    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'x']) {
      expect(() => onKey(kd(k))).not.toThrow()
    }
  })
})

describe('CalendarBase — prop helpers + degenerate children', () => {
  it('gridProps role=grid with an accessor aria-label; getDayProps carries a gridcell role', () => {
    const s = mount()
    const g = s.gridProps()
    expect(g.role).toBe('grid')
    expect(typeof (g['aria-label'] as () => string)()).toBe('string')
    const dp = s.getDayProps(currentMonthDay(s)) as Record<string, unknown>
    expect(dp.role).toBe('gridcell')
  })

  it('renders null (no throw) when children is not a render function', () => {
    expect(() => mountInBrowser(h(CalendarBase as never, {}))).not.toThrow()
  })
})
