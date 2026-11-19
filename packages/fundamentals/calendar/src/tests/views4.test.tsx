// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
/**
 * The agenda, the year, the resource timeline and the "+N more" popover in happy-dom, driven through real DOM events (click,
 * focus, keydown, scroll, pointer events). Where the timeline's pointer layer needs geometry, `laneLayout()` injects it: every
 * `.pcal-tl-lane` is a 700 px wide box (100 px per shown day) at y = 100 + 40 per row, a bar is placed in its lane by its own
 * `inset-inline-start` / `inline-size` percentages, and `document.elementsFromPoint` (which happy-dom lacks) is defined over those
 * boxes. Real layout, sticky columns, real mouse input and axe stay in `views4.browser.test.tsx`.
 */
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaView, Calendar, DayPopover, TimelineView, YearView } from '../components'
import { applyEventChange, createCalendar, layoutAgenda, windowRows } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'

const NOW = Date.UTC(2026, 10, 18, 11, 0) // 12:00 in Prague
const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })
const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))
const cleanups: (() => void)[] = []

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
  const onEventClick = vi.fn()
  const onSelect = vi.fn()
  const onEventChange = vi.fn((_c: unknown): boolean => true)
  const calendar = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, onEventClick, onSelect, onEventChange, ...options } as CalendarOptions)
  const root = render(<Calendar calendar={calendar} toolbar={false} {...props} />, dir)

  return { calendar, root, onEventClick, onSelect, onEventChange }
}

const key = (on: Element, k: string, init: KeyboardEventInit = {}): boolean => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  on.dispatchEvent(e)

  return e.defaultPrevented
}

const css = (el: Element, name: string): string => (el as HTMLElement).style.getPropertyValue(name)

beforeEach(() => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.restoreAllMocks()
})

