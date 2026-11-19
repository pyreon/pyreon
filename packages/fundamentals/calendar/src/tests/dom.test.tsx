// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
/**
 * The views in happy-dom: the markup, the names, the keyboard, focus, the slots and the words, driven through real DOM events
 * on the mounted components. happy-dom has no layout, so nothing here asserts a size or a position; the real-layout evidence
 * (block heights, spans, right-to-left placement, axe) stays in `views.browser.test.tsx`.
 */
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Calendar, CalendarToolbar, DayView, MonthView, TimeGridView, WeekView } from '../components'
import { createCalendar, defaultMessages } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'
import { capitalise } from '../messages'

const cleanups: (() => void)[] = []
const NOW = Date.UTC(2026, 10, 18, 11, 0) // 12:00 in Prague
const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })
const base: CalendarEvent[] = [ev('Design review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('Public holiday', '2026-11-17', '2026-11-18'), ev('Conference', '2026-11-16', '2026-11-19')]
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
/** One declared style property of an element (happy-dom normalises the style text, so compare properties, not the text). */
const css = (el: Element, name: string): string => (el as HTMLElement).style.getPropertyValue(name)

function render(node: VNodeChild, dir?: string): HTMLElement {
  const root = document.createElement('div')
  if (dir !== undefined) root.style.direction = dir
  document.body.append(root)
  const unmount = mount(node as never, root)
  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

function make(options: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}, dir?: string) {
  const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'month', ...options })
  const root = render(<Calendar calendar={calendar} {...props} />, dir)

  return { calendar, root }
}

const cell = (root: HTMLElement, date: string): HTMLElement => root.querySelector<HTMLElement>(`.pcal-day[data-date="${date}"]`)!
const slot = (root: HTMLElement, date: string, minute: number): HTMLElement => root.querySelector<HTMLElement>(`.pcal-slot[data-date="${date}"][data-minute="${minute}"]`)!
const live = (root: HTMLElement): string => root.querySelector('.pcal-live')!.textContent ?? ''
const tabStops = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('[role=gridcell][tabindex="0"]')].map((c) => `${c.dataset.date}${c.dataset.minute === undefined ? '' : `@${c.dataset.minute}`}`)

/** Press a key on the focused element (or `on`) as a browser would: a bubbling, cancelable keydown. Returns whether it was handled. */
function press(key: string, init: KeyboardEventInit = {}, on: Element | null = document.activeElement): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  on!.dispatchEvent(event)

  return event.defaultPrevented
}

const focused = (): string => {
  const el = document.activeElement as HTMLElement

  return `${el.dataset.date ?? ''}${el.dataset.minute === undefined ? '' : `@${el.dataset.minute}`}`
}

beforeEach(() => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  setLocale('en-GB')
  vi.restoreAllMocks()
})

