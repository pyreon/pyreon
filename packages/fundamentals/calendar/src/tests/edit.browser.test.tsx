// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests observe real DOM events
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import type {} from '@vitest/browser-playwright'
import { cdp, page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../styles.css'
import { Calendar } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions, EventChange } from '../index'

const cleanups: (() => void)[] = []
const sleep = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
const NOW = Date.UTC(2026, 10, 18, 7, 0)
const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })

function render(node: VNodeChild, dir?: string): HTMLElement {
  const root = document.createElement('div')
  if (dir !== undefined) root.dir = dir
  document.body.append(root)
  const unmount = mount(node as never, root)
  cleanups.push(() => {
    unmount()
    root.remove()
  })

  return root
}

interface Harness {
  calendar: ReturnType<typeof createCalendar>
  root: HTMLElement
  events: ReturnType<typeof signal<CalendarEvent[]>>
  changes: EventChange[]
}

function make(options: Partial<CalendarOptions> & { list?: CalendarEvent[]; dir?: string; accept?: (c: EventChange) => boolean | Promise<boolean | void> } = {}): Harness {
  const events = signal<CalendarEvent[]>(options.list ?? [ev('Review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('Trip', '2026-11-17', '2026-11-19')])
  const changes: EventChange[] = []
  const calendar = createCalendar({
    events: () => events(),
    date: '2026-11-18',
    now: () => NOW,
    view: 'week',
    dayStart: '08:00',
    dayEnd: '20:00',
    editable: true,
    onEventChange: (c) => {
      changes.push(c)

      return options.accept === undefined ? true : options.accept(c)
    },
    ...options,
  } as CalendarOptions)
  const root = render(<Calendar calendar={calendar} />, options.dir)

  return { calendar, root, events, changes }
}

const point = (root: HTMLElement, date: string, minute: number, frac = 0.5): { x: number; y: number } => {
  const cell = root.querySelector(`.pcal-slot[data-date="${date}"][data-minute="${minute}"]`) as HTMLElement
  const r = cell.getBoundingClientRect()

  return { x: r.left + r.width / 2, y: r.top + r.height * frac }
}

const dayPoint = (root: HTMLElement, selector: string, date: string): { x: number; y: number } => {
  const r = (root.querySelector(`${selector}[data-date="${date}"]`) as HTMLElement).getBoundingClientRect()

  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

async function mouse(type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number): Promise<void> {
  await cdp().send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1 })
}

async function drag(from: { x: number; y: number }, to: { x: number; y: number }[]): Promise<void> {
  await mouse('mouseMoved', from.x, from.y)
  await mouse('mousePressed', from.x, from.y)
  for (const p of to) {
    await mouse('mouseMoved', p.x, p.y)
    await sleep(20)
  }
  const last = to.at(-1) as { x: number; y: number }
  await mouse('mouseReleased', last.x, last.y)
  await sleep(40)
}

const block = (root: HTMLElement, id: string): HTMLElement => root.querySelector(`.pcal-block[data-key^="${id}:"]`) as HTMLElement

const centre = (el: HTMLElement): { x: number; y: number } => {
  const r = el.getBoundingClientRect()

  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

beforeEach(async () => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
  await page.viewport(1280, 900)
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('moving with the pointer, in the time grid', () => {
  it('within a day and across days: the start snaps to the step and the duration is kept', async () => {
    const { root, changes } = make()
    const from = centre(block(root, 'Review'))
    // grab the middle of the block (14:30), drop it on Thursday at 16:00: the start lands at 15:30
    await drag(from, [{ x: from.x + 20, y: from.y + 20 }, point(root, '2026-11-19', 16 * 60, 0.05)])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ start: '2026-11-19T15:30', end: '2026-11-19T16:30', allDay: false })
  })

  it('moves only after the slop: a click is still a click', async () => {
    const onEventClick = vi.fn()
    const { root, changes } = make({ onEventClick })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x + 1, y: from.y + 1 }])
    expect(changes).toHaveLength(0)
    expect(onEventClick).toHaveBeenCalledTimes(1)
  })

  it('a drag does not click the event, and leaves no transform behind', async () => {
    const onEventClick = vi.fn()
    const { root } = make({ onEventClick })
    const el = block(root, 'Review')
    const from = centre(el)
    // a few pixels past the slop and back inside the same block: the release lands on the block, which would click it
    await drag(from, [{ x: from.x, y: from.y + 6 }])
    expect(onEventClick).not.toHaveBeenCalled()
    expect(el.style.transform).toBe('')
    expect(el.hasAttribute('data-dragging')).toBe(false)
  })

  it('shows the event at the snapped place while dragging, and only that event changes in the DOM', async () => {
    const { root } = make()
    const seen = new Set<Element>()
    const log: string[] = []
    const observer = new MutationObserver((records) =>
      records.forEach((r) => {
        seen.add(r.target as Element)
        log.push(`${(r.target as HTMLElement).className}:${r.attributeName ?? 'children'}`)
      }),
    )
    observer.observe(root, { attributes: true, subtree: true, childList: true })
    const el = block(root, 'Review')
    const from = centre(el)
    await mouse('mouseMoved', from.x, from.y)
    await mouse('mousePressed', from.x, from.y)
    await mouse('mouseMoved', from.x, from.y + 56)
    await sleep(40)
    expect(el.hasAttribute('data-dragging')).toBe(true)
    expect(el.style.transform).toMatch(/translate\(/)
    observer.disconnect()
    await mouse('mouseReleased', from.x, from.y + 56)
    await sleep(40)
    const outside = [...seen].filter((t) => !el.contains(t) && !t.matches?.('.pcal-live') && !t.closest?.('.pcal-live'))
    expect(outside.length === 0 ? [] : log).toEqual([])
  })

  it('Escape cancels the drag and puts the event back', async () => {
    const { root, changes, calendar } = make()
    const el = block(root, 'Review')
    const from = centre(el)
    await mouse('mouseMoved', from.x, from.y)
    await mouse('mousePressed', from.x, from.y)
    await mouse('mouseMoved', from.x + 30, from.y + 80)
    await sleep(40)
    expect(calendar.editing()).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await sleep(20)
    expect(calendar.editing()).toBeNull()
    expect(el.style.transform).toBe('')
    await mouse('mouseReleased', from.x + 30, from.y + 80)
    await sleep(40)
    expect(changes).toHaveLength(0)
    expect(calendar.editing()).toBeNull()
    expect(el.style.transform).toBe('')
  })

  it('a drop outside the grid cancels', async () => {
    const { root, changes, calendar } = make()
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 40 }, { x: 5, y: 880 }])
    expect(changes).toHaveLength(0)
    expect(calendar.editing()).toBeNull()
  })
})

