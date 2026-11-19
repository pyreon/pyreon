import { setLocale, setTimeZone } from '@pyreon/ambient'
import { effectScope, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCalendar } from '../index'
import type { CalendarEvent } from '../index'

const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })

beforeEach(() => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
})

afterEach(() => {
  setLocale('en-GB')
})

describe('createCalendar', () => {
  const noon = Date.UTC(2026, 10, 18, 11, 0)
  const make = (events: () => readonly CalendarEvent[], extra = {}) => createCalendar({ events, date: '2026-11-18', now: () => noon, ...extra })

  it('starts on a month and moves by the unit of the view, with a title in the active locale', () => {
    const cal = make(() => [])
    expect(cal.view()).toBe('month')
    expect(cal.title()).toBe('November 2026')
    expect(cal.range()).toEqual({ start: '2026-10-26', end: '2026-12-07' })
    cal.next()
    expect(cal.date()).toBe('2026-12-18')
    cal.setView('week')
    expect(cal.range()).toEqual({ start: '2026-12-14', end: '2026-12-21' })
    expect(cal.title()).toContain('Dec')
    cal.previous()
    expect(cal.date()).toBe('2026-12-11')
    cal.today()
    expect(cal.date()).toBe('2026-11-18')
    setLocale('cs')
    cal.setView('month')
    expect(cal.title()).toBe('listopad 2026')
  })

  it('is controlled when given signals, and follows them', () => {
    const view = signal<'month' | 'day'>('month')
    const date = signal('2026-11-18' as const)
    const cal = createCalendar({ events: () => [], view, date: date as never, now: () => noon })
    view.set('day')
    expect(cal.range()).toEqual({ start: '2026-11-18', end: '2026-11-19' })
    cal.goTo('2026-11-20')
    expect(date()).toBe('2026-11-20')
  })

  it('calls onRangeChange with the window at the start and when it moves, and not for a change of an event', () => {
    const onRangeChange = vi.fn()
    const events = signal<CalendarEvent[]>([])
    const cal = make(() => events(), { onRangeChange })
    expect(onRangeChange).toHaveBeenCalledTimes(1)
    expect(onRangeChange).toHaveBeenLastCalledWith({ start: '2026-10-26', end: '2026-12-07' })
    events.set([ev('a', '2026-11-18T10:00', '2026-11-18T11:00')])
    expect(onRangeChange).toHaveBeenCalledTimes(1)
    cal.next()
    expect(onRangeChange).toHaveBeenCalledTimes(2)
  })

  it('month: week rows with the events in lanes; the day cells say which days are in the month', () => {
    const cal = make(() => [ev('conf', '2026-11-16', '2026-11-19'), ev('mon', '2026-11-16T09:00', '2026-11-16T10:00')])
    const month = cal.month()
    expect(month.key).toBe('2026-11')
    expect(month.weeks).toHaveLength(6)
    expect(month.weeks[0]!.days.map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true])
    const week = month.weeks[3]!
    expect(week.layout().lanes.map((l) => l.map((x) => x.occurrenceKey.split(':')[0]))).toEqual([['conf'], ['mon']])
  })

  it('time grid: a model per day with its blocks, the all-day row, opening hours, and the now line from the clock', () => {
    const cal = make(() => [ev('a', '2026-11-18T09:00', '2026-11-18T10:30'), ev('hol', '2026-11-18', '2026-11-19')], {
      view: 'week',
      businessHours: { 3: [{ from: '09:00', to: '17:00' }] },
    })
    const grid = cal.timeGrid()
    expect(grid.days.map((d) => d.date)[2]).toBe('2026-11-18')
    const wed = grid.days[2]!
    expect(wed.blocks().map((b) => [b.occurrenceKey.split(':')[0], b.top])).toEqual([['a', 9 / 24]])
    expect(wed.business).toEqual([{ top: 9 / 24, height: 8 / 24 }])
    expect(grid.days[0]!.business).toEqual([])
    expect(grid.allDay().lanes[0]![0]!.occurrenceKey.startsWith('hol')).toBe(true)
    expect(wed.nowOffset()).toBeCloseTo(12 / 24, 6)
    expect(grid.days[3]!.nowOffset()).toBeNull()
    expect(grid.slots).toHaveLength(48)
  })

  it('changing one event recomputes only the days it touches', () => {
    const layoutDay = vi.fn()
    const layoutRow = vi.fn()
    const events = signal<CalendarEvent[]>([ev('a', '2026-11-16T09:00', '2026-11-16T10:00'), ev('b', '2026-11-18T09:00', '2026-11-18T10:00'), ev('c', '2026-11-20T09:00', '2026-11-20T10:00')])
    const cal = make(() => events(), { view: 'week', instrument: { layoutDay, layoutRow } })
    const grid = cal.timeGrid()
    for (const d of grid.days) d.blocks()
    expect(layoutDay).toHaveBeenCalledTimes(7)
    layoutDay.mockClear()
    events.set([events()[0]!, ev('b', '2026-11-18T09:30', '2026-11-18T10:30'), events()[2]!])
    for (const d of cal.timeGrid().days) d.blocks()
    expect(layoutDay.mock.calls.map((c) => c[0])).toEqual(['2026-11-18'])
    layoutDay.mockClear()
    events.set([...events(), ev('d', '2026-11-18T09:00', '2026-11-19T01:00')])
    for (const d of cal.timeGrid().days) d.blocks()
    expect(layoutDay.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-11-18', '2026-11-19'])
    // an unrelated change of the same list (a new array with the same events) recomputes nothing
    layoutDay.mockClear()
    events.set([...events()])
    for (const d of cal.timeGrid().days) d.blocks()
    expect(layoutDay).not.toHaveBeenCalled()
  })

  it('month weeks recompute only when their own events change', () => {
    const layoutRow = vi.fn()
    const events = signal<CalendarEvent[]>([ev('a', '2026-11-03T09:00', '2026-11-03T10:00'), ev('b', '2026-11-18T09:00', '2026-11-18T10:00')])
    const cal = make(() => events(), { instrument: { layoutRow } })
    for (const w of cal.month().weeks) w.layout()
    layoutRow.mockClear()
    events.set([events()[0]!, ev('b', '2026-11-19T09:00', '2026-11-19T10:00')])
    for (const w of cal.month().weeks) w.layout()
    expect(layoutRow.mock.calls.map((c) => c[0])).toEqual(['2026-11-16'])
  })

  it('keyboard: the arrows move the cursor and the view follows it; Shift makes a range; Enter confirms; Escape clears', () => {
    const onSelect = vi.fn()
    const cal = make(() => [], { onSelect })
    const key = (k: string, shiftKey = false) => cal.onKeyDown({ key: k, shiftKey } as KeyboardEvent, 'month')
    cal.setCursor('2026-11-18')
    key('ArrowRight')
    expect(cal.cursor().date).toBe('2026-11-19')
    key('PageDown')
    expect(cal.cursor().date).toBe('2026-12-19')
    expect(cal.date()).toBe('2026-12-19')
    key('ArrowDown', true)
    key('ArrowRight', true)
    expect(cal.selection()).toEqual({ start: '2026-12-19', end: '2026-12-28', allDay: true })
    key('Enter')
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-12-19', end: '2026-12-28', allDay: true })
    key('Escape')
    expect(cal.selection()).toBeNull()
    expect(key('x')).toBe(false)
  })

  it('selects a day or a slot as a click does, and calls onEventClick with the event', () => {
    const onSelect = vi.fn()
    const onEventClick = vi.fn()
    const cal = make(() => [ev('a', '2026-11-18T09:00', '2026-11-18T10:00')], { onSelect, onEventClick, view: 'week' })
    cal.selectDay('2026-11-18')
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-18', end: '2026-11-19', allDay: true })
    cal.selectSlot('2026-11-18', 570)
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-18T09:30', end: '2026-11-18T10:00', allDay: false })
    cal.eventClick(cal.occurrences()[0]!.key)
    expect(onEventClick.mock.calls[0]![0].id).toBe('a')
  })

  it('announces navigation, and releases everything when its scope ends', () => {
    const scope = effectScope()
    const cal = scope.runInScope(() => make(() => []))
    expect(cal.announcement()).toBe('')
    cal.next()
    expect(cal.announcement()).toBe('December 2026, month')
    scope.stop()
  })
})