describe('the month view', () => {
  it('is a labelled grid of weekday headers and day cells; today, the outside days and the weekend are in the markup and the names', () => {
    const { root } = make()
    expect(root.querySelector('[role=grid]')!.getAttribute('aria-label')).toBe('Calendar, November 2026')
    expect([...root.querySelectorAll('[role=columnheader]')].map((h) => h.getAttribute('aria-label'))).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect([...root.querySelectorAll('.pcal-weekday span')].map((h) => h.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(root.querySelectorAll('.pcal-week')).toHaveLength(6)
    expect(root.querySelectorAll('.pcal-day')).toHaveLength(42)
    const today = cell(root, '2026-11-18')
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(today.hasAttribute('data-today')).toBe(true)
    expect(today.querySelector('.pcal-sr')!.textContent).toBe('Wednesday 18 November, Today')
    expect(today.querySelector('.pcal-day-head')!.textContent).toBe('18')
    expect(cell(root, '2026-11-19').querySelector('.pcal-sr')!.textContent).toBe('Thursday 19 November')
    expect(cell(root, '2026-11-19').hasAttribute('aria-current')).toBe(false)
    expect(cell(root, '2026-10-27').hasAttribute('data-outside')).toBe(true)
    expect(cell(root, '2026-11-02').hasAttribute('data-outside')).toBe(false)
    expect(cell(root, '2026-11-21').hasAttribute('data-weekend')).toBe(true)
    expect(cell(root, '2026-11-20').hasAttribute('data-weekend')).toBe(false)
    expect(root.querySelectorAll('[aria-current=date]')).toHaveLength(1)
  })

  it('puts events as labelled buttons in the cell they start in, with their span, lane and continuation in the markup', () => {
    const { root } = make({ events: () => [...base, ev('long', '2026-11-01', '2026-12-20')] })
    const review = root.querySelector<HTMLElement>('[data-key^="Design review"]')!
    expect(review.tagName).toBe('BUTTON')
    expect(review.getAttribute('aria-label')).toBe('Design review, Wednesday 18 November, 14:00 – 15:00')
    expect(review.closest('.pcal-day')!.getAttribute('data-date')).toBe('2026-11-18')
    expect(review.textContent).toBe('Design review')
    expect(review.hasAttribute('data-all-day')).toBe(false)
    const conf = root.querySelector<HTMLElement>('[data-key^="Conference"]')!
    expect(conf.getAttribute('aria-label')).toBe('Conference, Monday 16 November – Wednesday 18 November, all day')
    expect(conf.hasAttribute('data-all-day')).toBe(true)
    expect(css(conf, '--pcal-span')).toBe('3')
    expect(css(conf, '--pcal-lane')).toBe('1')
    // a long event: one button per week row, each continuing from and into its neighbours except the first and the last
    const long = [...root.querySelectorAll<HTMLElement>('[data-key^="long"]')]
    expect(long).toHaveLength(6)
    expect(long[0]!.hasAttribute('data-continues-before')).toBe(false) // it really starts on Sunday 1 November, in the first row
    expect(long.slice(1).every((b) => b.hasAttribute('data-continues-before'))).toBe(true)
    expect(long.slice(0, -1).every((b) => b.hasAttribute('data-continues-after'))).toBe(true)
    expect(long.map((b) => b.closest('.pcal-day')!.getAttribute('data-date'))).toEqual(['2026-11-01', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(long.at(-1)!.hasAttribute('data-continues-after')).toBe(true)
  })

  it('a long event is flagged as continuing where a week row cuts it, not where it really starts or ends', () => {
    const { root } = make({ events: () => [ev('trip', '2026-11-20', '2026-11-25')] })
    const parts = [...root.querySelectorAll<HTMLElement>('[data-key^="trip"]')]
    expect(parts.map((b) => [b.closest('.pcal-day')!.getAttribute('data-date'), b.hasAttribute('data-continues-before'), b.hasAttribute('data-continues-after')])).toEqual([
      ['2026-11-20', false, true],
      ['2026-11-23', true, false],
    ])
  })

  it("passes an event's colour through as a CSS variable only when it is a plain colour", () => {
    const { root } = make({ events: () => [ev('red', '2026-11-18T09:00', '2026-11-18T10:00', { color: 'rgb(200, 0, 0)' }), ev('evil', '2026-11-19T09:00', '2026-11-19T10:00', { color: 'red;background:url(x)' })] })
    expect(css(root.querySelector('[data-key^="red"]')!, '--pcal-event')).toBe('rgb(200, 0, 0)')
    expect(css(root.querySelector('[data-key^="evil"]')!, '--pcal-event')).toBe('')
    expect(root.querySelector('[data-key^="evil"]')!.getAttribute('style')).not.toContain('url')
  })

  it('marks a recurring occurrence', () => {
    const { root } = make({ events: () => [ev('standup', '2026-11-16T09:00', '2026-11-16T09:15', { recurrence: { every: 'day', start: '2026-11-16T09:00', count: 3 } as never })] })
    const parts = [...root.querySelectorAll<HTMLElement>('[data-key^="standup"]')]
    expect(parts.map((p) => p.closest('.pcal-day')!.getAttribute('data-date'))).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
    expect(parts.every((p) => p.hasAttribute('data-recurring'))).toBe(true)
  })

  it('has exactly one tab stop, the cursor, and it follows setCursor', async () => {
    const { root, calendar } = make()
    expect(tabStops(root)).toEqual(['2026-11-18'])
    calendar.setCursor('2026-11-20')
    expect(tabStops(root)).toEqual(['2026-11-20'])
    // moving the cursor out of the window moves the window
    calendar.setCursor('2027-01-04')
    expect(calendar.title()).toBe('January 2027')
    expect(tabStops(root)).toEqual(['2027-01-04'])
  })

  it('keyboard: the arrows, Home, End, PageUp, PageDown and Shift+PageDown move the focused cell, and the month follows it', async () => {
    const { root, calendar } = make()
    cell(root, '2026-11-18').focus()
    const step = async (key: string, init: KeyboardEventInit = {}): Promise<string> => {
      expect(press(key, init)).toBe(true)
      await flush()

      return focused()
    }
    expect(await step('ArrowRight')).toBe('2026-11-19')
    expect(await step('ArrowDown')).toBe('2026-11-26')
    expect(await step('ArrowLeft')).toBe('2026-11-25')
    expect(await step('ArrowUp')).toBe('2026-11-18')
    expect(await step('Home')).toBe('2026-11-16')
    expect(await step('End')).toBe('2026-11-22')
    expect(await step('PageDown')).toBe('2026-12-22')
    expect(calendar.title()).toBe('December 2026')
    expect(live(root)).toBe('December 2026, Month')
    expect(root.querySelector('[role=grid]')!.getAttribute('aria-label')).toBe('Calendar, December 2026')
    expect(await step('PageUp')).toBe('2026-11-22')
    expect(await step('PageDown', { shiftKey: true })).toBe('2027-11-22')
    expect(calendar.title()).toBe('November 2027')
    expect(tabStops(root)).toEqual(['2027-11-22'])
    // a key the grid does not use is left to the browser
    expect(press('a')).toBe(false)
    expect(press('ArrowRight', { ctrlKey: true })).toBe(false)
  })

  it('keyboard: Shift with the arrows selects a range of days, Enter confirms it, Escape clears it, and a second Escape is left alone', async () => {
    const onSelect = vi.fn()
    const { root, calendar } = make({ onSelect })
    cell(root, '2026-11-18').focus()
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })
    await flush()
    expect(calendar.selection()).toEqual({ start: '2026-11-18', end: '2026-11-21', allDay: true })
    expect(['2026-11-18', '2026-11-19', '2026-11-20'].map((d) => cell(root, d).getAttribute('aria-selected'))).toEqual(['true', 'true', 'true'])
    expect(cell(root, '2026-11-20').hasAttribute('data-selected')).toBe(true)
    expect(cell(root, '2026-11-21').getAttribute('aria-selected')).toBe('false')
    expect(cell(root, '2026-11-17').getAttribute('aria-selected')).toBe('false')
    expect(onSelect).not.toHaveBeenCalled()
    expect(press('Enter')).toBe(true)
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-18', end: '2026-11-21', allDay: true })
    // a plain arrow drops the anchor: the next Shift+arrow starts a new range at the cursor
    press('ArrowLeft')
    expect(calendar.cursor().date).toBe('2026-11-19')
    press('ArrowLeft', { shiftKey: true })
    expect(calendar.selection()).toEqual({ start: '2026-11-18', end: '2026-11-20', allDay: true })
    expect(press('Escape')).toBe(true)
    expect(calendar.selection()).toBeNull()
    expect(cell(root, '2026-11-19').getAttribute('aria-selected')).toBe('false')
    expect(press('Escape')).toBe(false)
    // Space selects the focused day on its own
    expect(press(' ')).toBe(true)
    expect(calendar.selection()).toEqual({ start: '2026-11-18', end: '2026-11-19', allDay: true })
  })

  it('keyboard: a calendar that is not selectable moves but neither selects nor extends', () => {
    const onSelect = vi.fn()
    const { root, calendar } = make({ onSelect, selectable: false })
    cell(root, '2026-11-18').focus()
    expect(press('Enter')).toBe(false)
    expect(press('ArrowRight', { shiftKey: true })).toBe(true)
    expect(calendar.cursor().date).toBe('2026-11-19')
    expect(calendar.selection()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keys pressed on an event button do not move the grid, but Escape still clears the selection', () => {
    const { root, calendar } = make()
    calendar.selectDay('2026-11-20')
    const button = root.querySelector<HTMLElement>('[data-key^="Design review"]')!
    button.focus()
    expect(press('ArrowRight')).toBe(false)
    expect(calendar.cursor().date).toBe('2026-11-18')
    expect(document.activeElement).toBe(button)
    expect(press('Escape')).toBe(true)
    expect(calendar.selection()).toBeNull()
  })

  it('right to left: Left and Right swap', async () => {
    const { root, calendar } = make({}, {}, 'rtl')
    cell(root, '2026-11-18').focus()
    press('ArrowRight')
    expect(calendar.cursor().date).toBe('2026-11-17')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(calendar.cursor().date).toBe('2026-11-19')
  })

  it('hidden weekdays are left out of the rows and skipped by the arrows', () => {
    const { root, calendar } = make({ hiddenDays: [6, 7] })
    calendar.setCursor('2026-11-20')
    expect(root.querySelectorAll('[role=columnheader]')).toHaveLength(5)
    expect(css(root.querySelector('[role=grid]')!, '--pcal-days')).toBe('5')
    expect(css(root.querySelector('[role=grid]')!, '--pcal-capacity')).toBe('3')
    cell(root, '2026-11-20').focus()
    press('ArrowRight')
    expect(calendar.cursor().date).toBe('2026-11-23')
  })

  it('a click on a day moves the cursor there and selects it; a click on an event reports it and selects nothing', () => {
    const onSelect = vi.fn()
    const onEventClick = vi.fn()
    const { root, calendar } = make({ onSelect, onEventClick })
    cell(root, '2026-11-24').click()
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-24', end: '2026-11-25', allDay: true })
    expect(calendar.cursor().date).toBe('2026-11-24')
    expect(tabStops(root)).toEqual(['2026-11-24'])
    onSelect.mockClear()
    root.querySelector<HTMLElement>('[data-key^="Design review"]')!.click()
    expect(onEventClick).toHaveBeenCalledTimes(1)
    expect(onEventClick.mock.calls[0]![0].id).toBe('Design review')
    expect(onEventClick.mock.calls[0]![1].key).toBe('Design review:2026-11-18T14:00')
    expect(onSelect).not.toHaveBeenCalled()
    expect(calendar.cursor().date).toBe('2026-11-24')
  })

  it('"+N more": the default text, the count per day, its lane, and onMore with the date; no onMore is not an error', () => {
    const many = Array.from({ length: 5 }, (_, i) => ev(`e${i}`, '2026-11-18T09:00', '2026-11-18T10:00'))
    const onMore = vi.fn()
    const onSelect = vi.fn()
    const { root } = make({ events: () => many, monthCapacity: 2, onSelect }, { onMore })
    const more = root.querySelector<HTMLElement>('.pcal-more')!
    expect(more.textContent).toBe('3 more')
    expect(css(more, '--pcal-lane')).toBe('2')
    expect(more.closest('.pcal-day')!.getAttribute('data-date')).toBe('2026-11-18')
    expect(root.querySelectorAll('.pcal-more')).toHaveLength(1)
    expect(cell(root, '2026-11-18').querySelectorAll('.pcal-event')).toHaveLength(2)
    // the week with the "+N more" row has one more lane
    expect(css(more.closest('.pcal-week')!, '--pcal-lanes')).toBe('3')
    expect(css(cell(root, '2026-11-02').closest('.pcal-week')!, '--pcal-lanes')).toBe('0')
    more.click()
    expect(onMore).toHaveBeenCalledWith('2026-11-18', more)
    expect(onSelect).not.toHaveBeenCalled()
    const bare = make({ events: () => many, monthCapacity: 2 })
    expect(() => bare.root.querySelector<HTMLElement>('.pcal-more')!.click()).not.toThrow()
  })

  it('the render slots: renderEvent gets the occurrence, its label and the continuation; renderDay the cell; renderMore the count and the date', () => {
    const many = Array.from({ length: 4 }, (_, i) => ev(`e${i}`, '2026-11-18T09:00', '2026-11-18T10:00'))
    const renderEvent = vi.fn((c: { occurrence: { title: string }; label: string; continuesBefore: boolean; continuesAfter: boolean }) => <i class="mine">{c.occurrence.title.toUpperCase()}</i>)
    const renderDay = vi.fn((c: { date: string; inMonth: boolean }) => <b>{c.inMonth ? c.date.slice(8) : '-'}</b>)
    const renderMore = vi.fn((n: number, date: string) => `${n}@${date}`)
    const { root } = make({ events: () => [...many, ev('trip', '2026-11-20', '2026-11-25')], monthCapacity: 2 }, { renderEvent, renderDay, renderMore })
    expect(root.querySelector('[data-key^="e0"] .mine')!.textContent).toBe('E0')
    expect(renderEvent.mock.calls.find((c) => c[0].occurrence.title === 'e0')![0].label).toBe('e0, Wednesday 18 November, 09:00 – 10:00')
    const trip = renderEvent.mock.calls.filter((c) => c[0].occurrence.title === 'trip').map((c) => [c[0].continuesBefore, c[0].continuesAfter])
    expect(trip).toEqual([
      [false, true],
      [true, false],
    ])
    expect(cell(root, '2026-11-18').querySelector('.pcal-day-head')!.textContent).toBe('18')
    expect(cell(root, '2026-10-26').querySelector('.pcal-day-head')!.textContent).toBe('-')
    expect(renderDay).toHaveBeenCalledTimes(42)
    expect(root.querySelector('.pcal-more')!.textContent).toBe('2@2026-11-18')
    expect(renderMore).toHaveBeenCalledWith(2, '2026-11-18')
  })

  it('a changed event re-renders its button; the weeks and their cells are kept across a change and across navigation and back', async () => {
    const events = signal<CalendarEvent[]>([ev('a', '2026-11-18T09:00', '2026-11-18T10:00')])
    const layoutRow = vi.fn()
    const { root, calendar } = make({ events: () => events(), instrument: { layoutRow } })
    const week = cell(root, '2026-11-18').closest('.pcal-week')!
    layoutRow.mockClear()
    events.set([ev('a', '2026-11-19T09:00', '2026-11-19T10:00')])
    expect(layoutRow.mock.calls.map((c) => c[0])).toEqual(['2026-11-16'])
    expect(cell(root, '2026-11-19').querySelector('[data-key^="a"]')).not.toBeNull()
    expect(cell(root, '2026-11-18').querySelector('[data-key^="a"]')).toBeNull()
    expect(cell(root, '2026-11-18').closest('.pcal-week')).toBe(week)
    calendar.next()
    calendar.previous()
    expect(calendar.title()).toBe('November 2026')
    expect(cell(root, '2026-11-19').querySelector('[data-key^="a"]')).not.toBeNull()
  })

  it('focus follows the cursor only while it is inside the grid', async () => {
    const { root, calendar } = make()
    cell(root, '2026-11-18').focus()
    calendar.setCursor('2026-11-20')
    await flush()
    expect(focused()).toBe('2026-11-20')
    // focus leaves the grid for the toolbar: moving the cursor (or the month) does not take it back
    const next = root.querySelector<HTMLElement>('.pcal-next')!
    next.focus()
    calendar.setCursor('2026-11-24')
    await flush()
    expect(document.activeElement).toBe(next)
    next.click()
    await flush()
    expect(calendar.title()).toBe('December 2026')
    expect(document.activeElement).toBe(next)
  })

  it('focus moving from one cell to another stays inside the grid and keeps following', async () => {
    const { root, calendar } = make()
    cell(root, '2026-11-18').focus()
    cell(root, '2026-11-19').focus()
    calendar.setCursor('2026-11-25')
    await flush()
    expect(focused()).toBe('2026-11-25')
  })

  it('a month on its own, with a class', () => {
    const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW })
    const root = render(<MonthView calendar={calendar} class="mine" />)
    expect(root.querySelector('.mine[role=grid]')).not.toBeNull()
    expect(root.querySelector('.pcal-month')).toBeNull()
  })
})

describe('the time grid', () => {
  /** top, height, inline start, inline size, slots and colour of a block. */
  const box = (el: Element): string[] => ['top', 'height', 'inset-inline-start', 'inline-size', '--pcal-slots', '--pcal-event'].map((p) => css(el, p))
  const week = (extra: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}, dir?: string) => make({ view: 'week', ...extra }, props, dir)

  it('has a header row, an all-day row, a gutter of times and 48 slot rows of 7 days', () => {
    const { root, calendar } = week()
    const grid = root.querySelector('[role=grid]')!
    expect(calendar.title()).toMatch(/^16\s?–\s?22 Nov 2026$/)
    expect(grid.getAttribute('aria-label')).toBe(`Calendar, time grid, ${calendar.title()}`)
    expect(grid.getAttribute('aria-colcount')).toBe('8')
    expect(css(grid, '--pcal-columns')).toBe('7')
    expect(root.querySelectorAll('.pcal-colhead')).toHaveLength(7)
    expect([...root.querySelectorAll('.pcal-colhead-weekday')].map((e) => e.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect([...root.querySelectorAll('.pcal-colhead-date')].map((e) => e.textContent)).toEqual(['16', '17', '18', '19', '20', '21', '22'])
    const today = root.querySelector('.pcal-colhead[data-today]')!
    expect(today.getAttribute('aria-label')).toBe('Wednesday 18 November')
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(root.querySelectorAll('.pcal-colhead[data-weekend]')).toHaveLength(2)
    expect(root.querySelector('.pcal-corner .pcal-sr')!.textContent).toBe('Calendar, time grid')
    expect(root.querySelectorAll('.pcal-row')).toHaveLength(48)
    expect(root.querySelectorAll('.pcal-row[data-hour]')).toHaveLength(24)
    expect(root.querySelectorAll('.pcal-slot')).toHaveLength(48 * 7)
    expect([...root.querySelectorAll('.pcal-row .pcal-gutter-cell span')].slice(0, 3).map((e) => e.textContent)).toEqual(['00:00', '00:30', '01:00'])
    expect(root.querySelector('.pcal-allday .pcal-gutter-cell')!.textContent).toBe('All day')
    expect([...root.querySelectorAll('.pcal-allday-event')].map((e) => e.getAttribute('data-key')!.split(':')[0])).toEqual(['Conference', 'Public holiday'])
    expect(css(root.querySelector('.pcal-allday')!, '--pcal-lanes')).toBe('2')
    expect(root.querySelector('.pcal-allday-cell[data-date="2026-11-16"] .pcal-sr')!.textContent).toBe('Monday 16 November, All day')
    expect(slot(root, '2026-11-18', 540).querySelector('.pcal-sr')!.textContent).toBe('Wednesday 18 November, 09:00')
  })

  it('places a block in the slot it starts in, sized by the packing, labelled, with its time for CSS', () => {
    const { root } = week({ events: () => [ev('review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('short', '2026-11-18T14:10', '2026-11-18T14:40', { color: '#0a0' })] })
    const block = root.querySelector<HTMLElement>('[data-key^="review"]')!
    expect(block.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 840))
    expect(block.getAttribute('aria-label')).toBe('review, Wednesday 18 November, 14:00 – 15:00')
    // two columns: the first takes the left half, two slots tall
    expect(box(block)).toEqual(['0.0000%', '200.0000%', '0.0000%', '50.0000%', '2.000', ''])
    expect(block.hasAttribute('data-short')).toBe(false)
    expect(block.querySelector('.pcal-block-time')!.getAttribute('data-time')).toBe('14:00')
    const short = root.querySelector<HTMLElement>('[data-key^="short"]')!
    expect(short.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 840))
    expect(short.hasAttribute('data-short')).toBe(true)
    expect(box(short)).toEqual(['33.3333%', '100.0000%', '50.0000%', '50.0000%', '1.000', '#0a0'])
  })

  it('an event across midnight is a block on each day, flagged where it continues, and says both days', () => {
    const { root } = week({ events: () => [ev('night', '2026-11-18T22:00', '2026-11-19T02:00')] })
    const parts = [...root.querySelectorAll<HTMLElement>('[data-key^="night"]')]
    expect(parts.map((p) => [p.closest('.pcal-slot')!.getAttribute('data-date'), p.closest('.pcal-slot')!.getAttribute('data-minute'), p.hasAttribute('data-continues-before'), p.hasAttribute('data-continues-after')])).toEqual([
      ['2026-11-19', '0', true, false],
      ['2026-11-18', '1320', false, true],
    ]) // in document order: the rows come first, so midnight's slot is above 22:00
    expect(parts[1]!.getAttribute('aria-label')).toBe('night, Wednesday 18 November 22:00 – Thursday 19 November 02:00')
  })

  it('draws the now line in the slot the clock is in, only on today; shades the hours that are open and closed', () => {
    const { root } = week({ businessHours: { 3: [{ from: '09:00', to: '17:00' }] } })
    const now = root.querySelectorAll<HTMLElement>('.pcal-now')
    expect(now).toHaveLength(1)
    expect(now[0]!.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 720))
    expect(css(now[0]!, 'top')).toBe('0.000%')
    expect(slot(root, '2026-11-18', 540).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-18', 1000 - 10).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-18', 510).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-18', 1020).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-17', 600).getAttribute('data-business')).toBe('closed')
    const plain = week()
    expect(slot(plain.root, '2026-11-18', 600).hasAttribute('data-business')).toBe(false)
    // the slot at the closing time is closed even where the fractions do not add up exactly (30/1440 + 210/1440 > 240/1440 in floating point)
    const early = week({ businessHours: { 3: [{ from: '00:30', to: '04:00' }] } })
    expect(slot(early.root, '2026-11-18', 210).getAttribute('data-business')).toBe('open')
    expect(slot(early.root, '2026-11-18', 240).getAttribute('data-business')).toBe('closed')
  })

  it('the now line moves with the clock, inside its slot', () => {
    const clock = signal(Date.UTC(2026, 10, 18, 11, 15)) // 12:15
    const { root } = week({ now: () => clock() })
    expect(css(root.querySelector('.pcal-now')!, 'top')).toBe('50.000%')
    expect(root.querySelector('.pcal-now')!.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 720))
    clock.set(Date.UTC(2026, 10, 18, 11, 45))
    expect(root.querySelector('.pcal-now')!.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 750))
    expect(root.querySelectorAll('.pcal-now')).toHaveLength(1)
  })

  it('a business calendar: a holiday and the weekend are closed, an overnight window spills into the next morning', () => {
    const { root } = week({
      businessHours: { hours: { 1: [{ from: '20:00', to: '02:00' }], 2: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '17:00' }], 6: [{ from: '09:00', to: '12:00' }] }, weekend: [6, 7], holidays: ['2026-11-18'] } as never,
    })
    expect(slot(root, '2026-11-16', 1230).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-17', 60).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-17', 150).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-17', 600).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-18', 600).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-21', 600).getAttribute('data-business')).toBe('closed')
    // holidays as a function; a calendar with no hours shades nothing
    const fn = week({ businessHours: { hours: { 4: [{ from: '09:00', to: '17:00' }] }, holidays: (d: string) => d === '2026-11-19' } as never })
    expect(slot(fn.root, '2026-11-19', 600).getAttribute('data-business')).toBe('closed')
    const none = week({ businessHours: { weekend: [6, 7] } as never })
    expect(slot(none.root, '2026-11-19', 600).hasAttribute('data-business')).toBe(false)
  })

  it('dayStart and dayEnd cut the grid; a slot of an hour makes hour rows', () => {
    const { root } = week({ dayStart: '08:00', dayEnd: '18:00' })
    expect(root.querySelectorAll('.pcal-row')).toHaveLength(20)
    expect(root.querySelector('.pcal-slot')!.getAttribute('data-minute')).toBe('480')
    const hours = week({ slot: { hours: 1 } })
    expect(hours.root.querySelectorAll('.pcal-row')).toHaveLength(24)
    expect(hours.root.querySelectorAll('.pcal-row:not([data-hour])')).toHaveLength(0)
  })

  it('keyboard: the arrows move by slot and day, Home and End to the first and last slot, PageUp and PageDown by a week of columns', async () => {
    const { root, calendar } = week()
    calendar.setCursor('2026-11-18', 540)
    slot(root, '2026-11-18', 540).focus()
    const step = async (key: string, init: KeyboardEventInit = {}): Promise<string> => {
      expect(press(key, init)).toBe(true)
      await flush()

      return focused()
    }
    expect(await step('ArrowDown')).toBe('2026-11-18@570')
    expect(await step('ArrowUp')).toBe('2026-11-18@540')
    expect(await step('ArrowRight')).toBe('2026-11-19@540')
    expect(await step('ArrowLeft')).toBe('2026-11-18@540')
    expect(await step('End')).toBe('2026-11-18@1410')
    expect(await step('Home')).toBe('2026-11-18@0')
    expect(await step('PageDown')).toBe('2026-11-22@0')
    expect(await step('PageUp')).toBe('2026-11-16@0')
    expect(tabStops(root)).toEqual(['2026-11-16@0'])
  })

  it('keyboard in a window cut by dayStart and dayEnd stays inside it', async () => {
    const { root, calendar } = week({ dayStart: '08:00', dayEnd: '18:00' })
    calendar.setCursor('2026-11-18', 480)
    slot(root, '2026-11-18', 480).focus()
    press('ArrowUp')
    expect(calendar.cursor()).toEqual({ date: '2026-11-18', minute: 480 })
    press('End')
    expect(calendar.cursor()).toEqual({ date: '2026-11-18', minute: 1050 })
    press('ArrowDown')
    expect(calendar.cursor()).toEqual({ date: '2026-11-18', minute: 1050 })
  })

  it('keyboard: Shift selects a range of slots, Enter confirms it, Escape clears it', async () => {
    const onSelect = vi.fn()
    const { root, calendar } = week({ onSelect })
    calendar.setCursor('2026-11-18', 540)
    slot(root, '2026-11-18', 540).focus()
    press('ArrowDown', { shiftKey: true })
    press('ArrowDown', { shiftKey: true })
    expect(calendar.selection()).toEqual({ start: '2026-11-18T09:00', end: '2026-11-18T10:30', allDay: false })
    expect([540, 570, 600, 630].map((m) => slot(root, '2026-11-18', m).getAttribute('aria-selected'))).toEqual(['true', 'true', 'true', 'false'])
    expect(slot(root, '2026-11-18', 600).hasAttribute('data-selected')).toBe(true)
    // selecting upwards puts the corners in order
    press('ArrowUp', { shiftKey: true })
    press('ArrowUp', { shiftKey: true })
    press('ArrowUp', { shiftKey: true })
    expect(calendar.selection()).toEqual({ start: '2026-11-18T08:30', end: '2026-11-18T09:30', allDay: false })
    press('Enter')
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-18T08:30', end: '2026-11-18T09:30', allDay: false })
    press('Escape')
    expect(calendar.selection()).toBeNull()
    expect(slot(root, '2026-11-18', 540).getAttribute('aria-selected')).toBe('false')
  })

  it('a key pressed on a block does not move the grid, Escape does clear; right to left swaps Left and Right', () => {
    const { root, calendar } = week({}, {}, 'rtl')
    calendar.setCursor('2026-11-18', 540)
    calendar.selectSlot('2026-11-18', 540)
    const block = root.querySelector<HTMLElement>('.pcal-block')!
    block.focus()
    expect(press('ArrowDown')).toBe(false)
    expect(calendar.cursor()).toEqual({ date: '2026-11-18', minute: 540 })
    expect(press('Escape')).toBe(true)
    slot(root, '2026-11-18', 540).focus()
    press('ArrowRight')
    expect(calendar.cursor().date).toBe('2026-11-17')
  })

  it('a click on a slot moves the cursor there and selects it; a click on a block or an all-day event reports it', () => {
    const onSelect = vi.fn()
    const onEventClick = vi.fn()
    const { root, calendar } = week({ onSelect, onEventClick })
    slot(root, '2026-11-19', 600).click()
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-19T10:00', end: '2026-11-19T10:30', allDay: false })
    expect(calendar.cursor()).toEqual({ date: '2026-11-19', minute: 600 })
    expect(slot(root, '2026-11-19', 600).getAttribute('aria-selected')).toBe('true')
    onSelect.mockClear()
    root.querySelector<HTMLElement>('.pcal-block')!.click()
    root.querySelector<HTMLElement>('.pcal-allday-event')!.click()
    expect(onEventClick.mock.calls.map((c) => c[0].id)).toEqual(['Design review', 'Conference'])
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renderEvent fills blocks and all-day events', () => {
    const renderEvent = vi.fn((c: { occurrence: { title: string }; label: string }) => <em>{`<${c.occurrence.title}>`}</em>)
    const { root } = week({}, { renderEvent })
    expect(root.querySelector('.pcal-block em')!.textContent).toBe('<Design review>')
    expect(root.querySelector('.pcal-allday-event em')!.textContent).toBe('<Conference>')
    expect(renderEvent.mock.calls.map((c) => c[0].label)).toContain('Conference, Monday 16 November – Wednesday 18 November, all day')
  })

  it('hidden weekdays leave their columns out; a day view has one column; days(n) has n', () => {
    expect(week({ hiddenDays: [6, 7] }).root.querySelectorAll('.pcal-colhead')).toHaveLength(5)
    expect(make({ view: 'day' }).root.querySelectorAll('.pcal-colhead')).toHaveLength(1)
    const three = make({ view: 'days', days: 3 })
    expect(three.root.querySelectorAll('.pcal-colhead')).toHaveLength(3)
    three.calendar.next()
    expect(three.calendar.range()).toEqual({ start: '2026-11-21', end: '2026-11-24' })
  })

  it('focus follows the cursor across a change of the shown days, and the old days are let go', async () => {
    const layoutDay = vi.fn()
    const { root, calendar } = week({ instrument: { layoutDay } })
    calendar.setCursor('2026-11-22', 600)
    slot(root, '2026-11-22', 600).focus()
    // the arrows stay inside the shown days (documented); moving the cursor past them moves the window
    press('ArrowRight')
    expect(calendar.cursor()).toEqual({ date: '2026-11-22', minute: 600 })
    calendar.setCursor('2026-11-23', 600)
    await flush()
    expect(calendar.range()).toEqual({ start: '2026-11-23', end: '2026-11-30' })
    expect(focused()).toBe('2026-11-23@600')
    expect(root.querySelector('.pcal-slot[data-date="2026-11-18"]')).toBeNull()
    layoutDay.mockClear()
    calendar.previous()
    expect(layoutDay).toHaveBeenCalledTimes(7)
  })

  it('WeekView, DayView and TimeGridView render the time grid of the calendar on their own', () => {
    const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week' })
    expect(render(<WeekView calendar={calendar} />).querySelectorAll('.pcal-colhead')).toHaveLength(7)
    const day = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'day' })
    expect(render(<DayView calendar={day} class="mine" />).querySelectorAll('.mine .pcal-colhead')).toHaveLength(1)
    expect(render(<TimeGridView calendar={day} />).querySelector('.pcal-timegrid')).not.toBeNull()
  })
})