describe('resizing', () => {
  it('drags the bottom edge to a snapped end, and not below the minimum', async () => {
    const { root, changes } = make()
    const el = block(root, 'Review')
    const r = el.getBoundingClientRect()
    await drag({ x: r.left + r.width / 2, y: r.bottom - 3 }, [point(root, '2026-11-18', 16 * 60, 0.4)])
    expect(changes[0]).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T16:00' })
    changes.length = 0
    const again = block(root, 'Review').getBoundingClientRect()
    await drag({ x: again.left + again.width / 2, y: again.bottom - 3 }, [point(root, '2026-11-18', 13 * 60, 0.5)])
    expect(changes[0]).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T14:30' })
  })

  it('drags the top edge', async () => {
    const { root, changes } = make()
    const r = block(root, 'Review').getBoundingClientRect()
    await drag({ x: r.left + r.width / 2, y: r.top + 3 }, [point(root, '2026-11-18', 13 * 60, 0.05)])
    expect(changes[0]).toMatchObject({ start: '2026-11-18T13:00', end: '2026-11-18T15:00' })
  })
})

describe('the all-day row and select by dragging', () => {
  it('a timed event dropped on the all-day row becomes all-day, and back', async () => {
    const { root, changes } = make()
    const from = centre(block(root, 'Review'))
    await drag(from, [dayPoint(root, '.pcal-allday-cell', '2026-11-20')])
    expect(changes[0]).toMatchObject({ start: '2026-11-20', end: '2026-11-21', allDay: true })
    changes.length = 0
    const trip = root.querySelector('.pcal-allday-event[data-key^="Trip:"]') as HTMLElement
    await drag(centre(trip), [point(root, '2026-11-19', 10 * 60, 0.1)])
    expect(changes[0]).toMatchObject({ start: '2026-11-19T10:00', end: '2026-11-19T11:00', allDay: false })
  })

  it('dragging over empty slots selects them, once, and does not select the cell it ends on again', async () => {
    const onSelect = vi.fn()
    const { root } = make({ onSelect })
    await drag(point(root, '2026-11-19', 9 * 60), [point(root, '2026-11-19', 10 * 60 + 30)])
    expect(onSelect).toHaveBeenCalled()
    expect(onSelect.mock.calls.at(-1)![0]).toMatchObject({ start: '2026-11-19T09:00', end: '2026-11-19T11:00', allDay: false })
  })
})

