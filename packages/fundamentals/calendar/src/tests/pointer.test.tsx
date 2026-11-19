// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
/**
 * The pointer layer and keyboard editing in happy-dom, through real `pointerdown` / `pointermove` / `pointerup` /
 * `pointercancel`, `lostpointercapture`, `click`, `touchmove`, `contextmenu` and `keydown` events on the mounted views.
 *
 * GEOMETRY IS INJECTED. happy-dom has no layout and no `document.elementsFromPoint`, and the pointer layer reads both. `layout()`
 * below gives every cell a box from its place in the grid (time grid: a 100 px column per day starting at x = 100, a 20 px row
 * per slot starting at y = 100, the all-day row at y = 50; month: a 100 px square per day) by stubbing
 * `HTMLElement.prototype.getBoundingClientRect` and defining `document.elementsFromPoint` over those boxes. Everything the
 * tests assert about pixels follows from that model, not from CSS; the real-layout evidence (real mouse input through CDP,
 * real boxes, touch, right to left) is `edit.browser.test.tsx`.
 */
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Calendar } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'
import { attachPointer } from '../pointer'

const NOW = Date.UTC(2026, 10, 18, 11, 0)
const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })
const flush = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))
const cleanups: (() => void)[] = []

// ── the injected geometry ────────────────────────────────────────────────────────────────────────────────────────────────
const SLOT_PX = 20
const COL_PX = 100
const CELLS = '.pcal-slot, .pcal-day, .pcal-allday-cell'

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) } as DOMRect
}

const indexIn = (el: Element, selector: string, scope: Element | null): number => (scope === null ? -1 : [...scope.querySelectorAll(selector)].indexOf(el))

/** The box in the reading direction: a right-to-left grid mirrors the columns. A bar is as wide as the days it spans (`--pcal-span`), from its cell towards the inline end. */
function boxOf(el: Element): DOMRect {
  if (el.matches('.pcal-event:not(.pcal-block)')) {
    const cell = el.closest(CELLS)
    if (cell === null) return rect(0, 0, 0, 0)
    const box = boxOf(cell)
    const width = Number((el as HTMLElement).style.getPropertyValue('--pcal-span') || 1) * COL_PX
    const rtl = getComputedStyle(cell).direction === 'rtl'

    return rect(rtl ? box.right - width : box.left, box.top + 20, width, 18)
  }
  const box = ltrBoxOf(el)
  const grid = el.closest('[role=grid]')
  if (grid === null || el === grid || getComputedStyle(grid).direction !== 'rtl') return box
  const width = grid.querySelector('.pcal-slot') === null ? 7 * COL_PX : 8 * COL_PX + COL_PX

  return rect(width - box.right, box.top, box.width, box.height)
}

function ltrBoxOf(el: Element): DOMRect {
  if (el.matches('.pcal-slot')) return rect(COL_PX + indexIn(el, '.pcal-slot', el.parentElement) * COL_PX, 100 + indexIn(el.parentElement!, '.pcal-row', el.closest('.pcal-body')) * SLOT_PX, COL_PX, SLOT_PX)
  if (el.matches('.pcal-allday-cell')) return rect(COL_PX + indexIn(el, '.pcal-allday-cell', el.parentElement) * COL_PX, 50, COL_PX, 40)
  if (el.matches('.pcal-day')) return rect(indexIn(el, '.pcal-day', el.parentElement) * COL_PX, 100 + indexIn(el.parentElement!, '.pcal-week', el.closest('[role=grid]')) * 100, COL_PX, 100)
  if (el.matches('.pcal-event')) {
    const cell = el.closest(CELLS)
    if (cell === null) return rect(0, 0, 0, 0)
    const box = ltrBoxOf(cell)
    const slots = Number((el as HTMLElement).style.getPropertyValue('--pcal-slots') || 1)

    return el.matches('.pcal-block') ? rect(box.left, box.top, box.width, slots * SLOT_PX) : rect(box.left, box.top + 20, box.width, 18)
  }
  if (el.matches('[role=grid]')) return rect(0, 0, 1000, 2000)

  return rect(0, 0, 0, 0)
}

function layout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return boxOf(this)
  })
  const inside = (b: DOMRect, x: number, y: number): boolean => x >= b.left && x < b.right && y >= b.top && y < b.bottom
  ;(document as { elementsFromPoint?: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) =>
    [...document.querySelectorAll(`${CELLS}, .pcal-event`)].filter((el) => inside(boxOf(el), x, y)).sort((a, b) => (b.contains(a) ? -1 : a.contains(b) ? 1 : 0))
  cleanups.push(() => delete (document as { elementsFromPoint?: unknown }).elementsFromPoint)
}

/** The centre of a cell, or a point `frac` of the way down a slot. */
function point(root: HTMLElement, date: string, minute: number | null, frac = 0.5): { x: number; y: number } {
  const selector = minute === null ? `.pcal-allday-cell[data-date="${date}"], .pcal-day[data-date="${date}"]` : `.pcal-slot[data-date="${date}"][data-minute="${minute}"]`
  const box = boxOf(root.querySelector(selector)!)

  return { x: box.left + box.width / 2, y: box.top + frac * box.height }
}

// ── pointer input ────────────────────────────────────────────────────────────────────────────────────────────────────────
type PointerInit = { pointerId?: number; pointerType?: string; button?: number; isPrimary?: boolean }

function fire(on: Element, type: string, at: { x: number; y: number }, init: PointerInit = {}): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: at.x, clientY: at.y, ...init })
  on.dispatchEvent(event)

  return event
}

/** Press on `from`, move through `path` (each a point), release at the last point. Moves and the release go to the element that holds the capture. */
function drag(from: Element, start: { x: number; y: number }, path: { x: number; y: number }[], init: PointerInit = {}): void {
  fire(from, 'pointerdown', start, init)
  for (const p of path) fire(from, 'pointermove', p, init)
  fire(from, 'pointerup', path.at(-1) ?? start, init)
}

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