describe('the calendar and its toolbar', () => {
  it('the toolbar: Today, Previous and Next with the names of the view, the title, and a view switch with aria-pressed', () => {
    const { root, calendar } = make()
    const toolbar = root.querySelector('[role=toolbar]')!
    expect(toolbar.getAttribute('aria-label')).toBe('Calendar')
    expect(root.querySelector('.pcal-today')!.textContent).toBe('Today')
    expect(root.querySelector('.pcal-prev')!.getAttribute('aria-label')).toBe('Last month')
    expect(root.querySelector('.pcal-next')!.getAttribute('aria-label')).toBe('Next month')
    expect(root.querySelector('.pcal-title')!.textContent).toBe('November 2026')
    expect([...root.querySelectorAll('.pcal-view')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Month', 'true'],
      ['Week', 'false'],
      ['Day', 'false'],
    ])
    root.querySelector<HTMLElement>('.pcal-next')!.click()
    expect(calendar.date()).toBe('2026-12-18')
    root.querySelector<HTMLElement>('.pcal-prev')!.click()
    root.querySelector<HTMLElement>('.pcal-prev')!.click()
    expect(calendar.date()).toBe('2026-10-18')
    root.querySelector<HTMLElement>('.pcal-today')!.click()
    expect(calendar.date()).toBe('2026-11-18')
    root.querySelector<HTMLElement>('.pcal-view[data-view=week]')!.click()
    expect(calendar.view()).toBe('week')
    expect(root.querySelector('.pcal-prev')!.getAttribute('aria-label')).toBe('Last week')
    expect(root.querySelector('.pcal-view[data-view=week]')!.getAttribute('aria-pressed')).toBe('true')
    expect(root.firstElementChild!.getAttribute('data-view')).toBe('week')
    expect(root.querySelector('[data-view=timegrid]')).not.toBeNull()
    expect(root.querySelector('.pcal-month')).toBeNull()
  })

  it('the switch offers the views it is given, in order, and none for an empty list; toolbar={false} leaves it out', () => {
    const own = make({}, { views: ['day', 'workWeek', 'month'] })
    expect([...own.root.querySelectorAll('.pcal-view')].map((b) => b.textContent)).toEqual(['Day', 'Work week', 'Month'])
    own.root.querySelector<HTMLElement>('.pcal-view[data-view=workWeek]')!.click()
    expect(own.root.querySelectorAll('.pcal-colhead')).toHaveLength(5)
    expect(make({}, { views: [] }).root.querySelector('.pcal-views')).toBeNull()
    const bare = make({}, { toolbar: false, class: 'cal' })
    expect(bare.root.querySelector('[role=toolbar]')).toBeNull()
    expect(bare.root.querySelector('.cal [role=grid]')).not.toBeNull()
  })

  it('a toolbar on its own, with a class; a view without a word uses its name', () => {
    const calendar = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, messages: { views: { day: '' } as never } })
    const root = render(<CalendarToolbar calendar={calendar} class="bar" views={['month', 'nope' as never]} />)
    expect(root.querySelector('.bar[role=toolbar]')).not.toBeNull()
    expect([...root.querySelectorAll('.pcal-view')].map((b) => b.textContent)).toEqual(['Month', 'nope'])
  })

  it('the live region is polite and says where navigation went, in the active locale; it says nothing at the start', () => {
    const { root, calendar } = make()
    const region = root.querySelector('.pcal-live')!
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(live(root)).toBe('')
    calendar.next()
    expect(live(root)).toBe('December 2026, Month')
    setLocale('cs')
    calendar.setView('week')
    expect(live(root)).toContain('Týden')
    expect(root.querySelector('.pcal-today')!.textContent).toBe('Dnes')
  })

  it('a view that is not part of this release shows the month', () => {
    for (const view of ['agenda', 'year', 'timeline'] as const) {
      const { root } = make({ view })
      expect(root.querySelector('[data-view=month]')).not.toBeNull()
    }
  })
})