describe('the app decides', () => {
  it('shows the new place while it waits, and puts the event back when it says no', async () => {
    let finish: (v: boolean) => void = () => undefined
    const { root, changes, calendar } = make({ accept: () => new Promise<boolean>((r) => (finish = r)) })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(changes).toHaveLength(1)
    expect(block(root, 'Review').hasAttribute('data-pending')).toBe(true)
    expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe(String(15 * 60))
    finish(false)
    await sleep(60)
    expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe(String(14 * 60))
    expect(root.querySelector('.pcal-live')!.textContent).toBe('Review: the change was not saved')
    expect(calendar.isPending('Review:2026-11-18T14:00')).toBe(false)
  })

  it('rolls back when the app throws or rejects', async () => {
    for (const accept of [(): never => { throw new Error('nope') }, (): Promise<boolean> => Promise.reject(new Error('nope'))]) {
      const { root, calendar } = make({ accept })
      const from = centre(block(root, 'Review'))
      await drag(from, [{ x: from.x, y: from.y + 56 }])
      expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe(String(14 * 60))
      expect(calendar.editing()).toBeNull()
    }
  })

  it('an accepted change is announced in words', async () => {
    const { root, events } = make({ accept: (c) => { events.set([{ ...c.event, start: c.start, end: c.end }, ev('Trip', '2026-11-17', '2026-11-19')]); return true } })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(root.querySelector('.pcal-live')!.textContent).toBe('Review moved to Wednesday 18 November, 15:00 – 16:00')
    expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe(String(15 * 60))
  })

  it('editable: false on the calendar means no drag', async () => {
    const { root, changes } = make({ editable: false })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(changes).toHaveLength(0)
  })

  it('editable: false on one event means no drag, even when the calendar is editable', async () => {
    const { root, changes } = make({ list: [ev('Review', '2026-11-18T14:00', '2026-11-18T15:00', { editable: false })] })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(changes).toHaveLength(0)
    expect(block(root, 'Review').hasAttribute('data-editable')).toBe(false)
  })

  it('an event can allow a move and nothing else on a calendar that is not editable: no handles', () => {
    const { root } = make({ editable: false, list: [ev('Review', '2026-11-18T14:00', '2026-11-18T15:00', { editable: { move: true } })] })
    expect(root.querySelectorAll('.pcal-handle')).toHaveLength(0)
    expect(block(root, 'Review').hasAttribute('data-editable')).toBe(true)
  })

  it('an occurrence waiting for the app cannot be proposed again', async () => {
    const { calendar } = make({ accept: () => new Promise<boolean>(() => undefined) })
    const key = 'Review:2026-11-18T14:00'
    void calendar.propose(key, { start: '2026-11-18T15:00' as never, end: '2026-11-18T16:00' as never, allDay: false })
    await sleep(20)
    expect(await calendar.propose(key, { start: '2026-11-18T16:00' as never, end: '2026-11-18T17:00' as never, allDay: false })).toBe(false)
  })

  it('constrainTo businessHours refuses a change outside them', async () => {
    const { root, changes } = make({ constrainTo: 'businessHours', businessHours: { 1: [{ from: '09:00', to: '15:00' }], 2: [{ from: '09:00', to: '15:00' }], 3: [{ from: '09:00', to: '15:00' }], 4: [{ from: '09:00', to: '15:00' }] } })
    const from = centre(block(root, 'Review'))
    await drag(from, [point(root, '2026-11-18', 16 * 60, 0.05)])
    expect(changes).toHaveLength(0)
    expect(root.querySelector('.pcal-live')!.textContent).toBe('Review: the change was not saved')
  })
})