const base: CalendarEvent[] = [ev('review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('holiday', '2026-11-17', '2026-11-18'), ev('conf', '2026-11-16', '2026-11-19')]

function make(options: Partial<CalendarOptions> = {}, dir?: string) {
  const onEventChange = vi.fn((_change: unknown): boolean | void | Promise<boolean | void> => true)
  const onEventClick = vi.fn()
  const onSelect = vi.fn()
  const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week', editable: true, onEventChange, onEventClick, onSelect, ...options })
  const root = render(<Calendar calendar={calendar} toolbar={false} />, dir)
  const grid = root.querySelector<HTMLElement>('[role=grid]')!

  return { calendar, root, grid, onEventChange: (options.onEventChange as typeof onEventChange | undefined) ?? onEventChange, onEventClick, onSelect }
}

const block = (root: HTMLElement, id: string): HTMLElement => root.querySelector<HTMLElement>(`.pcal-event[data-key^="${id}:"]`)!
const live = (root: HTMLElement): string => root.querySelector('.pcal-live')!.textContent ?? ''
const changeOf = (spy: { mock: { calls: unknown[][] } }, n = 0): Record<string, unknown> => spy.mock.calls[n]![0] as Record<string, unknown>

beforeEach(() => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
  layout()
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('moving with the pointer (time grid)', () => {
  it('drags an event to another time on the same day: snapped, the duration kept, the app asked once, the element put back', async () => {
    const { root, onEventChange, calendar } = make()
    const el = block(root, 'review')
    const saved = el.getAttribute('style')
    // take hold a third of the way into the 14:00 slot, let go a third into 15:00
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 1 / 3))
    fire(el, 'pointermove', point(root, '2026-11-18', 840, 0.4)) // under the 4 px slop: not a drag yet
    expect(calendar.editing()).toBeNull()
    fire(el, 'pointermove', point(root, '2026-11-18', 900, 1 / 3))
    expect(calendar.editing()).toMatchObject({ key: 'review:2026-11-18T14:00', mode: 'move', by: 'pointer', target: { start: '2026-11-18T15:00', end: '2026-11-18T16:00' } })
    expect(el.hasAttribute('data-dragging')).toBe(true)
    expect(el.hasPointerCapture(1)).toBe(true)
    // the element follows the target, snapped to the slot it would land in (three slots down, same column)
    expect(el.style.transform).toBe('translate(0px, 40px)')
    // only the dragged block's time label follows the drag
    expect(el.querySelector('.pcal-block-time')!.getAttribute('data-time')).toBe('15:00')
    fire(el, 'pointerup', point(root, '2026-11-18', 900, 1 / 3))
    await flush()
    expect(onEventChange).toHaveBeenCalledTimes(1)
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T15:00', end: '2026-11-18T16:00', allDay: false })
    expect(changeOf(onEventChange)).not.toHaveProperty('occurrence')
    expect(el.getAttribute('style')).toBe(saved)
    expect(el.hasPointerCapture(1)).toBe(false)
    expect(calendar.editing()).toBeNull()
    expect(live(root)).toBe('review moved to Wednesday 18 November, 15:00 – 16:00')
  })

  it('drags across days: the column changes, the time follows the pointer', async () => {
    const { root, onEventChange } = make()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0))
    fire(el, 'pointermove', point(root, '2026-11-20', 540, 0))
    expect(el.style.transform).toBe('translate(200px, -200px)')
    fire(el, 'pointerup', point(root, '2026-11-20', 540, 0))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-20T09:00', end: '2026-11-20T10:00' })
  })

  it('snaps to the `snap` option, not the slot', async () => {
    const { root, onEventChange } = make({ snap: 15 })
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0))
    fire(el, 'pointermove', point(root, '2026-11-18', 870, 0.5)) // 14:45
    fire(el, 'pointerup', point(root, '2026-11-18', 870, 0.5))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T14:45', end: '2026-11-18T15:45' })
  })

  it('a click is a click: under the slop nothing is edited and the click reaches the event; after a drag the click is swallowed once', async () => {
    const { root, onEventChange, onEventClick } = make()
    const el = block(root, 'review')
    drag(el, point(root, '2026-11-18', 840, 0.2), [point(root, '2026-11-18', 840, 0.3)])
    el.click()
    expect(onEventClick).toHaveBeenCalledTimes(1)
    expect(onEventChange).not.toHaveBeenCalled()
    drag(el, point(root, '2026-11-18', 840, 0.2), [point(root, '2026-11-18', 960, 0.2)])
    el.click()
    expect(onEventClick).toHaveBeenCalledTimes(1)
    await flush()
    // the drop re-laid the block (shown at its target while the app decided), so take the one on screen now
    block(root, 'review').click()
    expect(onEventClick).toHaveBeenCalledTimes(2)
    expect(onEventChange).toHaveBeenCalledTimes(1)
  })

  it('dropping where it started asks nothing', async () => {
    const { root, onEventChange } = make()
    const el = block(root, 'review')
    drag(el, point(root, '2026-11-18', 840, 0.1), [point(root, '2026-11-18', 870, 0.1), point(root, '2026-11-18', 840, 0.1)])
    await flush()
    expect(onEventChange).not.toHaveBeenCalled()
  })

  it('a timed event dragged onto the all-day row becomes all-day; an all-day event dropped on a slot gets an hour from there', async () => {
    const { root, onEventChange } = make()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0))
    fire(el, 'pointermove', point(root, '2026-11-19', null))
    fire(el, 'pointerup', point(root, '2026-11-19', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-19', end: '2026-11-20', allDay: true })
    const holiday = block(root, 'holiday')
    fire(holiday, 'pointerdown', point(root, '2026-11-17', null))
    fire(holiday, 'pointermove', point(root, '2026-11-17', 600, 0))
    fire(holiday, 'pointerup', point(root, '2026-11-17', 600, 0))
    await flush()
    expect(changeOf(onEventChange, 1)).toMatchObject({ start: '2026-11-17T10:00', end: '2026-11-17T11:00', allDay: false })
  })

  it('an all-day event moved along the all-day row keeps its length', async () => {
    const { root, onEventChange } = make()
    const conf = block(root, 'conf')
    fire(conf, 'pointerdown', point(root, '2026-11-16', null))
    fire(conf, 'pointermove', point(root, '2026-11-18', null))
    fire(conf, 'pointerup', point(root, '2026-11-18', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18', end: '2026-11-21', allDay: true })
  })

  it('an instant event is proposed as instants, an event in its own zone in its own wall clock', async () => {
    const instant = ev('instant', Date.UTC(2026, 10, 19, 8, 0) as never, Date.UTC(2026, 10, 19, 9, 0) as never)
    const tokyo = ev('tokyo', '2026-11-20T18:00', '2026-11-20T19:00', { timeZone: 'Asia/Tokyo' }) // 10:00 in Prague
    const { root, onEventChange } = make({ events: () => [instant, tokyo] })
    drag(block(root, 'instant'), point(root, '2026-11-19', 540, 0), [point(root, '2026-11-19', 600, 0)])
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: Date.UTC(2026, 10, 19, 9, 0), end: Date.UTC(2026, 10, 19, 10, 0) })
    drag(block(root, 'tokyo'), point(root, '2026-11-20', 600, 0), [point(root, '2026-11-20', 660, 0)])
    await flush()
    expect(changeOf(onEventChange, 1)).toMatchObject({ start: '2026-11-20T19:00', end: '2026-11-20T20:00' })
  })
})