describe('the agenda', () => {
  const list = [ev('review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('holiday', '2026-11-18', '2026-11-19'), ev('trip', '2026-11-19', '2026-11-22'), ev('far', '2027-01-30T09:00', '2027-01-30T10:00', { color: '#c00' })]

  it('lists the days that have events, all-day first, a multi-day event on each of its days, today marked, as named buttons', () => {
    const { root, onEventClick, calendar } = make({ view: 'agenda', events: () => list })
    const region = root.querySelector('[role=region]')!
    expect(calendar.range()).toEqual({ start: '2026-11-18', end: '2026-12-18' })
    expect(region.getAttribute('aria-label')).toBe(`Agenda, ${calendar.title()}`)
    const days = [...root.querySelectorAll<HTMLElement>('.pcal-agenda-day')]
    expect(days.map((d) => d.dataset.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
    expect(days[0]!.hasAttribute('data-today')).toBe(true)
    expect(days[0]!.querySelector('.pcal-agenda-head')!.textContent).toBe('Wednesday 18 November, Today')
    expect(days[1]!.querySelector('.pcal-agenda-head')!.textContent).toBe('Thursday 19 November')
    const first = [...days[0]!.querySelectorAll<HTMLElement>('.pcal-agenda-event')]
    expect(first.map((b) => [b.textContent, b.dataset.time])).toEqual([
      ['holiday', 'all day'],
      ['review', '14:00 – 15:00'],
    ])
    expect(first[1]!.getAttribute('aria-label')).toBe('review, Wednesday 18 November, 14:00 – 15:00')
    // each day's box is its heading, its events and the gap (the stylesheet draws to the same numbers)
    expect(css(days[0]!, 'block-size')).toBe(`${40 + 2 * 44 + 8}px`)
    first[1]!.click()
    expect(onEventClick.mock.calls[0]![1].key).toBe('review:2026-11-18T14:00')
    // the 30-day window does not reach the far event; agendaDays does
    expect(root.querySelector('[data-key^="far"]')).toBeNull()
    const long = make({ view: 'agenda', agendaDays: 90, events: () => list })
    expect(css(long.root.querySelector('[data-key^="far"]')!, '--pcal-event')).toBe('#c00')
  })

  it('renderEvent says whether the event goes on from the day before or into the next (its exclusive end is not a day it is on)', () => {
    const renderEvent = vi.fn((c: { occurrence: { title: string }; continuesBefore: boolean; continuesAfter: boolean }) => `${c.occurrence.title}${c.continuesBefore ? '<' : ''}${c.continuesAfter ? '>' : ''}`)
    const { root } = make({ view: 'agenda', events: () => [...list, ev('night', '2026-11-25T22:00', '2026-11-27T00:00')] }, { renderEvent })
    expect([...root.querySelectorAll('[data-key^="trip"]')].map((b) => b.textContent)).toEqual(['trip>', 'trip<>', 'trip<'])
    expect([...root.querySelectorAll('[data-key^="night"]')].map((b) => b.textContent)).toEqual(['night>', 'night<'])
    expect([...root.querySelectorAll('[data-key^="review"]')].map((b) => b.textContent)).toEqual(['review'])
  })

  it('an empty agenda says so; the empty state changes with the events', () => {
    const events = signal<CalendarEvent[]>([])
    const { root } = make({ view: 'agenda', events: () => events() })
    expect(root.querySelector('.pcal-agenda-empty')!.textContent).toBe('No events')
    events.set(list)
    expect(root.querySelector('.pcal-agenda-empty')).toBeNull()
    expect(root.querySelectorAll('.pcal-agenda-day')).toHaveLength(4)
  })

  it('is windowed: only the days near the viewport are in the page, and scrolling brings the later ones in', () => {
    const many = Array.from({ length: 60 }, (_, i) => ev(`e${i}`, new Date(Date.UTC(2026, 10, 18 + i, 9)).toISOString().slice(0, 16), new Date(Date.UTC(2026, 10, 18 + i, 10)).toISOString().slice(0, 16)))
    const { root } = make({ view: 'agenda', agendaDays: 60, events: () => many })
    const region = root.querySelector<HTMLElement>('[role=region]')!
    const drawn = (): string[] => [...root.querySelectorAll<HTMLElement>('.pcal-agenda-day')].map((d) => d.dataset.date!)
    // 92 px per day, a 640 px viewport (happy-dom has no height, so the fallback), 2 days of overscan
    expect(css(root.querySelector('.pcal-agenda-space')!, 'block-size')).toBe(`${60 * 92}px`)
    expect(drawn()).toHaveLength(9)
    expect(drawn()[0]).toBe('2026-11-18')
    region.scrollTop = 92 * 30
    region.dispatchEvent(new Event('scroll'))
    expect(drawn()[0]).toBe('2026-12-16')
    expect(drawn()).toContain('2026-12-18')
    expect(css(root.querySelector('.pcal-agenda-window')!, 'transform')).toBe(`translateY(${92 * 28}px)`)
  })

  it('AgendaView on its own, with a class', () => {
    const calendar = createCalendar({ events: () => list, date: '2026-11-18', now: () => NOW, view: 'agenda' })
    expect(render(<AgendaView calendar={calendar} class="mine" />).querySelector('.mine[data-view=agenda]')).not.toBeNull()
  })

  it('layoutAgenda: no dates is no days; an event that starts before the window is listed from the first day', () => {
    const occ = createCalendar({ events: () => [ev('long', '2026-11-10', '2026-11-20')], date: '2026-11-18', now: () => NOW, view: 'agenda' }).occurrences()
    expect(layoutAgenda(occ, [])).toEqual([])
    expect(layoutAgenda(occ, ['2026-11-18', '2026-11-19', '2026-11-20'] as never).map((d) => d.date)).toEqual(['2026-11-18', '2026-11-19'])
  })

  it('layoutAgenda orders events that start together by key', () => {
    const occ = createCalendar({ events: () => [ev('b', '2026-11-18T09:00', '2026-11-18T10:00'), ev('a', '2026-11-18T09:00', '2026-11-18T10:00')], date: '2026-11-18', now: () => NOW, view: 'agenda' }).occurrences()
    expect(layoutAgenda([...occ].reverse(), ['2026-11-18'] as never)[0]!.occurrences.map((o) => o.key.split(':')[0])).toEqual(['a', 'b'])
    expect(layoutAgenda(occ, ['2026-11-18'] as never)[0]!.occurrences.map((o) => o.key.split(':')[0])).toEqual(['a', 'b'])
  })
})

describe('the year', () => {
  it('twelve labelled month grids; days shaded by how many events (capped at 4) and named with the count; today marked', () => {
    const list = [...Array.from({ length: 5 }, (_, i) => ev(`m${i}`, '2026-11-18T09:00', '2026-11-18T10:00')), ev('one', '2026-03-02T09:00', '2026-03-02T10:00')]
    const { root } = make({ view: 'year', events: () => list })
    const grids = [...root.querySelectorAll('[role=grid]')]
    expect(grids).toHaveLength(12)
    expect(grids[10]!.getAttribute('aria-label')).toBe('November 2026')
    expect(root.querySelectorAll('.pcal-year-title')[0]!.textContent).toBe('January')
    expect([...grids[0]!.querySelectorAll('[role=columnheader]')].map((h) => h.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    const day = root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-11-18"]')!
    expect(day.dataset.busy).toBe('4')
    expect(day.getAttribute('aria-current')).toBe('date')
    expect(day.querySelector('.pcal-sr')!.textContent).toBe('Wednesday 18 November, 5 events')
    const march = root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-03-02"]')!
    expect(march.dataset.busy).toBe('1')
    expect(march.querySelector('.pcal-sr')!.textContent).toBe('Monday 2 March, 1 event')
    expect(root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-03-03"]')!.hasAttribute('data-busy')).toBe(false)
    // the days of the other months are empty, hidden cells (January 2026: three before, Sunday 1 February after)
    expect(grids[0]!.querySelectorAll('[data-empty][aria-hidden=true]').length).toBe(4)
    expect(root.querySelectorAll('.pcal-year-day[tabindex="0"]')).toHaveLength(1)
  })

  it('a click on a day opens it in the day view; Enter does the same for the focused day', () => {
    const { root, calendar } = make({ view: 'year' })
    root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-02-10"]')!.click()
    expect(calendar.view()).toBe('day')
    expect(calendar.date()).toBe('2026-02-10')
    calendar.setView('year')
    const focused = root.querySelector<HTMLElement>('.pcal-year-day[tabindex="0"]')!
    expect(focused.dataset.date).toBe('2026-02-10')
    focused.focus()
    expect(key(focused, 'Enter')).toBe(true)
    expect(calendar.view()).toBe('day')
  })

  it('onDayClick replaces that; arrows, PageDown and Space go through the grid keyboard and focus follows', async () => {
    const onDayClick = vi.fn()
    const { root, calendar } = make({ view: 'year' }, { onDayClick })
    const at = (): HTMLElement => document.activeElement as HTMLElement
    root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-11-18"]')!.focus()
    key(at(), 'ArrowRight')
    await flush()
    expect(at().dataset.date).toBe('2026-11-19')
    key(at(), 'ArrowDown')
    key(at(), 'ArrowDown')
    await flush()
    expect(at().dataset.date).toBe('2026-12-03')
    key(at(), 'PageDown')
    await flush()
    expect(calendar.cursor().date).toBe('2027-01-03')
    expect(calendar.date().slice(0, 4)).toBe('2027')
    expect(at().dataset.date).toBe('2027-01-03')
    key(at(), ' ')
    expect(onDayClick).toHaveBeenLastCalledWith('2027-01-03')
    root.querySelector<HTMLElement>('.pcal-year-day[data-date="2027-02-01"]')!.click()
    expect(onDayClick).toHaveBeenLastCalledWith('2027-02-01')
    expect(calendar.view()).toBe('year')
    expect(key(at(), 'q')).toBe(false)
  })

  it('a week that starts on Sunday starts every month on Sunday; YearView on its own takes a class and needs no onDayClick', () => {
    const calendar = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, view: 'year', weekStart: 7 })
    const root = render(<YearView calendar={calendar} class="mine" />)
    expect(root.querySelector('.mine')).not.toBeNull()
    expect([...root.querySelectorAll('[role=grid]')[0]!.querySelectorAll('[role=columnheader]')].map((h) => h.getAttribute('aria-label'))[0]).toBe('Sunday')
    root.querySelector<HTMLElement>('.pcal-year-day[data-date="2026-05-05"]')!.click()
    expect(calendar.cursor().date).toBe('2026-05-05')
    expect(key(root.querySelector('.pcal-year-day[data-date="2026-05-05"]')!, 'Enter')).toBe(true)
  })
})

describe('the "+N more" popover', () => {
  const many = [...Array.from({ length: 5 }, (_, i) => ev(`e${i}`, '2026-11-18T09:00', '2026-11-18T10:00')), ev('trip', '2026-11-17', '2026-11-20')]
  const open = (root: HTMLElement): HTMLElement => {
    const more = root.querySelector<HTMLElement>('.pcal-more[data-date="2026-11-18"], .pcal-day[data-date="2026-11-18"] .pcal-more')!
    more.click()

    return more
  }

  it('opens as a labelled non-modal dialog listing every event of the day, with the focus inside', () => {
    const { root } = make({ events: () => many, monthCapacity: 2 })
    const more = open(root)
    const dialog = root.querySelector<HTMLElement>('[role=dialog]')!
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    expect(dialog.getAttribute('aria-label')).toBe('Wednesday 18 November')
    expect(dialog.querySelector('.pcal-popover-title')!.textContent).toBe('Wednesday 18 November')
    expect([...dialog.querySelectorAll('.pcal-popover-event')].map((b) => b.textContent)).toEqual(['trip', 'e0', 'e1', 'e2', 'e3', 'e4'])
    expect(dialog.querySelector('.pcal-popover-close')!.getAttribute('aria-label')).toBe('Close')
    expect(document.activeElement).toBe(dialog.querySelector('.pcal-popover-close'))
    expect(more.isConnected).toBe(true)
  })

  it('is placed under its button, kept inside the calendar', () => {
    const { root } = make({ events: () => many, monthCapacity: 2 })
    const calendarEl = root.querySelector<HTMLElement>('.pcal')!
    vi.spyOn(calendarEl, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 1000, height: 800, right: 1010, bottom: 820 } as DOMRect)
    const more = root.querySelector<HTMLElement>('.pcal-day[data-date="2026-11-18"] .pcal-more')!
    vi.spyOn(more, 'getBoundingClientRect').mockReturnValue({ left: 910, top: 300, width: 80, height: 20, right: 990, bottom: 320 } as DOMRect)
    more.click()
    const dialog = root.querySelector<HTMLElement>('[role=dialog]')!
    expect([css(dialog, 'left'), css(dialog, 'top')]).toEqual(['720px', '304px'])
  })

  it('Tab and Shift+Tab stay inside; a Tab in the middle is left to the browser', () => {
    const { root } = make({ events: () => many, monthCapacity: 2 })
    open(root)
    const buttons = [...root.querySelectorAll<HTMLElement>('[role=dialog] button')]
    buttons.at(-1)!.focus()
    expect(key(buttons.at(-1)!, 'Tab')).toBe(true)
    expect(document.activeElement).toBe(buttons[0])
    expect(key(buttons[0]!, 'Tab', { shiftKey: true })).toBe(true)
    expect(document.activeElement).toBe(buttons.at(-1))
    buttons[2]!.focus()
    expect(key(buttons[2]!, 'Tab')).toBe(false)
    expect(key(buttons[2]!, 'Tab', { shiftKey: true })).toBe(false)
    expect(key(buttons[2]!, 'x')).toBe(false)
  })

  it('Escape closes it and gives the focus back to its button; the close button does too', async () => {
    const { root, calendar } = make({ events: () => many, monthCapacity: 2 })
    calendar.selectDay('2026-11-10')
    const more = open(root)
    // an app that closes its own dialog on Escape (a listener above the calendar) does not hear the popover's Escape
    const appEscape = vi.fn()
    document.body.addEventListener('keydown', appEscape)
    cleanups.push(() => document.body.removeEventListener('keydown', appEscape))
    expect(key(root.querySelector('[role=dialog] button')!, 'Escape')).toBe(true)
    expect(appEscape).not.toHaveBeenCalled()
    expect(root.querySelector('[role=dialog]')).toBeNull()
    // the Escape was the popover's: the selection in the grid stays
    expect(calendar.selection()).not.toBeNull()
    await flush()
    expect(document.activeElement).toBe(more)
    open(root)
    root.querySelector<HTMLElement>('.pcal-popover-close')!.click()
    expect(root.querySelector('[role=dialog]')).toBeNull()
    await flush()
    expect(document.activeElement).toBe(more)
  })

  it('when its button is gone, Escape gives the focus to the day', async () => {
    const events = signal(many)
    const { root } = make({ events: () => events(), monthCapacity: 2 })
    open(root)
    events.set(many.slice(0, 1))
    expect(root.querySelector('.pcal-more')).toBeNull()
    key(root.querySelector('[role=dialog] button')!, 'Escape')
    await flush()
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-18')
  })

  it('a press outside closes it without taking the focus; a press inside or on its button does not', async () => {
    const { root } = make({ events: () => many, monthCapacity: 2 })
    const more = open(root)
    const dialog = root.querySelector<HTMLElement>('[role=dialog]')!
    dialog.querySelector('.pcal-popover-event')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(root.querySelector('[role=dialog]')).not.toBeNull()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(root.querySelector('[role=dialog]')).toBeNull()
    await flush()
    expect(document.activeElement).toBe(outside)
    // the listener went with it
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    outside.remove()
  })

  it('choosing an event closes it and reports the click; renderEvent fills its items', () => {
    const { root, onEventClick } = make({ events: () => many, monthCapacity: 2 }, { renderEvent: (c: { occurrence: { title: string } }) => <b>{c.occurrence.title.toUpperCase()}</b> })
    open(root)
    const item = [...root.querySelectorAll<HTMLElement>('.pcal-popover-event')][2]!
    expect(item.textContent).toBe('E1')
    item.click()
    expect(root.querySelector('[role=dialog]')).toBeNull()
    expect(onEventClick.mock.calls[0]![1].key).toBe('e1:2026-11-18T09:00')
  })

  it('moreDialog={false} leaves it to onMore; a change of the view closes an open popover', () => {
    const onMore = vi.fn()
    const own = make({ events: () => many, monthCapacity: 2 }, { moreDialog: false, onMore })
    const more = open(own.root)
    expect(onMore).toHaveBeenCalledWith('2026-11-18', more)
    expect(own.root.querySelector('[role=dialog]')).toBeNull()
    const both = make({ events: () => many, monthCapacity: 2 }, { onMore })
    open(both.root)
    expect(both.root.querySelector('[role=dialog]')).not.toBeNull()
    both.calendar.setView('week')
    expect(both.root.querySelector('[role=dialog]')).toBeNull()
  })

  it('DayPopover on its own with no events: the focus goes to the close button', () => {
    const calendar = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW })
    const anchor = document.createElement('button')
    document.body.append(anchor)
    const onClose = vi.fn()
    const root = render(<DayPopover calendar={calendar} state={{ date: '2026-11-18', anchor, left: 0, top: 0 }} view={{ calendar }} onClose={onClose} />)
    expect(root.querySelectorAll('.pcal-popover-event')).toHaveLength(0)
    expect(document.activeElement).toBe(root.querySelector('.pcal-popover-close'))
    key(root.querySelector('.pcal-popover-close')!, 'Tab')
    expect(onClose).not.toHaveBeenCalled()
    anchor.remove()
  })
})

// ── the timeline, with injected lane geometry ─────────────────────────────────────────────────────────────────────────────
const LANE_X = 100
const LANE_W = 700

function laneBox(lane: Element): DOMRect {
  const rows = [...(lane.closest('[role=grid]')?.querySelectorAll('.pcal-tl-lane') ?? [])]
  const top = 100 + rows.indexOf(lane) * 40

  return { x: LANE_X, y: top, left: LANE_X, top, width: LANE_W, height: 36, right: LANE_X + LANE_W, bottom: top + 36, toJSON: () => ({}) } as DOMRect
}

function boxOf(el: Element): DOMRect {
  if (el.matches('.pcal-tl-lane')) return laneBox(el)
  if (el.matches('.pcal-tl-block')) {
    const lane = laneBox(el.closest('.pcal-tl-lane')!)
    const left = lane.left + (parseFloat(css(el, 'inset-inline-start')) / 100) * LANE_W
    const width = (parseFloat(css(el, 'inline-size')) / 100) * LANE_W
    const rtl = getComputedStyle(el.closest('[role=grid]')!).direction === 'rtl'
    const x = rtl ? lane.right - (left - lane.left) - width : left

    return { x, y: lane.top, left: x, top: lane.top, width, height: 24, right: x + width, bottom: lane.top + 24, toJSON: () => ({}) } as DOMRect
  }

  return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect
}

function laneLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return boxOf(this)
  })
  ;(document as { elementsFromPoint?: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) =>
    [...document.querySelectorAll('.pcal-tl-block, .pcal-tl-lane')].filter((el) => {
      const b = boxOf(el)

      return x >= b.left && x < b.right && y >= b.top && y < b.bottom
    })
  cleanups.push(() => delete (document as { elementsFromPoint?: unknown }).elementsFromPoint)
}