describe('the keyboard', () => {
  const CODES: Record<string, number> = { Enter: 13, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Escape: 27 }

  async function key(k: string, shift = false): Promise<void> {
    const base = { key: k, code: k, windowsVirtualKeyCode: CODES[k] ?? 0, modifiers: shift ? 8 : 0 }
    await cdp().send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(k === 'Enter' ? { text: '\r' } : {}) })
    await cdp().send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await sleep(30)
  }

  it('Enter grabs, arrows move by the step and by a day, Enter drops', async () => {
    const { root, changes, calendar } = make()
    block(root, 'Review').focus()
    await key('Enter')
    expect(calendar.editing()?.by).toBe('keyboard')
    expect(root.querySelector('.pcal-live')!.textContent).toMatch(/^Review grabbed/)
    await key('ArrowDown')
    await key('ArrowDown')
    await key('ArrowRight')
    expect(document.activeElement).toBe(block(root, 'Review'))
    expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-date')).toBe('2026-11-19')
    await key('Enter')
    expect(changes[0]).toMatchObject({ start: '2026-11-19T15:00', end: '2026-11-19T16:00' })
  })

  it('Shift with the arrows resizes the end, and Escape cancels and restores', async () => {
    const { root, changes, calendar } = make()
    block(root, 'Review').focus()
    await key('Enter')
    await key('ArrowDown', true)
    await key('ArrowDown', true)
    await key('Escape')
    expect(calendar.editing()).toBeNull()
    expect(changes).toHaveLength(0)
    expect(block(root, 'Review').closest('.pcal-slot')!.getAttribute('data-minute')).toBe(String(14 * 60))
    block(root, 'Review').focus()
    await key('Enter')
    await key('ArrowDown', true)
    await key('Enter')
    expect(changes[0]).toMatchObject({ start: '2026-11-18T14:00', end: '2026-11-18T15:30' })
  })
})