describe('resizing with the pointer (time grid)', () => {
  it('drags the end handle: the start stays, the end snaps; the element gets the new height', async () => {
    const { root, onEventChange } = make()
    const el = block(root, 'review')
    const handle = el.querySelector<HTMLElement>('.pcal-handle[data-edge=end]')!
    fire(handle, 'pointerdown', point(root, '2026-11-18', 870, 1))
    fire(el, 'pointermove', point(root, '2026-11-18', 930, 0.9))
    expect(el.style.height).toBe(`${4 * SLOT_PX}px`)
    expect(el.style.transform).toBe('translateY(0px)')
    fire(el, 'pointerup', point(root, '2026-11-18', 930, 0.9))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T16:00' })
    expect(live(root)).toBe('review resized to Wednesday 18 November, 14:00 – 16:00')
  })

  it('drags the start handle up; never shorter than minDuration when dragged past the other edge', async () => {
    const { root, onEventChange } = make({ minDuration: 15, snap: 15 })
    drag(block(root, 'review').querySelector('.pcal-handle[data-edge=start]')!, point(root, '2026-11-18', 840, 0), [point(root, '2026-11-18', 780, 0)])
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T13:00', end: '2026-11-18T15:00' })
    drag(block(root, 'review').querySelector('.pcal-handle[data-edge=end]')!, point(root, '2026-11-18', 870, 1), [point(root, '2026-11-18', 600, 0)])
    await flush()
    expect(changeOf(onEventChange, 1)).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T14:15' })
  })

  it('a block that continues across midnight has no handle on the cut edge', () => {
    const { root } = make({ events: () => [ev('night', '2026-11-18T22:00', '2026-11-19T02:00')] })
    const [after, before] = [...root.querySelectorAll<HTMLElement>('[data-key^="night:"]')]
    expect([...before!.querySelectorAll('.pcal-handle')].map((h) => h.getAttribute('data-edge'))).toEqual(['start'])
    expect([...after!.querySelectorAll('.pcal-handle')].map((h) => h.getAttribute('data-edge'))).toEqual(['end'])
  })

  it('resizes an all-day bar in the all-day row by the cell of its edge', async () => {
    const { root, onEventChange } = make()
    const conf = block(root, 'conf')
    fire(conf.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', point(root, '2026-11-18', null))
    fire(conf, 'pointermove', point(root, '2026-11-20', null))
    // the bar keeps its start and reaches 2 px short of the right edge of Friday's cell (x 500 to 600); it started at x 100
    expect(conf.style.transform).toBe('translateX(0px)')
    expect(conf.style.width).toBe('498px')
    fire(conf, 'pointerup', point(root, '2026-11-20', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-16', end: '2026-11-21', allDay: true })
  })
})

describe('selecting by dragging over empty space', () => {
  it('selects the slots from where it started to where it is, from the slot start, and calls onSelect', async () => {
    const { root, grid, calendar, onSelect } = make()
    const from = root.querySelector('.pcal-slot[data-date="2026-11-19"][data-minute="540"]')!
    fire(from, 'pointerdown', point(root, '2026-11-19', 540, 0.6))
    fire(grid, 'pointermove', point(root, '2026-11-19', 600, 0.2))
    expect(calendar.selection()).toEqual({ start: '2026-11-19T09:00', end: '2026-11-19T10:30', allDay: false })
    expect(grid.hasPointerCapture(1)).toBe(true)
    fire(grid, 'pointerup', point(root, '2026-11-19', 600, 0.2))
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-19T09:00', end: '2026-11-19T10:30', allDay: false })
    expect(calendar.editing()).toBeNull()
  })

  it('a selection outside the grid keeps the last one', () => {
    const { root, grid, calendar } = make()
    fire(root.querySelector('.pcal-slot[data-date="2026-11-19"][data-minute="540"]')!, 'pointerdown', point(root, '2026-11-19', 540))
    fire(grid, 'pointermove', point(root, '2026-11-19', 570))
    fire(grid, 'pointermove', { x: 5000, y: 5000 })
    fire(grid, 'pointerup', { x: 5000, y: 5000 })
    expect(calendar.selection()).toEqual({ start: '2026-11-19T09:00', end: '2026-11-19T10:00', allDay: false })
  })

  it('a touch on empty space scrolls; it never selects', () => {
    const { root, grid, calendar } = make()
    fire(root.querySelector('.pcal-slot[data-date="2026-11-19"][data-minute="540"]')!, 'pointerdown', point(root, '2026-11-19', 540), { pointerType: 'touch' })
    fire(grid, 'pointermove', point(root, '2026-11-19', 660), { pointerType: 'touch' })
    expect(calendar.selection()).toBeNull()
  })
})

describe('what does not start a drag, and what stops one', () => {
  it('a press outside any cell, a right button, a second finger and a press that is not primary do nothing', () => {
    const { root, grid, calendar } = make()
    const el = block(root, 'review')
    fire(grid, 'pointerdown', { x: 5000, y: 5000 })
    fire(grid, 'pointermove', { x: 5050, y: 5050 })
    expect(calendar.selection()).toBeNull()
    drag(el, point(root, '2026-11-18', 840), [point(root, '2026-11-18', 960)], { button: 2 })
    drag(el, point(root, '2026-11-18', 840), [point(root, '2026-11-18', 960)], { isPrimary: false })
    expect(calendar.editing()).toBeNull()
    // while one drag goes on, a second pointer is ignored
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointerdown', point(root, '2026-11-18', 840), { pointerId: 2 })
    fire(el, 'pointermove', point(root, '2026-11-18', 960), { pointerId: 2 })
    expect(calendar.editing()).toBeNull()
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    expect(calendar.editing()?.key).toBe('review:2026-11-18T14:00')
    fire(el, 'pointerup', point(root, '2026-11-18', 960), { pointerId: 2 })
    expect(calendar.editing()).not.toBeNull()
  })

  it('a press on a target that is not an element does nothing', () => {
    const { grid, calendar } = make()
    const text = document.createTextNode('x')
    grid.append(text)
    text.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 150, clientY: 150 }))
    fire(grid, 'pointermove', { x: 150, y: 300 })
    expect(calendar.selection()).toBeNull()
  })

  it('Escape puts the event back, asks nothing, says so, and swallows the click that follows', async () => {
    const { root, onEventChange, onEventClick, calendar } = make()
    const el = block(root, 'review')
    const saved = el.getAttribute('style')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    expect(calendar.editing()).toBeNull()
    expect(el.getAttribute('style')).toBe(saved)
    expect(live(root)).toBe('review: change cancelled')
    fire(el, 'pointerup', point(root, '2026-11-18', 960))
    el.click()
    expect(onEventClick).not.toHaveBeenCalled()
    await flush()
    expect(onEventChange).not.toHaveBeenCalled()
    // another key during a drag is left alone, and after the drag Escape is not taken
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
    document.body.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
    expect(calendar.editing()).not.toBeNull()
    fire(el, 'pointerup', point(root, '2026-11-18', 960))
    const late = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(late)
    expect(late.defaultPrevented).toBe(false)
  })

  it('Escape during a selection drag stops it without cancelling an edit', () => {
    const { root, grid, calendar } = make()
    const cancel = vi.spyOn(calendar, 'cancelEdit')
    fire(root.querySelector('.pcal-slot[data-date="2026-11-19"][data-minute="540"]')!, 'pointerdown', point(root, '2026-11-19', 540))
    fire(grid, 'pointermove', point(root, '2026-11-19', 600))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(cancel).not.toHaveBeenCalled()
    fire(grid, 'pointermove', point(root, '2026-11-19', 720))
    expect(calendar.selection()).toEqual({ start: '2026-11-19T09:00', end: '2026-11-19T10:30', allDay: false })
  })

  it('a cancelled pointer and a lost capture put the event back; a pointercancel of another pointer is ignored', async () => {
    const { root, onEventChange, calendar } = make()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    fire(el, 'pointercancel', point(root, '2026-11-18', 960), { pointerId: 9 })
    expect(calendar.editing()).not.toBeNull()
    fire(el, 'pointercancel', point(root, '2026-11-18', 960))
    expect(calendar.editing()).toBeNull()
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    el.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
    expect(calendar.editing()).toBeNull()
    // a press that was never a drag does not abort on a lost capture
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    el.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    expect(calendar.editing()).not.toBeNull()
    fire(el, 'pointerup', point(root, '2026-11-18', 960))
    await flush()
    expect(onEventChange).toHaveBeenCalledTimes(1)
  })

  it('a drop outside the grid puts the event back and asks nothing', async () => {
    const { root, onEventChange, calendar } = make()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    fire(el, 'pointermove', { x: 5000, y: 5000 })
    fire(el, 'pointerup', { x: 5000, y: 5000 })
    await flush()
    expect(onEventChange).not.toHaveBeenCalled()
    expect(calendar.editing()).toBeNull()
    expect(live(root)).toBe('review: change cancelled')
  })

  it('an event that disappears mid-drag is not proposed', async () => {
    const events = signal<CalendarEvent[]>(base)
    const { root, onEventChange, calendar } = make({ events: () => events() })
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', point(root, '2026-11-18', 960))
    events.set(base.filter((e) => e.id !== 'review'))
    // its element is gone with it; the pointer keeps reporting to the grid under it
    expect(el.isConnected).toBe(false)
    const grid = root.querySelector('[role=grid]')!
    fire(grid, 'pointermove', point(root, '2026-11-18', 990))
    fire(grid, 'pointerup', point(root, '2026-11-18', 990))
    await flush()
    expect(onEventChange).not.toHaveBeenCalled()
    expect(calendar.editing()).toBeNull()
  })

  it('unmounting in the middle of a drag cleans up: no capture, no listener, no edit', () => {
    const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week', editable: true })
    const host = document.createElement('div')
    document.body.append(host)
    const unmount = mount(<Calendar calendar={calendar} />, host)
    const el = host.querySelector<HTMLElement>('[data-key^="review:"]')!
    const grid = host.querySelector<HTMLElement>('[role=grid]')!
    fire(el, 'pointerdown', point(host, '2026-11-18', 840))
    fire(el, 'pointermove', point(host, '2026-11-18', 960))
    expect(calendar.editing()).not.toBeNull()
    unmount()
    expect(calendar.editing()).toBeNull()
    expect(el.hasPointerCapture(1)).toBe(false)
    fire(grid, 'pointerdown', { x: 150, y: 300 })
    fire(grid, 'pointermove', { x: 150, y: 400 })
    expect(calendar.selection()).toBeNull()
    host.remove()
  })

  it('attachPointer on its own: the cleanup with no drag going on removes the listeners', () => {
    const { root, calendar } = make({ editable: false })
    const grid = root.querySelector<HTMLElement>('[role=grid]')!
    const own = document.createElement('div')
    grid.append(own)
    const detach = attachPointer(own, calendar, 'time')
    detach()
    expect(() => fire(own, 'pointerdown', { x: 1, y: 1 })).not.toThrow()
  })
})