describe('the words', () => {
  it('English: the counts and the edit announcements', () => {
    const m = defaultMessages('en-GB')
    expect([m.events(0), m.events(1), m.events(2), m.events(1200)]).toEqual(['no events', '1 event', '2 events', '1,200 events'])
    expect(m.more(3)).toBe('3 more')
    expect(m.selected('Wednesday')).toBe('Selected Wednesday')
    expect(m.moved('Review', 'Thursday')).toBe('Review moved to Thursday')
    expect(m.resized('Review', 'Thursday')).toBe('Review resized to Thursday')
    expect(m.grabbed('Review')).toBe('Review grabbed. Arrow keys move it, Shift with them resizes, Enter drops it, Escape cancels.')
    expect(m.cancelled('Review')).toBe('Review: change cancelled')
    expect(m.failed('Review')).toBe('Review: the change was not saved')
    expect(m.navigated('November 2026', 'month')).toBe('November 2026, Month')
    expect(m.navigated('November 2026', 'nope')).toBe('November 2026, nope')
    expect(m.recurringScope).toEqual({ this: 'This event', following: 'This and following events', all: 'All events' })
    expect([m.previous('year'), m.next('day'), m.previous('agenda'), m.next('days')]).toEqual(['Last year', 'Tomorrow', 'Last week', 'Tomorrow'])
  })

  it('another language: symbols for the counts, the platform words for the views, no English sentence', () => {
    const m = defaultMessages('cs-CZ')
    expect(m.more(3)).toBe('+3')
    expect(m.events(2)).toBe('2')
    expect(m.views.month).toBe('Měsíc')
    expect(m.views.workWeek).toBe('Pracovní týden')
    expect(m.allDayRow).toBe('Celý den')
    expect(m.monthGrid).toBe('Měsíc')
    expect(m.timeGrid).toBe('Týden, Den')
    expect(m.selected('středa')).toBe('středa')
    expect(m.moved('Porada', 'čtvrtek')).toBe('Porada: čtvrtek')
    expect(m.resized('Porada', 'čtvrtek')).toBe('Porada: čtvrtek')
    expect([m.grabbed('Porada'), m.cancelled('Porada'), m.failed('Porada')]).toEqual(['Porada', 'Porada', 'Porada'])
    // a language the table does not carry keeps the English words for what the platform has no source for
    const fi = defaultMessages('fi')
    expect(fi.allDay).toBe('all day')
    expect(fi.noEvents).toBe('No events')
  })

  it("falls back to English words when the engine lacks Intl.DisplayNames' date fields or Intl.RelativeTimeFormat", () => {
    vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => {
      throw new RangeError('unsupported type')
    })
    vi.spyOn(Intl, 'RelativeTimeFormat').mockImplementation(() => {
      throw new RangeError('unsupported')
    })
    const m = defaultMessages('de')
    expect(m.views.month).toBe('Month')
    expect(m.views.year).toBe('Year')
    expect(m.monthGrid).toBe('Month')
    expect(m.timeGrid).toBe('Week, Day')
    expect(m.today).toBe('Next')
    expect(m.previous('month')).toBe('Previous')
    expect(m.next('week')).toBe('Next')
  })

  it('capitalise: the first grapheme, in the locale; an empty text stays empty', () => {
    expect(capitalise('ísland', 'is')).toBe('Ísland')
    expect(capitalise('', 'en')).toBe('')
    expect(capitalise('i̇stanbul', 'tr')).toBe('İ̇stanbul')
    expect(capitalise('週', 'ja')).toBe('週')
  })

  it('the messages option replaces words: an object, or a function of the locale that is read again when the locale changes', () => {
    const fixed = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, messages: { today: 'Now', views: { month: 'M' }, recurringScope: { this: 'One', following: 'Rest', all: 'Every one' } } })
    expect(fixed.messages().today).toBe('Now')
    expect(fixed.messages().views.month).toBe('M')
    expect(fixed.messages().views.week).toBe('Week')
    expect(fixed.messages().recurringScope).toEqual({ this: 'One', following: 'Rest', all: 'Every one' })
    const byLocale = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, messages: (locale) => ({ today: locale === 'cs' ? 'Teď' : 'Now' }) })
    expect(byLocale.messages().today).toBe('Now')
    setLocale('cs')
    expect(byLocale.messages().today).toBe('Teď')
  })
})