describe('the month, right to left, recurring events, touch', () => {
  const monthEvent = (root: HTMLElement, id: string): HTMLElement => root.querySelector(`.pcal-event[data-key^="${id}:"]`) as HTMLElement
  const dayCentre = (root: HTMLElement, date: string): { x: number; y: number } => dayPoint(root, '.pcal-day', date)

  it('moves across days and weeks, keeping the time of day of a timed event', async () => {
    const { root, changes } = make({ view: 'month', list: [ev('Call', '2026-11-18T09:00', '2026-11-18T10:00'), ev('Trip', '2026-11-17', '2026-11-19')] })
    await drag(centre(monthEvent(root, 'Call')), [dayCentre(root, '2026-11-25')])
    expect(changes[0]).toMatchObject({ start: '2026-11-25T09:00', end: '2026-11-25T10:00' })
    changes.length = 0
    const trip = monthEvent(root, 'Trip')
    const r = trip.getBoundingClientRect()
    await drag({ x: r.left + r.width * 0.75, y: r.top + r.height / 2 }, [dayCentre(root, '2026-11-26')])
    expect(changes[0]).toMatchObject({ start: '2026-11-25', end: '2026-11-27', allDay: true })
  })

  it('resizes an all-day bar from its end and from its start', async () => {
    const { root, changes } = make({ view: 'month', list: [ev('Trip', '2026-11-17', '2026-11-19')] })
    const bar = monthEvent(root, 'Trip').getBoundingClientRect()
    await drag({ x: bar.right - 3, y: bar.top + bar.height / 2 }, [dayCentre(root, '2026-11-20')])
    expect(changes[0]).toMatchObject({ start: '2026-11-17', end: '2026-11-21', allDay: true })
    changes.length = 0
    const again = monthEvent(root, 'Trip').getBoundingClientRect()
    await drag({ x: again.left + 3, y: again.top + again.height / 2 }, [dayCentre(root, '2026-11-16')])
    expect(changes[0]).toMatchObject({ start: '2026-11-16', end: '2026-11-19' })
  })

  it('right to left: the end handle is on the left, and the drag lands on the day under the pointer', async () => {
    const { root, changes } = make({ view: 'month', dir: 'rtl', list: [ev('Trip', '2026-11-17', '2026-11-19')] })
    const bar = monthEvent(root, 'Trip').getBoundingClientRect()
    expect((monthEvent(root, 'Trip').querySelector('.pcal-handle[data-edge="end"]') as HTMLElement).getBoundingClientRect().left).toBeLessThan(bar.left + 10)
    await drag({ x: bar.left + 3, y: bar.top + bar.height / 2 }, [dayCentre(root, '2026-11-20')])
    expect(changes[0]).toMatchObject({ start: '2026-11-17', end: '2026-11-21' })
  })

  it('a recurring event asks for the scope, and the plain data it produces round-trips through the calendar', async () => {
    const weekly: CalendarEvent = { id: 'Standup', title: 'Standup', start: '2026-11-16T09:00' as never, end: '2026-11-16T09:30' as never, recurrence: { every: 'week', start: '2026-11-16T09:00', count: 4 } as never }
    const asked: string[] = []
    const { root, events } = make({
      date: '2026-11-23',
      list: [weekly],
      chooseScope: (c) => {
        asked.push(c.occurrence as string)

        return 'following'
      },
      accept: async (c) => {
        const { applyEventChange } = await import('../index')
        events.set(applyEventChange(c.event, c, 'Europe/Prague'))

        return true
      },
    })
    const from = centre(block(root, 'Standup'))
    await drag(from, [point(root, '2026-11-25', 11 * 60, 0.05)])
    expect(asked).toEqual(['2026-11-23T09:00'])
    expect(events().map((e) => e.id)).toEqual(['Standup', 'Standup~2026-11-23T09:00'])
    expect(root.querySelector('.pcal-block[data-key^="Standup~2026-11-23T09:00:"]')!.closest('.pcal-slot')!.getAttribute('data-date')).toBe('2026-11-25')
    expect(root.querySelectorAll('.pcal-block[data-key^="Standup:"]')).toHaveLength(0)
  })

  it('cancelling the scope leaves everything alone', async () => {
    const weekly: CalendarEvent = { id: 'Standup', title: 'Standup', start: '2026-11-16T09:00' as never, end: '2026-11-16T09:30' as never, recurrence: { every: 'week', start: '2026-11-16T09:00' } as never }
    const { root, changes, calendar } = make({ list: [weekly], chooseScope: () => null })
    const from = centre(block(root, 'Standup'))
    await drag(from, [point(root, '2026-11-18', 11 * 60, 0.05)])
    expect(changes).toHaveLength(0)
    expect(calendar.isPending('Standup:2026-11-16T09:00')).toBe(false)
  })

  async function touch(type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }): Promise<void> {
    await cdp().send('Input.dispatchTouchEvent', { type, touchPoints: p === undefined ? [] : [{ x: p.x, y: p.y, id: 1 }] })
  }

  it('touch: a long press starts the drag; a finger that moves first does not (it is scrolling)', async () => {
    const { root, changes } = make()
    const from = centre(block(root, 'Review'))
    await touch('touchStart', from)
    await touch('touchMove', { x: from.x, y: from.y + 40 })
    await sleep(500)
    await touch('touchMove', { x: from.x, y: from.y + 60 })
    await touch('touchEnd')
    await sleep(50)
    expect(changes).toHaveLength(0)
    await touch('touchStart', from)
    await sleep(500)
    await touch('touchMove', { x: from.x, y: from.y + 30 })
    await touch('touchMove', { x: from.x, y: from.y + 56 })
    await touch('touchEnd')
    await sleep(60)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ start: '2026-11-18T15:00' })
  })
})