describe('who may edit', () => {
  it('an editable: false calendar takes no drag; an event of its own can say yes', async () => {
    const { root, onEventChange, calendar } = make({ editable: false, events: () => [...base, ev('mine', '2026-11-19T09:00', '2026-11-19T10:00', { editable: true })] })
    expect(block(root, 'review').hasAttribute('data-editable')).toBe(false)
    expect(block(root, 'review').querySelector('.pcal-handle')).toBeNull()
    drag(block(root, 'review'), point(root, '2026-11-18', 840), [point(root, '2026-11-18', 960)])
    expect(calendar.selection()).toBeNull()
    drag(block(root, 'mine'), point(root, '2026-11-19', 540, 0), [point(root, '2026-11-19', 600, 0)])
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-19T10:00' })
  })

  it('an event can allow a move and not a resize, or say no to both', () => {
    const { root, calendar } = make({ events: () => [ev('move-only', '2026-11-19T09:00', '2026-11-19T10:00', { editable: { move: true, resize: false } }), ev('locked', '2026-11-20T09:00', '2026-11-20T10:00', { editable: false })] })
    expect(block(root, 'move-only').querySelector('.pcal-handle')).toBeNull()
    expect(block(root, 'move-only').hasAttribute('data-editable')).toBe(true)
    expect(calendar.canEdit('move-only:2026-11-19T09:00', 'resize')).toBe(false)
    expect(block(root, 'locked').hasAttribute('data-editable')).toBe(false)
    expect(calendar.canEdit('locked:2026-11-20T09:00', 'move')).toBe(false)
    expect(calendar.canEdit('nope', 'move')).toBe(false)
    expect(calendar.beginEdit('locked:2026-11-20T09:00', 'move', 'pointer')).toBe(false)
  })
})