describe('the calendar state', () => {
  it('titles each view; dates, zone, week start; the year view', () => {
    const cal = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, view: 'year', weekStart: 7, timeZone: () => 'America/New_York' })
    expect(cal.title()).toBe('2026')
    expect(cal.range()).toEqual({ start: '2026-01-01', end: '2027-01-01' })
    expect(cal.dates()).toHaveLength(365)
    expect(cal.timeZone()).toBe('America/New_York')
    expect(cal.weekStart()).toBe(7)
    cal.setView('day')
    expect(cal.title()).toMatch(/^Wednesday,? 18 November 2026$/)
    expect(cal.dates()).toEqual(['2026-11-18'])
    const ambient = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW })
    expect(ambient.weekStart()).toBe(1)
    setLocale('en-US')
    expect(ambient.weekStart()).toBe(7)
  })

  it('without a date it opens on today in its zone, from the clock', () => {
    const late = Date.UTC(2026, 10, 18, 23, 30) // already the 19th in Prague, still the 18th in New York
    expect(createCalendar({ events: () => [], now: () => late, timeZone: () => 'Europe/Prague' }).date()).toBe('2026-11-19')
    expect(createCalendar({ events: () => [], now: () => late, timeZone: () => 'America/New_York' }).date()).toBe('2026-11-18')
  })

  it('clearSelection drops the selection and the keyboard anchor', () => {
    const cal = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW })
    cal.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }), 'month')
    expect(cal.selection()).toEqual({ start: '2026-11-18', end: '2026-11-20', allDay: true })
    cal.clearSelection()
    expect(cal.selection()).toBeNull()
    // the anchor went with it: the next Shift+arrow starts from the cursor
    cal.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }), 'month')
    expect(cal.selection()).toEqual({ start: '2026-11-19', end: '2026-11-21', allDay: true })
  })

  it('a click on a key that is not shown reports nothing', () => {
    const onEventClick = vi.fn()
    const cal = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, onEventClick })
    cal.eventClick('nope:2026-11-18')
    expect(onEventClick).not.toHaveBeenCalled()
  })

  it('an event that starts before the window is still bucketed into the days it covers inside the window', () => {
    const cal = createCalendar({ events: () => [ev('long', '2026-11-10', '2026-11-18'), ev('timed', '2026-11-15T20:00', '2026-11-16T09:00')], date: '2026-11-18', now: () => NOW, view: 'week' })
    const grid = cal.timeGrid()
    expect(grid.allDay().lanes.flat().map((s) => [s.occurrenceKey.split(':')[0], s.startColumn, s.endColumn, s.continuesBefore])).toEqual([['long', 0, 1, true]])
    expect(grid.days[0]!.blocks().map((b) => [b.occurrenceKey.split(':')[0], b.startMinute, b.continuesBefore])).toEqual([['timed', 0, true]])
  })
})