describe('edges and leaks', () => {
  it('a change that never settles keeps the event pending and does not block the others', async () => {
    const { root, changes, calendar } = make({ accept: () => new Promise<boolean>(() => undefined), list: [ev('Review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('Other', '2026-11-19T10:00', '2026-11-19T11:00')] })
    const from = centre(block(root, 'Review'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(calendar.isPending('Review:2026-11-18T15:00') || calendar.isPending('Review:2026-11-18T14:00')).toBe(true)
    const again = centre(block(root, 'Review'))
    await drag(again, [{ x: again.x, y: again.y + 56 }])
    expect(changes).toHaveLength(1)
    const other = centre(block(root, 'Other'))
    await drag(other, [{ x: other.x, y: other.y + 56 }])
    expect(changes).toHaveLength(2)
  })

  it('two rapid drags both ask, in order; the events changing in the middle of a drag cancels it quietly', async () => {
    const { root, changes, events, calendar } = make({ list: [ev('Review', '2026-11-18T14:00', '2026-11-18T15:00'), ev('Other', '2026-11-19T10:00', '2026-11-19T11:00')] })
    const a = centre(block(root, 'Review'))
    const b = centre(block(root, 'Other'))
    await drag(a, [{ x: a.x, y: a.y + 56 }])
    await drag(b, [{ x: b.x, y: b.y + 56 }])
    expect(changes.map((c) => c.event.id)).toEqual(['Review', 'Other'])
    const c = centre(block(root, 'Review'))
    await mouse('mouseMoved', c.x, c.y)
    await mouse('mousePressed', c.x, c.y)
    await mouse('mouseMoved', c.x, c.y + 56)
    await sleep(30)
    events.set([ev('Other', '2026-11-19T10:00', '2026-11-19T11:00')])
    await sleep(30)
    await mouse('mouseReleased', c.x, c.y + 56)
    await sleep(40)
    expect(changes).toHaveLength(2)
    expect(calendar.editing()).toBeNull()
  })

  it('a second pointer is ignored while one drags, and a cancelled pointer restores', async () => {
    const { root, changes, calendar } = make()
    const el = block(root, 'Review')
    const from = centre(el)
    await mouse('mouseMoved', from.x, from.y)
    await mouse('mousePressed', from.x, from.y)
    await mouse('mouseMoved', from.x, from.y + 40)
    await sleep(30)
    el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))
    await sleep(20)
    expect(calendar.editing()).toBeNull()
    expect(el.style.transform).toBe('')
    await mouse('mouseReleased', from.x, from.y + 40)
    expect(changes).toHaveLength(0)
  })

  it('unmounting removes every listener, capture and timer', async () => {
    const added: string[] = []
    const removed: string[] = []
    const add = HTMLElement.prototype.addEventListener
    const rem = HTMLElement.prototype.removeEventListener
    HTMLElement.prototype.addEventListener = function (this: HTMLElement, type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | AddEventListenerOptions)?]) {
      if (this.classList.contains('pcal-timegrid')) added.push(type)

      return add.call(this, type, ...rest)
    } as typeof add
    HTMLElement.prototype.removeEventListener = function (this: HTMLElement, type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | EventListenerOptions)?]) {
      if (this.classList.contains('pcal-timegrid')) removed.push(type)

      return rem.call(this, type, ...rest)
    } as typeof rem
    try {
      make()
      const pointerTypes = added.filter((t) => ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'click', 'touchmove', 'contextmenu'].includes(t))
      expect(pointerTypes.length).toBe(8)
      for (const c of cleanups.splice(0)) c()
      expect(removed.filter((t) => pointerTypes.includes(t)).sort()).toEqual([...pointerTypes].sort())
    } finally {
      HTMLElement.prototype.addEventListener = add
      HTMLElement.prototype.removeEventListener = rem
    }
  })

  it('unmounting in the middle of a drag leaves nothing running', async () => {
    const { root, changes, calendar } = make()
    const from = centre(block(root, 'Review'))
    await mouse('mouseMoved', from.x, from.y)
    await mouse('mousePressed', from.x, from.y)
    await mouse('mouseMoved', from.x, from.y + 40)
    await sleep(30)
    for (const c of cleanups.splice(0)) c()
    await mouse('mouseReleased', from.x, from.y + 40)
    await sleep(30)
    expect(changes).toHaveLength(0)
    expect(calendar.editing()).toBeNull()
  })

  it('moving on the day the clocks change keeps the wall clock', async () => {
    const { root, changes } = make({ date: '2026-03-29', list: [ev('Early', '2026-03-29T08:00', '2026-03-29T09:00')] })
    const from = centre(block(root, 'Early'))
    await drag(from, [{ x: from.x, y: from.y + 56 }])
    expect(changes[0]).toMatchObject({ start: '2026-03-29T09:00', end: '2026-03-29T10:00' })
  })

  it('editable events have no axe violations', async () => {
    const { default: axe } = await import('axe-core')
    const { root } = make()
    const result = await axe.run(root, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`)).toEqual([])
  })
})