describe('the app decides', () => {
  it('a refusal (false), a throw and a rejection put the event back and say so', async () => {
    for (const answer of [() => false, () => { throw new Error('no') }, () => Promise.reject(new Error('no'))]) {
      const { root, calendar } = make({ onEventChange: answer as never })
      drag(block(root, 'review'), point(root, '2026-11-18', 840, 0), [point(root, '2026-11-18', 960, 0)])
      await flush()
      expect(live(root)).toBe('review: the change was not saved')
      expect(calendar.isPending('review:2026-11-18T14:00')).toBe(false)
      expect(block(root, 'review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe('840')
      for (const c of cleanups.splice(0, 2)) c()
      layout()
    }
  })

  it('while the app decides, the event is shown at its new place, marked pending and cannot be edited again', async () => {
    let answer: (ok: boolean) => void = () => undefined
    const { root, calendar, onEventChange } = make({ onEventChange: vi.fn(() => new Promise<boolean>((r) => (answer = r))) })
    drag(block(root, 'review'), point(root, '2026-11-18', 840, 0), [point(root, '2026-11-18', 960, 0)])
    await flush()
    expect(block(root, 'review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe('960')
    expect(block(root, 'review').hasAttribute('data-pending')).toBe(true)
    expect(calendar.isPending('review:2026-11-18T14:00')).toBe(true)
    expect(calendar.canEdit('review:2026-11-18T14:00', 'move')).toBe(false)
    expect(await calendar.propose('review:2026-11-18T14:00', { start: '2026-11-18T08:00', end: '2026-11-18T09:00', allDay: false })).toBe(false)
    expect(onEventChange).toHaveBeenCalledTimes(1)
    answer(true)
    await flush()
    expect(block(root, 'review').hasAttribute('data-pending')).toBe(false)
  })

  it('no onEventChange: the change is taken (and the app keeps its events)', async () => {
    const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week', editable: true })
    expect(await calendar.propose('review:2026-11-18T14:00', { start: '2026-11-18T16:00', end: '2026-11-18T17:00', allDay: false })).toBe(true)
    expect(calendar.announcement()).toBe('review moved to Wednesday 18 November, 16:00 – 17:00')
    expect(await calendar.propose('review:2026-11-18T14:00', { start: '2026-11-19', end: '2026-11-20', allDay: true }, 'resize')).toBe(true)
    expect(calendar.announcement()).toBe('review resized to Thursday 19 November')
    expect(await calendar.propose('nope', { start: '2026-11-19', end: '2026-11-20', allDay: true })).toBe(false)
  })

  it('constrainTo: business hours refuse a drop outside them; a function decides on its own', async () => {
    const { root, onEventChange } = make({ businessHours: { 3: [{ from: '09:00', to: '17:00' }] }, constrainTo: 'businessHours' })
    drag(block(root, 'review'), point(root, '2026-11-18', 840, 0), [point(root, '2026-11-18', 1020, 0)])
    await flush()
    expect(onEventChange).not.toHaveBeenCalled()
    expect(live(root)).toBe('review: the change was not saved')
    drag(block(root, 'review'), point(root, '2026-11-18', 840, 0), [point(root, '2026-11-18', 900, 0)])
    await flush()
    expect(onEventChange).toHaveBeenCalledTimes(1)
    const rule = vi.fn((range: { start: string }) => range.start.endsWith('T10:00'))
    const fn = make({ constrainTo: rule })
    expect(await fn.calendar.propose('review:2026-11-18T14:00', { start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false })).toBe(false)
    expect(await fn.calendar.propose('review:2026-11-18T14:00', { start: '2026-11-18T10:00', end: '2026-11-18T11:00', allDay: false })).toBe(true)
    expect(rule).toHaveBeenCalledWith({ start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false })
  })

  it('a recurring occurrence asks chooseScope; null or a throw cancels; without chooseScope it is "this"', async () => {
    const series = ev('standup', '2026-11-16T09:00', '2026-11-16T09:30', { recurrence: { every: 'day', start: '2026-11-16T09:00', count: 5 } as never })
    const scopes: unknown[] = [null, 'following', () => { throw new Error('closed') }]
    for (const scope of scopes) {
      const chooseScope = vi.fn(async () => (typeof scope === 'function' ? (scope as () => null)() : (scope as 'following' | null)))
      const { calendar, onEventChange, root } = make({ events: () => [series], chooseScope })
      const ok = await calendar.propose('standup:2026-11-18T09:00', { start: '2026-11-18T10:00', end: '2026-11-18T10:30', allDay: false })
      expect(chooseScope).toHaveBeenCalledWith(expect.objectContaining({ occurrence: '2026-11-18T09:00', start: '2026-11-18T10:00' }))
      if (scope === 'following') {
        expect(ok).toBe(true)
        expect(changeOf(onEventChange)).toMatchObject({ scope: 'following', occurrence: '2026-11-18T09:00' })
      } else {
        expect(ok).toBe(false)
        expect(onEventChange).not.toHaveBeenCalled()
        expect(live(root)).toBe('standup: change cancelled')
      }
    }
    const { calendar, onEventChange } = make({ events: () => [series] })
    await calendar.propose('standup:2026-11-18T09:00', { start: '2026-11-18T10:00', end: '2026-11-18T10:30', allDay: false })
    expect(changeOf(onEventChange)).toMatchObject({ scope: 'this', occurrence: '2026-11-18T09:00' })
  })
})

describe('touch', () => {
  it('a long press starts the drag; a finger that moves first is scrolling; the page does not scroll or open a menu while dragging', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { root, grid, calendar, onEventChange } = make()
    const el = block(root, 'review')
    const touch = { pointerType: 'touch' }
    // a finger that moves before the long press scrolls
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0), touch)
    fire(el, 'pointermove', point(root, '2026-11-18', 870, 0), touch)
    vi.advanceTimersByTime(400)
    expect(calendar.editing()).toBeNull()
    // a short tap: no drag, the timer is cleared on release
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0), touch)
    fire(el, 'pointerup', point(root, '2026-11-18', 840, 0), touch)
    vi.advanceTimersByTime(400)
    expect(calendar.editing()).toBeNull()
    // a long press
    fire(el, 'pointerdown', point(root, '2026-11-18', 840, 0), touch)
    fire(el, 'pointermove', point(root, '2026-11-18', 840, 0.1), touch)
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    el.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    const early = new TouchEvent('touchmove', { bubbles: true, cancelable: true })
    grid.dispatchEvent(early)
    expect(early.defaultPrevented).toBe(false)
    vi.advanceTimersByTime(350)
    expect(calendar.editing()?.key).toBe('review:2026-11-18T14:00')
    const scroll = new TouchEvent('touchmove', { bubbles: true, cancelable: true })
    grid.dispatchEvent(scroll)
    expect(scroll.defaultPrevented).toBe(true)
    fire(el, 'pointermove', point(root, '2026-11-18', 900, 0), touch)
    fire(el, 'pointerup', point(root, '2026-11-18', 900, 0), touch)
    vi.useRealTimers()
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T15:00' })
    // a mouse session does not block the context menu
    const mouseMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    el.dispatchEvent(mouseMenu)
    expect(mouseMenu.defaultPrevented).toBe(false)
  })
})