/** The point of a lane at a day of the shown week and a minute of it (the axis is 100 px a day, 0:00 to 24:00). */
const at = (row: number, day: number, minute: number, rtl = false): { x: number; y: number } => {
  const frac = (day + minute / 1440) / 7

  return { x: rtl ? LANE_X + LANE_W - frac * LANE_W : LANE_X + frac * LANE_W, y: 100 + row * 40 + 10 }
}

function fire(on: Element, type: string, p: { x: number; y: number }, init: PointerEventInit = {}): void {
  on.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: p.x, clientY: p.y, ...init }))
}

describe('the resource timeline', () => {
  const resources = [
    { id: 'a', title: 'Room A' },
    { id: 'b', title: 'Room B' },
    { id: 'c', title: 'Room C' },
  ]
  const list = [ev('talk', '2026-11-18T09:00', '2026-11-18T12:00', { resourceId: 'a' }), ev('both', '2026-11-17', '2026-11-18', { resourceId: ['a', 'c'] }), ev('lone', '2026-11-19T10:00', '2026-11-19T11:00')]
  const timeline = (options: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}, dir?: string) => make({ view: 'timeline', resources: () => resources, events: () => list, editable: true, ...options }, props, dir)
  const bar = (root: HTMLElement, id: string, row: string): HTMLElement => root.querySelector<HTMLElement>(`.pcal-tl-row[data-resource="${row}"] .pcal-tl-block[data-key^="${id}:"]`)!

  it('a labelled grid: a row per resource, an Unassigned row only when something has no resource, bars in the rows of their resources', () => {
    const { root, calendar } = timeline()
    const grid = root.querySelector('[role=grid]')!
    expect(grid.getAttribute('aria-label')).toBe(`Timeline, ${calendar.title()}`)
    expect(grid.getAttribute('aria-rowcount')).toBe('5')
    expect(css(grid, '--pcal-tl-days')).toBe('7')
    expect(root.querySelector('.pcal-tl-corner')!.textContent).toBe('Resource')
    expect([...root.querySelectorAll('.pcal-tl-name')].map((n) => n.textContent)).toEqual(['Room A', 'Room B', 'Room C', 'Unassigned'])
    expect([...root.querySelectorAll('.pcal-tl-day')].map((d) => d.getAttribute('aria-label'))[2]).toBe('Wednesday 18 November')
    expect(root.querySelector('.pcal-tl-day[data-today]')!.getAttribute('aria-label')).toBe('Wednesday 18 November')
    // the hours are written only for one or two days
    expect(root.querySelector('.pcal-tl-hours')).toBeNull()
    const talk = bar(root, 'talk', 'a')
    expect(talk.getAttribute('aria-label')).toBe('talk, Wednesday 18 November, 09:00 – 12:00')
    expect([css(talk, 'inset-inline-start'), css(talk, 'inline-size')]).toEqual([`${(((2 + 9 / 24) / 7) * 100).toFixed(4)}%`, `${((3 / 24 / 7) * 100).toFixed(4)}%`])
    expect(bar(root, 'both', 'a').hasAttribute('data-all-day')).toBe(true)
    expect(bar(root, 'both', 'c')).not.toBeNull()
    expect(bar(root, 'lone', '\u0000unassigned')).not.toBeNull()
    // the bars of row a are in two lanes? no: they do not overlap, so one lane and the row is one lane tall
    expect(css(root.querySelector('.pcal-tl-row[data-resource="a"]')!, 'block-size')).toBe('36px')
    // the now line is on Wednesday at 12:00
    expect(css(root.querySelector('.pcal-tl-now')!, 'inset-inline-start')).toBe(`${(((2 + 12 / 24) / 7) * 100).toFixed(3)}%`)
  })

  it('without events that lack a resource there is no Unassigned row; with no resources and no events it says so', () => {
    const { root } = timeline({ events: () => list.slice(0, 2) })
    expect([...root.querySelectorAll('.pcal-tl-name')].map((n) => n.textContent)).toEqual(['Room A', 'Room B', 'Room C'])
    const none = make({ view: 'timeline', events: () => [] })
    expect(none.root.querySelector('.pcal-agenda-empty')!.textContent).toBe('No events')
  })

  it('one or two days write the hours along the top; another week has no now line', () => {
    const { root, calendar } = timeline({ days: 2, dayStart: '08:00', dayEnd: '18:00' })
    const hours = [...root.querySelectorAll('.pcal-tl-hours span')]
    expect(hours.map((h) => h.textContent)).toEqual(['8', '10', '12', '14', '16', '8', '10', '12', '14', '16'])
    expect(css(hours[1]!, 'inset-inline-start')).toBe('20.000%')
    calendar.next()
    expect(root.querySelector('.pcal-tl-now')).toBeNull()
  })

  it('renderEvent fills the bars; a click on a bar reports it', () => {
    const { root, onEventClick } = timeline({}, { renderEvent: (c: { occurrence: { title: string } }) => <i>{c.occurrence.title}!</i> })
    expect(bar(root, 'talk', 'a').querySelector('i')!.textContent).toBe('talk!')
    bar(root, 'talk', 'a').click()
    expect(onEventClick.mock.calls[0]![0].id).toBe('talk')
  })

  it('a change of one event lays out only its rows, and the bar follows it', () => {
    const events = signal(list)
    const layoutResource = vi.fn()
    const { root } = timeline({ events: () => events(), instrument: { layoutResource } })
    layoutResource.mockClear()
    events.set([ev('talk', '2026-11-18T13:00', '2026-11-18T14:00', { resourceId: 'a' }), list[1]!, list[2]!])
    expect(layoutResource.mock.calls.map((c) => c[0])).toEqual(['a'])
    expect(css(bar(root, 'talk', 'a'), 'inset-inline-start')).toBe(`${(((2 + 13 / 24) / 7) * 100).toFixed(4)}%`)
  })

  it('is windowed: 200 resources draw the rows near the viewport; scrolling moves the window', () => {
    const lots = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, title: `Room ${i}` }))
    const { root } = make({ view: 'timeline', resources: () => lots, events: () => [ev('x', '2026-11-18T09:00', '2026-11-18T10:00', { resourceId: 'r150' })] })
    const grid = root.querySelector<HTMLElement>('[role=grid]')!
    const drawn = (): string[] => [...root.querySelectorAll<HTMLElement>('.pcal-tl-row')].map((r) => r.dataset.resource!)
    expect(css(root.querySelector('.pcal-tl-body')!, 'block-size')).toBe(`${200 * 36}px`)
    expect(drawn()[0]).toBe('r0')
    expect(drawn().length).toBeLessThan(30)
    grid.scrollTop = 36 * 150
    grid.dispatchEvent(new Event('scroll'))
    expect(drawn()).toContain('r150')
    expect(drawn()).not.toContain('r0')
    expect(root.querySelector('.pcal-tl-block[data-key^="x:"]')).not.toBeNull()
  })

  it('drag a bar to another row: it follows the pointer across the rows, and the change names both resources', async () => {
    laneLayout()
    const { root, onEventChange } = timeline()
    const talk = bar(root, 'talk', 'a')
    fire(talk, 'pointerdown', at(0, 2, 600))
    fire(talk, 'pointermove', at(1, 2, 660))
    // one hour later (100/24 px) and one row down (40 px); the bar's own box comes from its 4-decimal percentages
    const [dx, dy] = /translate\((.+)px, (.+)px\)/.exec(talk.style.transform)!.slice(1).map(Number)
    expect(dx).toBeCloseTo(100 / 24, 2)
    expect(dy).toBe(40)
    fire(talk, 'pointerup', at(1, 2, 660))
    await flush()
    expect(onEventChange.mock.calls[0]![0]).toMatchObject({ start: '2026-11-18T10:00', end: '2026-11-18T13:00', resourceId: 'b', fromResourceId: 'a' })
  })

  it('a drop in the same row moves in time only; an all-day bar keeps being all-day', async () => {
    laneLayout()
    const { root, onEventChange } = timeline()
    fire(bar(root, 'talk', 'a'), 'pointerdown', at(0, 2, 600))
    fire(bar(root, 'talk', 'a'), 'pointermove', at(0, 3, 600))
    fire(bar(root, 'talk', 'a'), 'pointerup', at(0, 3, 600))
    await flush()
    expect(onEventChange.mock.calls[0]![0]).toMatchObject({ start: '2026-11-19T09:00', end: '2026-11-19T12:00' })
    expect(onEventChange.mock.calls[0]![0]).not.toHaveProperty('resourceId')
    const both = bar(root, 'both', 'c')
    fire(both, 'pointerdown', at(2, 1, 720))
    fire(both, 'pointermove', at(2, 3, 300))
    fire(both, 'pointerup', at(2, 3, 300))
    await flush()
    expect(onEventChange.mock.calls[1]![0]).toMatchObject({ start: '2026-11-19', end: '2026-11-20', allDay: true })
  })

  it('resize a bar by its end handle; right to left reads the lane from the right', async () => {
    laneLayout()
    const { root, onEventChange } = timeline()
    const talk = bar(root, 'talk', 'a')
    fire(talk.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', at(0, 2, 715))
    fire(talk, 'pointermove', at(0, 2, 840))
    expect(Number(/translateX\((.+)px\)/.exec(talk.style.transform)![1])).toBeCloseTo(0, 2)
    expect(parseFloat(talk.style.width)).toBeCloseTo((5 / 24 / 7) * LANE_W, 2)
    fire(talk, 'pointerup', at(0, 2, 840))
    await flush()
    expect(onEventChange.mock.calls[0]![0]).toMatchObject({ start: '2026-11-18T09:00', end: '2026-11-18T14:00' })
    for (const c of cleanups.splice(0)) c()
    laneLayout()
    const rtl = timeline({}, {}, 'rtl')
    const mirrored = bar(rtl.root, 'talk', 'a')
    fire(mirrored, 'pointerdown', at(0, 2, 600, true))
    fire(mirrored, 'pointermove', at(1, 2, 660, true))
    fire(mirrored, 'pointerup', at(1, 2, 660, true))
    await flush()
    expect(rtl.onEventChange.mock.calls[0]![0]).toMatchObject({ start: '2026-11-18T10:00', resourceId: 'b' })
  })

  it('dragging over an empty part of a row selects that time on that resource, drawn on its row', () => {
    laneLayout()
    const { root, calendar, onSelect } = timeline()
    const lane = root.querySelector<HTMLElement>('.pcal-tl-lane[data-resource="b"]')!
    fire(lane, 'pointerdown', at(1, 3, 540))
    fire(root.querySelector('[role=grid]')!, 'pointermove', at(1, 3, 650))
    fire(root.querySelector('[role=grid]')!, 'pointerup', at(1, 3, 650))
    expect(calendar.selection()).toEqual({ start: '2026-11-19T09:00', end: '2026-11-19T11:00', allDay: false, resourceId: 'b' })
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-19T09:00', end: '2026-11-19T11:00', allDay: false, resourceId: 'b' })
    const shown = root.querySelector<HTMLElement>('.pcal-tl-row[data-resource="b"] .pcal-tl-selection')!
    expect([css(shown, 'inset-inline-start'), css(shown, 'inline-size')]).toEqual([`${(((3 + 9 / 24) / 7) * 100).toFixed(3)}%`, `${((2 / 24 / 7) * 100).toFixed(3)}%`])
    expect(root.querySelectorAll('.pcal-tl-selection')).toHaveLength(1)
    // a selection outside the shown days is drawn to the edges
    calendar.select({ date: '2026-11-10', minute: 0 }, { date: '2026-11-30', minute: 0 }, 'time', 'c')
    const edge = root.querySelector<HTMLElement>('.pcal-tl-row[data-resource="c"] .pcal-tl-selection')!
    expect([css(edge, 'inset-inline-start'), css(edge, 'inline-size')]).toEqual(['0.000%', '100.000%'])
    calendar.selectDay('2026-11-19')
    expect(root.querySelectorAll('.pcal-tl-selection')).toHaveLength(0)
  })

  it('keyboard: Enter grabs a bar, Up and Down give it to the row above or below, Left and Right move it in time, Shift resizes, Enter drops', async () => {
    const { root, calendar, onEventChange } = timeline()
    const talk = (): HTMLElement => root.querySelector<HTMLElement>('.pcal-tl-block[data-key^="talk:"]')!
    expect(key(talk(), 'Enter')).toBe(true)
    expect(key(talk(), 'ArrowUp')).toBe(true) // the first row: nothing above, but the key is the grab's
    expect(calendar.editing()!.target.resourceId).toBeUndefined()
    expect(key(talk(), 'ArrowDown')).toBe(true)
    expect(talk().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('b')
    expect(key(talk(), 'ArrowDown')).toBe(true)
    expect(calendar.editing()!.target).toMatchObject({ resourceId: 'c', fromResourceId: 'a' })
    expect(key(talk(), 'ArrowUp')).toBe(true)
    expect(key(talk(), 'ArrowRight')).toBe(true)
    expect(calendar.editing()!.target).toMatchObject({ start: '2026-11-18T09:30', resourceId: 'b' })
    expect(key(talk(), 'ArrowLeft', { shiftKey: true })).toBe(true)
    expect(calendar.editing()!.target).toMatchObject({ start: '2026-11-18T09:30', end: '2026-11-18T12:00', resourceId: 'b' })
    expect(key(talk(), 'Enter')).toBe(true)
    await flush()
    expect(onEventChange.mock.calls[0]![0]).toMatchObject({ start: '2026-11-18T09:30', end: '2026-11-18T12:00', resourceId: 'b', fromResourceId: 'a' })
  })

  it('keyboard in right to left: Left moves later; keys of a bar that is not grabbed go to the event keyboard', () => {
    const { root, calendar } = timeline({}, {}, 'rtl')
    const talk = (): HTMLElement => root.querySelector<HTMLElement>('.pcal-tl-block[data-key^="talk:"]')!
    expect(key(talk(), 'ArrowLeft')).toBe(false)
    key(talk(), ' ')
    key(talk(), 'ArrowLeft')
    expect(calendar.editing()!.target.start).toBe('2026-11-18T09:30')
    key(talk(), 'Escape')
    expect(calendar.editing()).toBeNull()
    expect(key(root.querySelector('.pcal-tl-lane')!, 'ArrowDown')).toBe(false)
  })

  it('TimelineView on its own, with a class', () => {
    const calendar = createCalendar({ events: () => list, resources: () => resources, date: '2026-11-18', now: () => NOW, view: 'timeline' })
    expect(render(<TimelineView calendar={calendar} class="mine" />).querySelector('.mine[data-view=timeline]')).not.toBeNull()
    expect(calendar.resources()).toEqual(resources)
  })

  it('a recurring occurrence given to another resource with scope "this" carries the resource in its override', () => {
    const weekly = ev('standup', '2026-11-16T09:00', '2026-11-16T09:30', { resourceId: 'a', recurrence: { every: 'day', start: '2026-11-16T09:00', count: 3 } as never })
    const [n] = applyEventChange(weekly, { event: weekly, occurrence: '2026-11-17T09:00', start: '2026-11-17T09:00', end: '2026-11-17T09:30', allDay: false, scope: 'this', resourceId: 'b', fromResourceId: 'a' })
    const { root } = timeline({ events: () => [n!] })
    expect(bar(root, 'standup', 'b').dataset.key).toBe('standup:2026-11-17T09:00')
    expect(root.querySelectorAll('.pcal-tl-row[data-resource="a"] .pcal-tl-block')).toHaveLength(2)
  })
})

