/**
 * The timeline as a screen reader and a keyboard meet it (#4848), in happy-dom: the issue's own measurements. Real focus, layout
 * and axe-core run in `timeline-a11y.browser.test.tsx`.
 */
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TimelineView, WeekView } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'

const NOW = Date.UTC(2026, 10, 18, 11, 0)
const flush = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms))
const cleanups: (() => void)[] = []

function render(node: VNodeChild): HTMLElement {
  const root = document.createElement('div')
  document.body.append(root)
  const unmount = mount(node as never, root)
  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

beforeEach(() => {
  setLocale('en-US')
  setTimeZone('UTC')
})
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const rooms = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, title: `Room ${i + 1}` }))
const meetings = (list: { id: string }[]): CalendarEvent[] => list.map((r) => ({ id: `e-${r.id}`, title: `Meeting in ${r.id}`, start: '2026-11-18T14:00' as never, end: '2026-11-18T15:00' as never, resourceId: r.id }))
const HOURS = { 1: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '17:00' }] } as never

function timeline(n: number, extra: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}) {
  const resources = rooms(n)
  const calendar = createCalendar({ view: 'timeline', date: '2026-11-18', now: () => NOW, timeZone: () => 'UTC', locale: () => 'en-US', events: () => meetings(resources), resources: () => resources, businessHours: HOURS, ...extra } as CalendarOptions)
  const root = render(<TimelineView calendar={calendar} {...props} />)
  const grid = root.querySelector('[role=grid]') as HTMLElement

  return { calendar, root, grid }
}

const key = (el: Element, k: string, extra: KeyboardEventInit = {}): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }))
}

describe('the timeline grid is readable', () => {
  it('30 rooms: every row is in the DOM and numbered (aria-rowindex), so the reading cursor reaches rooms 21 to 30', async () => {
    const { grid } = timeline(30)
    await flush()
    const rows = [...grid.querySelectorAll('[role=row]')]
    expect(grid.getAttribute('aria-rowcount')).toBe('31')
    expect(rows).toHaveLength(31)
    expect(rows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)))
    expect(grid.querySelectorAll('[role=rowheader]')).toHaveLength(30)
    expect(grid.querySelectorAll('button.pcal-event')).toHaveLength(30)
  })

  it('windowed rows (above the threshold) carry their own aria-rowindex, not their place in the window', async () => {
    const { grid } = timeline(200)
    await flush()
    const body = [...grid.querySelectorAll('.pcal-tl-row')]
    expect(body.length).toBeLessThan(40)
    expect(grid.getAttribute('aria-rowcount')).toBe('201')
    expect(body[0]!.getAttribute('aria-rowindex')).toBe('2')
    grid.scrollTop = 4000
    grid.dispatchEvent(new Event('scroll'))
    await flush()
    const first = grid.querySelector('.pcal-tl-row') as HTMLElement
    const index = Number(first.getAttribute('aria-rowindex'))
    expect(index).toBeGreaterThan(2)
    expect(first.dataset.resource).toBe(`r${index - 1}`)
  })

  it('`windowed: false` renders every row; `windowed: true` windows even a few', async () => {
    expect(timeline(200, {}, { windowed: false }).grid.querySelectorAll('.pcal-tl-row')).toHaveLength(200)
    const few = timeline(40, {}, { windowed: true })
    await flush()
    expect(few.grid.querySelectorAll('.pcal-tl-row').length).toBeLessThan(40)
  })

  it('the columns line up: one gridcell per day per row under the day headers, the events of a day in its cell', async () => {
    const { grid } = timeline(3)
    await flush()
    const head = grid.querySelector('[role=row]') as HTMLElement
    const body = grid.querySelectorAll('.pcal-tl-row')[1] as HTMLElement
    expect(head.querySelectorAll('[role=columnheader]')).toHaveLength(8)
    expect(body.querySelectorAll('[role=rowheader],[role=gridcell]')).toHaveLength(8)
    const wednesday = body.querySelector('[role=gridcell][data-date="2026-11-18"]') as HTMLElement
    expect(wednesday.querySelector('button.pcal-event')).not.toBeNull()
    expect(body.querySelectorAll('[role=gridcell]:not([data-date="2026-11-18"]) button.pcal-event')).toHaveLength(0)
  })

  it('opening hours mark the cells as the time grid marks its slots', async () => {
    const { grid } = timeline(2)
    await flush()
    const marked = [...grid.querySelectorAll('.pcal-tl-row[data-resource="r1"] [role=gridcell]')].map((c) => c.getAttribute('data-business'))
    // en-US: the week runs Sunday 15 to Saturday 21; Monday and Wednesday open 9 to 17, the rest closed
    expect(marked).toEqual(['closed', 'open', 'closed', 'open', 'closed', 'closed', 'closed'])
    expect(grid.querySelectorAll('.pcal-tl-row[data-resource="r1"] .pcal-tl-open')).toHaveLength(2)
    const week = render(<WeekView calendar={createCalendar({ view: 'week', date: '2026-11-18', now: () => NOW, timeZone: () => 'UTC', events: () => [], businessHours: HOURS } as CalendarOptions)} />)
    expect(week.querySelectorAll('[data-business]').length).toBeGreaterThan(0)
  })

  it('the empty state is a row of the grid, not a bare <p> inside it', async () => {
    const calendar = createCalendar({ view: 'timeline', date: '2026-11-18', now: () => NOW, timeZone: () => 'UTC', events: () => [], resources: () => [] } as CalendarOptions)
    const root = render(<TimelineView calendar={calendar} />)
    await flush()
    const grid = root.querySelector('[role=grid]') as HTMLElement
    expect(grid.querySelector(':scope > p')).toBeNull()
    const empty = grid.querySelector('.pcal-tl-empty') as HTMLElement
    expect(empty.closest('[role=row]')).not.toBeNull()
    expect(empty.getAttribute('role')).toBe('gridcell')
    expect(empty.textContent).toBe('No events')
  })
})