describe('auto-scroll', () => {
  it('scrolls a grid that overflows while the pointer is held near its top or bottom edge, and stops at the drop', async () => {
    const { root, grid, calendar } = make()
    Object.defineProperty(grid, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(grid, 'clientHeight', { configurable: true, value: 600 })
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1000, 600))
    grid.scrollTop = 200
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', { x: 350, y: 590 })
    await flush(60)
    const down = grid.scrollTop
    expect(down).toBeGreaterThan(200)
    fire(el, 'pointermove', { x: 350, y: 10 })
    await flush(60)
    expect(grid.scrollTop).toBeLessThan(down)
    fire(el, 'pointermove', { x: 350, y: 300 })
    await flush(30)
    const still = grid.scrollTop
    await flush(30)
    expect(grid.scrollTop).toBe(still)
    fire(el, 'pointerup', { x: 350, y: 300 })
    await flush(30)
    expect(calendar.editing()).toBeNull()
  })
})

describe('the month', () => {
  const month = (options: Partial<CalendarOptions> = {}, dir?: string) => make({ view: 'month', ...options }, dir)

  it('moves a timed event to another week: it follows the pointer by day cells; only the day changes, the time is kept', async () => {
    const { root, onEventChange } = month()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', null))
    fire(el, 'pointermove', point(root, '2026-11-26', null))
    // to the top of Thursday's cell in the next row (x +100; y from the event's top at 420 to the cell's top at 500)
    expect(el.style.transform).toBe('translate(100px, 80px)')
    fire(el, 'pointerup', point(root, '2026-11-26', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-26T14:00', end: '2026-11-26T15:00', allDay: false })
  })

  it('resizes a bar from either end; a timed event inside one day has no handles in the month', async () => {
    const { root, onEventChange } = month()
    expect(block(root, 'review').querySelector('.pcal-handle')).toBeNull()
    const conf = block(root, 'conf')
    fire(conf.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', point(root, '2026-11-18', null))
    fire(conf, 'pointermove', point(root, '2026-11-20', null))
    expect(conf.style.transform).toBe('translateX(0px)')
    expect(conf.style.width).toBe('498px')
    fire(conf, 'pointerup', point(root, '2026-11-20', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-16', end: '2026-11-21', allDay: true })
    const again = block(root, 'conf')
    fire(again.querySelector('.pcal-handle[data-edge=start]')!, 'pointerdown', point(root, '2026-11-16', null))
    fire(again, 'pointermove', point(root, '2026-11-17', null))
    expect(again.style.transform).toBe('translateX(102px)')
    fire(again, 'pointermove', point(root, '2026-11-30', null)) // another row: the bar stops at its row's edge
    fire(again, 'pointerup', point(root, '2026-11-17', null))
    await flush()
    expect(changeOf(onEventChange, 1)).toMatchObject({ start: '2026-11-17', end: '2026-11-19' })
  })

  it('right to left: the end of a bar is its left side, and resizing it grows the bar to the left', async () => {
    const { root, onEventChange } = month({}, 'rtl')
    const conf = block(root, 'conf')
    // mirrored model: Monday 16 is x 600-700, Friday 20 is x 200-300; the bar (16 to 18) is x 400-700
    fire(conf.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', point(root, '2026-11-18', null))
    fire(conf, 'pointermove', point(root, '2026-11-20', null))
    expect(conf.style.transform).toBe('translateX(-198px)')
    expect(conf.style.width).toBe('498px')
    fire(conf, 'pointerup', point(root, '2026-11-20', null))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-16', end: '2026-11-21' })
    const again = block(root, 'conf')
    fire(again.querySelector('.pcal-handle[data-edge=start]')!, 'pointerdown', point(root, '2026-11-16', null))
    fire(again, 'pointermove', point(root, '2026-11-17', null))
    // the start (on the right) moves in to Tuesday's right edge (x 600, less 2); the left side stays
    expect(again.style.transform).toBe('translateX(0px)')
    expect(again.style.width).toBe('198px')
    fire(again, 'pointercancel', point(root, '2026-11-17', null))
  })

  it('a multi-day timed event is resized by whole days in the month, keeping its time of day', async () => {
    const { root, onEventChange } = month({ events: () => [ev('trip', '2026-11-18T09:00', '2026-11-19T18:00')] })
    const trip = block(root, 'trip')
    drag(trip.querySelector('.pcal-handle[data-edge=end]')!, point(root, '2026-11-19', null), [point(root, '2026-11-21', null)])
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T09:00', end: '2026-11-21T18:00' })
  })

  it('selects days by dragging over them', () => {
    const { root, calendar, onSelect } = month()
    const grid = root.querySelector<HTMLElement>('[role=grid]')!
    fire(root.querySelector('.pcal-day[data-date="2026-11-24"]')!, 'pointerdown', point(root, '2026-11-24', null))
    fire(grid, 'pointermove', point(root, '2026-11-26', null))
    fire(grid, 'pointerup', point(root, '2026-11-26', null))
    expect(calendar.selection()).toEqual({ start: '2026-11-24', end: '2026-11-27', allDay: true })
    expect(onSelect).toHaveBeenLastCalledWith({ start: '2026-11-24', end: '2026-11-27', allDay: true })
  })
})

describe('editing with the keyboard', () => {
  const key = (on: Element, k: string, init: KeyboardEventInit = {}): boolean => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
    on.dispatchEvent(e)

    return e.defaultPrevented
  }
  const current = (root: HTMLElement): HTMLElement => block(root, 'review')

  it('Enter grabs, the arrows move by the snap and the day, Shift resizes, Enter drops; announced; focus stays on the event', async () => {
    const { root, calendar, onEventChange } = make()
    current(root).focus()
    expect(key(current(root), 'Enter')).toBe(true)
    expect(calendar.editing()).toMatchObject({ key: 'review:2026-11-18T14:00', mode: 'move', by: 'keyboard' })
    expect(live(root)).toBe('review grabbed. Arrow keys move it, Shift with them resizes, Enter drops it, Escape cancels.')
    expect(key(current(root), 'ArrowDown')).toBe(true)
    // the keyboard moves the event through the layout: it is now in the 14:30 slot
    expect(current(root).closest('.pcal-slot')!.getAttribute('data-minute')).toBe('870')
    await flush()
    expect(document.activeElement).toBe(current(root))
    expect(key(current(root), 'ArrowRight')).toBe(true)
    expect(current(root).closest('.pcal-slot')!.getAttribute('data-date')).toBe('2026-11-19')
    expect(key(current(root), 'ArrowDown', { shiftKey: true })).toBe(true)
    expect(calendar.editing()).toMatchObject({ mode: 'resize', target: { start: '2026-11-19T14:30', end: '2026-11-19T16:00' } })
    // a key that does nothing to an event is left to the grid, which does not use it either
    expect(key(current(root), 'x')).toBe(false)
    expect(key(current(root), 'Enter')).toBe(true)
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-19T14:30', end: '2026-11-19T16:00' })
    expect(live(root)).toBe('review resized to Thursday 19 November, 14:30 – 16:00')
  })

  it('Escape cancels a keyboard grab and puts it back; Space grabs too', () => {
    const { root, calendar, onEventChange } = make()
    expect(key(current(root), ' ')).toBe(true)
    key(current(root), 'ArrowUp')
    expect(current(root).closest('.pcal-slot')!.getAttribute('data-minute')).toBe('810')
    expect(key(current(root), 'Escape')).toBe(true)
    expect(calendar.editing()).toBeNull()
    expect(current(root).closest('.pcal-slot')!.getAttribute('data-minute')).toBe('840')
    expect(live(root)).toBe('review: change cancelled')
    expect(onEventChange).not.toHaveBeenCalled()
  })

  it('not editable: Enter on an event is not an edit; a move-only event refuses Shift', () => {
    const locked = make({ editable: false })
    expect(key(block(locked.root, 'review'), 'Enter')).toBe(false)
    expect(locked.calendar.editing()).toBeNull()
    const { root, calendar } = make({ events: () => [ev('m', '2026-11-18T14:00', '2026-11-18T15:00', { editable: { move: true, resize: false } })] })
    const m = block(root, 'm')
    key(m, 'Enter')
    expect(key(m, 'ArrowDown', { shiftKey: true })).toBe(false)
    expect(calendar.editing()?.mode).toBe('move')
  })

  it('a grab of one event leaves the keys of another event alone; a second grab is refused', () => {
    const { root, calendar } = make({ events: () => [ev('a', '2026-11-18T09:00', '2026-11-18T10:00'), ev('b', '2026-11-18T11:00', '2026-11-18T12:00')] })
    key(block(root, 'a'), 'Enter')
    expect(key(block(root, 'b'), 'ArrowDown')).toBe(false)
    expect(key(block(root, 'b'), 'Enter')).toBe(false)
    expect(calendar.editing()?.key).toBe('a:2026-11-18T09:00')
  })

  it('in the month the arrows move by a day and a week', async () => {
    const { root, onEventChange } = make({ view: 'month' })
    key(current(root), 'Enter')
    key(current(root), 'ArrowDown')
    key(current(root), 'ArrowLeft')
    expect(current(root).closest('.pcal-day')!.getAttribute('data-date')).toBe('2026-11-24')
    key(current(root), 'Enter')
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-24T14:00', end: '2026-11-24T15:00' })
  })

  it('the "+N more" button is not an event: Escape on it clears the selection', () => {
    const many = Array.from({ length: 5 }, (_, i) => ev(`e${i}`, '2026-11-18T09:00', '2026-11-18T10:00'))
    const { root, calendar } = make({ view: 'month', events: () => many, monthCapacity: 2 })
    calendar.selectDay('2026-11-18')
    const more = root.querySelector<HTMLElement>('.pcal-more')!
    expect(key(more, 'ArrowDown')).toBe(false)
    expect(key(more, 'Escape')).toBe(true)
    expect(calendar.selection()).toBeNull()
  })

  it('the session API: dropEdit and previewEdit without a session do nothing; dropEdit with no target asks nothing', async () => {
    const { calendar, onEventChange } = make()
    expect(await calendar.dropEdit()).toBe(false)
    calendar.previewEdit({ start: '2026-11-18T09:00', end: '2026-11-18T10:00', allDay: false })
    calendar.cancelEdit()
    expect(calendar.editing()).toBeNull()
    expect(calendar.beginEdit('review:2026-11-18T14:00', 'move', 'pointer')).toBe(true)
    expect(calendar.beginEdit('review:2026-11-18T14:00', 'move', 'pointer')).toBe(false)
    expect(calendar.snap()).toBe(30)
    expect(calendar.minDuration()).toBe(30)
    expect(await calendar.dropEdit()).toBe(false) // the target is where it was: nothing to ask
    expect(onEventChange).not.toHaveBeenCalled()
  })
})

describe('the edges of the pointer layer', () => {
  it('a drag of one event while another is grabbed by the keyboard does not start, and leaves the grab alone', () => {
    const { root, calendar } = make({ events: () => [ev('a', '2026-11-18T09:00', '2026-11-18T10:00'), ev('b', '2026-11-18T11:00', '2026-11-18T12:00')] })
    block(root, 'a').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    const b = block(root, 'b')
    fire(b, 'pointerdown', point(root, '2026-11-18', 660))
    fire(b, 'pointermove', point(root, '2026-11-18', 780))
    expect(calendar.editing()).toMatchObject({ key: 'a:2026-11-18T09:00', by: 'keyboard' })
    expect(b.hasPointerCapture(1)).toBe(false)
    expect(b.style.transform).toBe('')
    // the press is over: a later move does nothing
    fire(b, 'pointermove', point(root, '2026-11-18', 840))
    expect(calendar.editing()?.key).toBe('a:2026-11-18T09:00')
  })

  it('a pointer cancelled before the drag started cancels nothing and does not swallow the next click', () => {
    const { root, calendar, onEventClick } = make()
    const cancel = vi.spyOn(calendar, 'cancelEdit')
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointercancel', point(root, '2026-11-18', 840))
    expect(cancel).not.toHaveBeenCalled()
    el.click()
    expect(onEventClick).toHaveBeenCalledTimes(1)
  })

  it('a grid that does not overflow is not scrolled while a drag is held', async () => {
    const { root, grid } = make()
    const el = block(root, 'review')
    fire(el, 'pointerdown', point(root, '2026-11-18', 840))
    fire(el, 'pointermove', { x: 350, y: 1990 })
    await flush(40)
    expect(grid.scrollTop).toBe(0)
    fire(el, 'pointerup', { x: 350, y: 1990 })
  })

  it('a move whose start would be above dayStart is not drawn, and is still proposed', async () => {
    const { root, onEventChange } = make({ dayStart: '08:00', events: () => [ev('early', '2026-11-18T08:00', '2026-11-18T10:00')] })
    const el = block(root, 'early')
    fire(el, 'pointerdown', point(root, '2026-11-18', 570, 0))
    fire(el, 'pointermove', point(root, '2026-11-18', 480, 0))
    expect(el.style.transform).toBe('')
    fire(el, 'pointerup', point(root, '2026-11-18', 480, 0))
    await flush()
    expect(changeOf(onEventChange)).toMatchObject({ start: '2026-11-18T06:30', end: '2026-11-18T08:30' })
  })

  it('a resize to dayEnd draws the block down to its old bottom when the end has no slot', () => {
    const { root } = make({ dayEnd: '18:00', events: () => [ev('late', '2026-11-18T16:00', '2026-11-18T17:00')] })
    const el = block(root, 'late')
    fire(el.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', point(root, '2026-11-18', 990, 1))
    fire(el, 'pointermove', point(root, '2026-11-18', 1050, 0.99))
    // the end (18:00) is past the last slot: the height runs to the block's own bottom (two slots from 16:00)
    expect(el.style.height).toBe(`${2 * SLOT_PX}px`)
    fire(el, 'pointercancel', point(root, '2026-11-18', 1050))
  })

  it('a month bar resized into another row stops at the edge of its own row, on either side', () => {
    const { root } = make({ view: 'month' })
    const conf = block(root, 'conf')
    fire(conf.querySelector('.pcal-handle[data-edge=end]')!, 'pointerdown', point(root, '2026-11-18', null))
    fire(conf, 'pointermove', point(root, '2026-12-02', null))
    // the row ends on Sunday 22 (x 600-700): the bar reaches it and no further
    expect(conf.style.width).toBe('698px')
    fire(conf, 'pointercancel', point(root, '2026-12-02', null))
    const trip = make({ view: 'month', events: () => [ev('trip', '2026-11-18', '2026-11-21')] })
    const bar = block(trip.root, 'trip')
    fire(bar.querySelector('.pcal-handle[data-edge=start]')!, 'pointerdown', point(trip.root, '2026-11-18', null))
    fire(bar, 'pointermove', point(trip.root, '2026-11-04', null))
    // its start moves to Monday 16, the first cell of its row (x 0), not to the 4th
    expect(bar.style.transform).toBe('translateX(-198px)')
    fire(bar, 'pointercancel', point(trip.root, '2026-11-04', null))
  })

  it('an unhandled key on a slot is left to the browser', () => {
    const { root } = make()
    const slotEl = root.querySelector<HTMLElement>('.pcal-slot[data-date="2026-11-18"][data-minute="0"]')!
    const e = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true })
    slotEl.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  it('an all-day bar that goes on past the week is flagged on its cut end and has no handle there', () => {
    const { root } = make({ events: () => [ev('long', '2026-11-20', '2026-11-26')] })
    const bar = block(root, 'long')
    expect(bar.hasAttribute('data-continues-after')).toBe(true)
    expect([...bar.querySelectorAll('.pcal-handle')].map((h) => h.getAttribute('data-edge'))).toEqual(['start'])
  })

  it('the keyboard edit of a key that is not shown does nothing', () => {
    const { calendar } = make()
    expect(calendar.onEventKeyDown('nope:1', new KeyboardEvent('keydown', { key: 'Enter' }), 'time')).toBe(false)
  })

  it('an event that only says move falls back to the calendar for resize', () => {
    const on = make({ events: () => [ev('m', '2026-11-18T09:00', '2026-11-18T10:00', { editable: { move: true } })] })
    expect(on.calendar.canEdit('m:2026-11-18T09:00', 'resize')).toBe(true)
    const off = make({ editable: false, events: () => [ev('m', '2026-11-18T09:00', '2026-11-18T10:00', { editable: { move: true } })] })
    expect(off.calendar.canEdit('m:2026-11-18T09:00', 'resize')).toBe(false)
  })

  it("constrainTo 'businessHours' without businessHours allows everything", async () => {
    const { calendar } = make({ constrainTo: 'businessHours' })
    expect(await calendar.propose('review:2026-11-18T14:00', { start: '2026-11-18T03:00', end: '2026-11-18T04:00', allDay: false })).toBe(true)
  })

  it('minBlockMinutes makes a short block as tall as the minimum', () => {
    const { root } = make({ minBlockMinutes: 60, events: () => [ev('short', '2026-11-18T09:00', '2026-11-18T09:10')] })
    expect(block(root, 'short').style.getPropertyValue('--pcal-slots')).toBe('2.000')
  })

  it('an array of events instead of a function says how to pass it', () => {
    expect(() => createCalendar({ events: [] as never })).toThrow('Pass () => yourArray, or a signal.')
  })
})