describe('windowRows', () => {
  it('an empty list, a scroll past the end and a negative scroll', () => {
    expect(windowRows([], 0, 500)).toEqual({ start: 0, end: 0, offset: 0, total: 0 })
    expect(windowRows([10, 10, 10], 1000, 50, 0)).toEqual({ start: 3, end: 3, offset: 30, total: 30 })
    expect(windowRows([10, 10, 10], -40, 15, 0)).toEqual({ start: 0, end: 2, offset: 0, total: 30 })
  })
})

describe('sizes and edges', () => {
  /** A ResizeObserver whose callbacks the test runs (happy-dom never calls them). */
  function observeSizes(): (() => void)[] {
    const callbacks: (() => void)[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb)
        }

        observe(): void {}
        disconnect(): void {}
      },
    )
    cleanups.push(() => vi.unstubAllGlobals())

    return callbacks
  }

  it('the agenda and the timeline draw as many rows as their element is tall, and follow a resize', () => {
    const callbacks = observeSizes()
    const many = Array.from({ length: 60 }, (_, i) => ev(`e${i}`, new Date(Date.UTC(2026, 10, 18 + i, 9)).toISOString().slice(0, 16), new Date(Date.UTC(2026, 10, 18 + i, 10)).toISOString().slice(0, 16)))
    const agenda = make({ view: 'agenda', agendaDays: 60, events: () => many })
    const region = agenda.root.querySelector<HTMLElement>('[role=region]')!
    const days = (): number => agenda.root.querySelectorAll('.pcal-agenda-day').length
    const before = days()
    Object.defineProperty(region, 'clientHeight', { configurable: true, value: 92 * 20 })
    for (const cb of callbacks) cb()
    expect(days()).toBeGreaterThan(before)
    const lots = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, title: `R${i}` }))
    const tl = make({ view: 'timeline', resources: () => lots, events: () => [] })
    const grid = tl.root.querySelector<HTMLElement>('[role=grid]')!
    const rows = (): number => tl.root.querySelectorAll('.pcal-tl-row').length
    const few = rows()
    Object.defineProperty(grid, 'clientHeight', { configurable: true, value: 36 * 60 })
    for (const cb of callbacks) cb()
    expect(rows()).toBeGreaterThan(few)
  })

  it('a timeline bar that goes on past the shown week says so on both cut ends', () => {
    const { root } = make({ view: 'timeline', resources: () => [{ id: 'a', title: 'A' }], events: () => [ev('long', '2026-11-10', '2026-11-30', { resourceId: 'a' })] })
    const bar = root.querySelector<HTMLElement>('.pcal-tl-block')!
    expect([bar.hasAttribute('data-continues-before'), bar.hasAttribute('data-continues-after')]).toEqual([true, true])
    expect(bar.querySelector('.pcal-handle')).toBeNull()
  })

  it('a window of one day in a range view is titled by its date', () => {
    const cal = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, view: 'days', days: 1 })
    expect(cal.title()).toMatch(/^18 Nov 2026$/)
  })

  it('layoutTimeline and windowRows name themselves on a wrong argument; two identical bars stack by key', async () => {
    const { layoutTimeline } = await import('../index')
    expect(() => layoutTimeline([], [], 'x' as never, { from: 0, to: 1440 })).toThrow('[Pyreon] layoutTimeline: dates must be an array of dates')
    expect(() => windowRows('x' as never, 0, 10)).toThrow('[Pyreon] windowRows: heights must be an array of row heights in pixels')
    const occ = createCalendar({ events: () => [ev('b', '2026-11-18T09:00', '2026-11-18T10:00', { resourceId: 'r' }), ev('a', '2026-11-18T09:00', '2026-11-18T10:00', { resourceId: 'r' })], date: '2026-11-18', now: () => NOW }).occurrences()
    const [row] = layoutTimeline(occ, [{ id: 'r', title: 'R' }], ['2026-11-18'], { from: 0, to: 1440 })
    expect(row!.blocks.map((b) => [b.occurrenceKey.split(':')[0], b.lane])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('layoutAgenda cuts an event that ends after the last date', () => {
    const occ = createCalendar({ events: () => [ev('long', '2026-11-10', '2026-11-25')], date: '2026-11-18', now: () => NOW }).occurrences()
    expect(layoutAgenda(occ, ['2026-11-18'] as never).map((d) => d.date)).toEqual(['2026-11-18'])
  })
})