describe('the timeline grid keyboard', () => {
  it('one tab stop: a roving tabindex on the cells; the event buttons are reached from their cell', async () => {
    const { grid } = timeline(20)
    await flush()
    const stops = [...grid.querySelectorAll<HTMLElement>('button, [tabindex]')].filter((e) => e.getAttribute('tabindex') !== '-1')
    expect(stops).toHaveLength(1)
    expect(stops[0]!.getAttribute('role')).toBe('gridcell')
    // the cursor's day (the anchor date) of the first row
    expect(stops[0]!.dataset.date).toBe('2026-11-18')
    expect(stops[0]!.closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r1')
  })

  it('arrows move the cell, Home and End the day, Ctrl+Home and Ctrl+End the row; Enter goes into the cell, Escape back', async () => {
    const { grid } = timeline(5)
    await flush()
    const focused = (): HTMLElement => document.activeElement as HTMLElement
    const cell = (): HTMLElement => grid.querySelector<HTMLElement>('[role=gridcell][tabindex="0"]')!
    cell().focus()
    key(focused(), 'ArrowRight')
    expect(focused().dataset.date).toBe('2026-11-19')
    key(focused(), 'ArrowDown')
    expect(focused().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r2')
    key(focused(), 'Home')
    expect(focused().dataset.date).toBe('2026-11-15')
    key(focused(), 'End')
    expect(focused().dataset.date).toBe('2026-11-21')
    key(focused(), 'End', { ctrlKey: true })
    expect(focused().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r5')
    key(focused(), 'Home', { ctrlKey: true })
    expect(focused().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r1')
    key(focused(), 'Home')
    key(focused(), 'ArrowLeft')
    expect(focused().dataset.date).toBe('2026-11-15')
    key(focused(), 'ArrowRight')
    key(focused(), 'ArrowRight')
    key(focused(), 'ArrowRight')
    expect(focused().dataset.date).toBe('2026-11-18')
    key(focused(), 'Enter')
    expect(focused().matches('button.pcal-event')).toBe(true)
    key(focused(), 'Escape')
    expect(focused().getAttribute('role')).toBe('gridcell')
    expect(focused().dataset.date).toBe('2026-11-18')
    // exactly one tab stop after the moves
    expect([...grid.querySelectorAll('[role=gridcell]')].filter((e) => e.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('a row outside the window is drawn before it is focused', async () => {
    const { grid } = timeline(200)
    await flush()
    const focused = (): HTMLElement => document.activeElement as HTMLElement
    grid.querySelector<HTMLElement>('[role=gridcell][tabindex="0"]')!.focus()
    key(focused(), 'End', { ctrlKey: true })
    await flush()
    expect(focused().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r200')
    expect(focused().closest('.pcal-tl-row')!.getAttribute('aria-rowindex')).toBe('201')
  })

  it('Enter on an empty cell selects that day of that resource', async () => {
    const selected: unknown[] = []
    const { grid } = timeline(3, { onSelect: (s: unknown) => void selected.push(s) })
    await flush()
    const focused = (): HTMLElement => document.activeElement as HTMLElement
    grid.querySelector<HTMLElement>('[role=gridcell][tabindex="0"]')!.focus()
    key(focused(), 'ArrowRight')
    key(focused(), 'Enter')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatchObject({ resourceId: 'r1', allDay: false })
    expect(String((selected[0] as { start: string }).start).slice(0, 10)).toBe('2026-11-19')
  })
})
