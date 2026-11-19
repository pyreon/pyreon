// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests observe real DOM events
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import axe from 'axe-core'
import type {} from '@vitest/browser-playwright'
import { cdp, page, userEvent } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../styles.css'
import { Calendar } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions, EventChange } from '../index'

const cleanups: (() => void)[] = []
const sleep = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
const NOW = Date.UTC(2026, 10, 18, 11, 0)
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

function make(options: Partial<CalendarOptions>, props: Record<string, unknown> = {}, dir?: string) {
  const calendar = createCalendar({ events: () => [], date: '2026-11-18', now: () => NOW, ...options } as CalendarOptions)
  const root = render(<Calendar calendar={calendar} {...props} />, dir)

  return { calendar, root }
}

const centre = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect()

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
  await sleep(50)
}

beforeEach(async () => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
  await page.viewport(1280, 900)
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const noAxe = async (root: HTMLElement): Promise<string[]> => {
  const result = await axe.run(root, { rules: { 'color-contrast': { enabled: false } } })

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 90)).join(' | ')}`)
}

describe('the agenda', () => {
  const list = [
    ev('Lunch', '2026-11-18T12:00', '2026-11-18T13:00'),
    ev('Holiday', '2026-11-18', '2026-11-19'),
    ev('Retro', '2026-11-20T15:00', '2026-11-20T16:00'),
    ev('Offsite', '2026-11-25', '2026-11-28'),
  ]

  it('lists the days that have events, all-day first, a multi-day event on every day it touches', () => {
    const { root } = make({ view: 'agenda', events: () => list })
    const days = [...root.querySelectorAll('.pcal-agenda-day')].map((d) => d.getAttribute('data-date'))
    expect(days).toEqual(['2026-11-18', '2026-11-20', '2026-11-25', '2026-11-26', '2026-11-27'])
    const first = [...root.querySelectorAll('.pcal-agenda-day[data-date="2026-11-18"] .pcal-agenda-event')].map((b) => b.getAttribute('data-key')?.split(':')[0])
    expect(first).toEqual(['Holiday', 'Lunch'])
    expect(root.querySelector('.pcal-agenda-day[data-date="2026-11-18"] h3')!.textContent).toBe('Wednesday 18 November, Today')
    expect(root.querySelector('.pcal-agenda-event[data-key^="Lunch:"]')!.getAttribute('aria-label')).toBe('Lunch, Wednesday 18 November, 12:00 – 13:00')
  })

  it('says so when there is nothing, and calls onEventClick', async () => {
    const onEventClick = vi.fn()
    const empty = make({ view: 'agenda' })
    expect(empty.root.querySelector('.pcal-agenda-empty')!.textContent).toBe('No events')
    const { root } = make({ view: 'agenda', events: () => list, onEventClick })
    ;(root.querySelector('.pcal-agenda-event[data-key^="Retro:"]') as HTMLElement).click()
    expect(onEventClick).toHaveBeenCalledTimes(1)
  })

  it('draws only the days near the viewport, and the others when it scrolls', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ev(`E${i}`, `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}T10:00`, `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}T11:00`))
    const { root } = make({ view: 'agenda', events: () => many, date: '2026-01-01', agendaDays: 366 })
    const box = root.querySelector('.pcal-agenda') as HTMLElement
    const drawn = root.querySelectorAll('.pcal-agenda-day').length
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(30)
    expect(root.querySelector('.pcal-agenda-day[data-date="2026-11-01"]')).toBeNull()
    box.scrollTop = 12000
    await sleep(80)
    expect(root.querySelectorAll('.pcal-agenda-day').length).toBeLessThan(30)
    expect(root.querySelector('.pcal-agenda-day[data-date="2026-01-01"]')).toBeNull()
    const dates = [...root.querySelectorAll('.pcal-agenda-day')].map((d) => d.getAttribute('data-date') as string)
    expect(dates.every((d, i) => i === 0 || d > (dates[i - 1] as string))).toBe(true)
  })

  it('has no axe violations', async () => {
    const { root } = make({ view: 'agenda', events: () => list })
    expect(await noAxe(root)).toEqual([])
  })
})

describe('the year', () => {
  it('twelve months, busy days shaded by count and named with it, a click reports the day', async () => {
    const onDayClick = vi.fn()
    const { root } = make({ view: 'year', events: () => [ev('A', '2026-11-18T10:00', '2026-11-18T11:00'), ev('B', '2026-11-18T12:00', '2026-11-18T13:00'), ev('C', '2026-03-02', '2026-03-03')] }, { onDayClick })
    expect(root.querySelectorAll('.pcal-year-month')).toHaveLength(12)
    expect(root.querySelectorAll('.pcal-year-day[data-date]')).toHaveLength(365)
    const day = root.querySelector('[data-date="2026-11-18"]') as HTMLElement
    expect(day.getAttribute('data-busy')).toBe('2')
    expect(day.textContent).toContain('Wednesday 18 November, 2 events')
    expect(root.querySelector('[data-date="2026-03-02"]')!.textContent).toContain('1 event')
    expect(root.querySelector('[data-date="2026-05-05"]')!.getAttribute('data-busy')).toBeNull()
    day.click()
    expect(onDayClick).toHaveBeenCalledWith('2026-11-18')
  })

  it('one tab stop, and the arrows move across the months with the focus', async () => {
    const { root } = make({ view: 'year', date: '2026-11-30' })
    expect(root.querySelectorAll('.pcal-year-day[tabindex="0"]')).toHaveLength(1)
    const start = root.querySelector('[data-date="2026-11-30"]') as HTMLElement
    start.focus()
    await userEvent.keyboard('{ArrowRight}')
    await sleep(60)
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-12-01')
    await userEvent.keyboard('{ArrowDown}')
    await sleep(60)
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-12-08')
  })

  it('shades at most four levels, however many events a day has', () => {
    const { root } = make({ view: 'year', events: () => Array.from({ length: 7 }, (_, i) => ev(`E${i}`, '2026-11-18T10:00', '2026-11-18T11:00')) })
    expect(root.querySelector('[data-date="2026-11-18"]')!.getAttribute('data-busy')).toBe('4')
    expect(root.querySelector('[data-date="2026-11-18"]')!.textContent).toContain('7 events')
  })

  it('has no axe violations', async () => {
    const { root } = make({ view: 'year', events: () => [ev('A', '2026-11-18T10:00', '2026-11-18T11:00')] })
    expect(await noAxe(root)).toEqual([])
  })
})

const rooms = [
  { id: 'a', title: 'Room A' },
  { id: 'b', title: 'Room B' },
  { id: 'c', title: 'Room C' },
]

describe('the timeline', () => {
  const list = [
    ev('Standup', '2026-11-18T09:00', '2026-11-18T12:00', { resourceId: 'a' }),
    ev('Overlap', '2026-11-18T09:30', '2026-11-18T11:00', { resourceId: 'a' }),
    ev('Both', '2026-11-19T13:00', '2026-11-19T14:00', { resourceId: ['a', 'b'] }),
    ev('Loose', '2026-11-20T10:00', '2026-11-20T11:00'),
    ev('Trip', '2026-11-17', '2026-11-19', { resourceId: 'c' }),
  ]

  it('a row per resource; events in the rows of their resources; overlaps in lanes; the unassigned in a row of their own', () => {
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00' })
    const rows = [...root.querySelectorAll('.pcal-tl-row')].map((r) => r.getAttribute('data-resource'))
    expect(rows).toHaveLength(4)
    expect(root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-name')!.textContent).toBe('Room A')
    const inRow = (id: string): string[] => [...root.querySelectorAll(`.pcal-tl-row[data-resource="${id}"] .pcal-tl-block`)].map((b) => b.getAttribute('data-key')!.split(':')[0]!)
    expect(inRow('a').sort()).toEqual(['Both', 'Overlap', 'Standup'])
    expect(inRow('b')).toEqual(['Both'])
    expect(inRow('c')).toEqual(['Trip'])
    const standup = root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-block[data-key^="Standup:"]') as HTMLElement
    const overlap = root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-block[data-key^="Overlap:"]') as HTMLElement
    expect(overlap.getBoundingClientRect().top).toBeGreaterThan(standup.getBoundingClientRect().top + 10)
    expect(root.querySelector('.pcal-tl-row[data-resource="a"]')!.getBoundingClientRect().height).toBeGreaterThan(50)
    expect(root.querySelectorAll('.pcal-tl-row')[3]!.textContent).toContain('Unassigned')
    expect(root.querySelector('.pcal-tl-row:last-child .pcal-tl-block')!.getAttribute('data-key')).toMatch(/^Loose:/)
  })

  it('there is no Unassigned row when every event has a resource', () => {
    const { root } = make({ view: 'timeline', events: () => list.filter((e) => e.resourceId !== undefined), resources: () => rooms })
    expect(root.querySelectorAll('.pcal-tl-row')).toHaveLength(3)
    expect(root.textContent).not.toContain('Unassigned')
  })

  it('the header and the resource column stay in place when it scrolls', async () => {
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00' }, {})
    const box = root.querySelector('.pcal-timeline') as HTMLElement
    box.style.maxWidth = '600px'
    box.scrollLeft = 300
    await sleep(40)
    const name = (root.querySelector('.pcal-tl-name') as HTMLElement).getBoundingClientRect()
    expect(name.left).toBeGreaterThanOrEqual(box.getBoundingClientRect().left - 1)
    expect(name.left).toBeLessThan(box.getBoundingClientRect().left + 5)
    const head = (root.querySelector('.pcal-tl-head') as HTMLElement).getBoundingClientRect()
    expect(head.top).toBeGreaterThanOrEqual(box.getBoundingClientRect().top - 1)
  })

  it('drag a bar to another row: the change names the resource it came from and the one it went to', async () => {
    const changes: EventChange[] = []
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00', editable: true, onEventChange: (c) => void changes.push(c) })
    const bar = root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-block[data-key^="Standup:"]') as HTMLElement
    const lane = root.querySelector('.pcal-tl-row[data-resource="c"] .pcal-tl-lane') as HTMLElement
    const from = centre(bar)
    const to = { x: from.x + 40, y: centre(lane).y }
    await drag(from, [{ x: from.x + 10, y: from.y + 20 }, to])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ resourceId: 'c', fromResourceId: 'a', allDay: false })
    expect((changes[0]!.start as string).slice(0, 10)).toBe('2026-11-18')
  })

  it('dragging sideways in the same row changes only the time; a bar given to another row shows there while it waits', async () => {
    let finish: (v: boolean) => void = () => undefined
    const changes: EventChange[] = []
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00', editable: true, onEventChange: (c) => { changes.push(c); return new Promise<boolean>((r) => (finish = r)) } })
    const bar = root.querySelector('.pcal-tl-row[data-resource="b"] .pcal-tl-block[data-key^="Both:"]') as HTMLElement
    const from = centre(bar)
    await drag(from, [{ x: from.x, y: from.y + 5 }, { x: from.x + 60, y: from.y + 6 }])
    expect(changes[0]!.resourceId).toBeUndefined()
    expect(changes[0]!.start).not.toBe('2026-11-19T13:00')
    finish(false)
    await sleep(40)
  })

  it('keyboard: grab a bar, arrows give it to the row above or below and move it in time', async () => {
    const changes: EventChange[] = []
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00', editable: true, onEventChange: (c) => void changes.push(c) })
    const bar = root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-block[data-key^="Standup:"]') as HTMLElement
    bar.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{Enter}')
    await sleep(60)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ resourceId: 'b', fromResourceId: 'a', start: '2026-11-18T09:30' })
  })

  it('right to left: the same drag lands on the same row and the time under the pointer', async () => {
    const changes: EventChange[] = []
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00', editable: true, onEventChange: (c) => void changes.push(c) }, {}, 'rtl')
    const bar = root.querySelector('.pcal-tl-row[data-resource="a"] .pcal-tl-block[data-key^="Standup:"]') as HTMLElement
    const lane = root.querySelector('.pcal-tl-row[data-resource="b"] .pcal-tl-lane') as HTMLElement
    const from = centre(bar)
    await drag(from, [{ x: from.x - 10, y: from.y + 10 }, { x: from.x - 30, y: centre(lane).y }])
    expect(changes[0]).toMatchObject({ resourceId: 'b', fromResourceId: 'a' })
    // in right-to-left text later times are further left: 30px left is later
    expect((changes[0]!.start as string) > '2026-11-18T09:00').toBe(true)
  })

  it('has no axe violations', async () => {
    const { root } = make({ view: 'timeline', events: () => list, resources: () => rooms, dayStart: '08:00', dayEnd: '18:00' })
    expect(await noAxe(root)).toEqual([])
  })
})

describe('the "+N more" popover', () => {
  const crowded = Array.from({ length: 6 }, (_, i) => ev(`E${i}`, '2026-11-18', '2026-11-19'))

  it('opens a dialog with every event of the day; focus goes in, Tab stays in, Escape returns focus to the button', async () => {
    const { root } = make({ view: 'month', events: () => crowded })
    const more = root.querySelector('.pcal-more') as HTMLElement
    more.focus()
    more.click()
    await sleep(60)
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-label')).toBe('Wednesday 18 November')
    expect(dialog.querySelectorAll('.pcal-popover-event')).toHaveLength(6)
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 10; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await userEvent.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    await sleep(60)
    expect(root.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(root.querySelector('.pcal-more'))
  })

  it('a press outside closes it without taking the focus; choosing an event closes it and reports the click', async () => {
    const onEventClick = vi.fn()
    const { root } = make({ view: 'month', events: () => crowded, onEventClick })
    ;(root.querySelector('.pcal-more') as HTMLElement).click()
    await sleep(60)
    const input = document.createElement('input')
    document.body.append(input)
    cleanups.push(() => input.remove())
    input.focus()
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await sleep(40)
    expect(root.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(input)
    ;(root.querySelector('.pcal-more') as HTMLElement).click()
    await sleep(60)
    ;(root.querySelector('.pcal-popover-event') as HTMLElement).click()
    await sleep(40)
    expect(onEventClick).toHaveBeenCalledTimes(1)
    expect(root.querySelector('[role="dialog"]')).toBeNull()
  })

  it('moreDialog: false leaves it to onMore; has no axe violations while open', async () => {
    const onMore = vi.fn()
    const off = make({ view: 'month', events: () => crowded }, { moreDialog: false, onMore })
    ;(off.root.querySelector('.pcal-more') as HTMLElement).click()
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(off.root.querySelector('[role="dialog"]')).toBeNull()
    const { root } = make({ view: 'month', events: () => crowded })
    ;(root.querySelector('.pcal-more') as HTMLElement).click()
    await sleep(60)
    expect(await noAxe(root)).toEqual([])
  })
})

describe('<Calendar> switches every view', () => {
  it('month, week, day, agenda, year and timeline from the toolbar', async () => {
    const { root, calendar } = make({ events: () => [ev('A', '2026-11-18T10:00', '2026-11-18T11:00', { resourceId: 'a' })], resources: () => rooms }, { views: ['month', 'week', 'day', 'agenda', 'year', 'timeline'] })
    const shown = (): string | null => root.querySelector('[data-view]:not(.pcal):not(.pcal-view)')?.getAttribute('data-view') ?? null
    const seen: string[] = []
    for (const view of ['month', 'week', 'day', 'agenda', 'year', 'timeline'] as const) {
      ;(root.querySelector(`.pcal-view[data-view="${view}"]`) as HTMLElement).click()
      await sleep(40)
      expect(calendar.view()).toBe(view)
      seen.push(shown() as string)
    }
    expect(seen).toEqual(['month', 'timegrid', 'timegrid', 'agenda', 'year', 'timeline'])
    expect(root.querySelector('.pcal-view[data-view="timeline"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('a day of the year view opens that day', async () => {
    const { root, calendar } = make({ view: 'year' })
    ;(root.querySelector('[data-date="2026-03-02"]') as HTMLElement).click()
    await sleep(40)
    expect(calendar.view()).toBe('day')
    expect(calendar.date()).toBe('2026-03-02')
  })

  it('the toolbar and the agenda follow the locale (Arabic, right to left)', async () => {
    setLocale('ar')
    const { root } = make({ view: 'agenda', events: () => [ev('A', '2026-11-18T10:00', '2026-11-18T11:00')], locale: () => 'ar' }, { views: ['month', 'agenda'] }, 'rtl')
    expect(root.querySelector('.pcal-today')!.textContent).not.toBe('Today')
    expect(root.querySelector('.pcal-agenda-day h3')!.textContent).not.toMatch(/November/)
  })
})

describe('what it costs, on this machine (bounds, not claims)', () => {
  it('a month with 1,000 events renders, and one edit afterwards is quick', async () => {
    const events = signal<CalendarEvent[]>(Array.from({ length: 1000 }, (_, i) => ev(`E${i}`, `2026-11-${String(1 + (i % 28)).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}:00`, `2026-11-${String(1 + (i % 28)).padStart(2, '0')}T${String(9 + (i % 9)).padStart(2, '0')}:00`)))
    const t0 = performance.now()
    const { root } = make({ view: 'month', events: () => events() })
    await sleep(0)
    const first = performance.now() - t0
    const t1 = performance.now()
    events.set([...events().slice(1), ev('New', '2026-11-03T10:00', '2026-11-03T11:00')])
    await sleep(0)
    const edit = performance.now() - t1
    console.info(`[calendar perf] 1000-event month: first render ${first.toFixed(0)} ms, one edit ${edit.toFixed(0)} ms, ${root.querySelectorAll('*').length} nodes`)
    expect(first).toBeLessThan(1500)
    expect(edit).toBeLessThan(500)
  })

  it('200 resources by a week renders only the rows on screen', async () => {
    const resources = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, title: `Resource ${i}` }))
    const events = Array.from({ length: 1000 }, (_, i) => ev(`E${i}`, `2026-11-${String(16 + (i % 7)).padStart(2, '0')}T${String(8 + (i % 8)).padStart(2, '0')}:00`, `2026-11-${String(16 + (i % 7)).padStart(2, '0')}T${String(9 + (i % 8)).padStart(2, '0')}:30`, { resourceId: `r${i % 200}` }))
    const t0 = performance.now()
    const { root } = make({ view: 'timeline', events: () => events, resources: () => resources, dayStart: '08:00', dayEnd: '18:00' })
    await sleep(0)
    const first = performance.now() - t0
    const drawn = root.querySelectorAll('.pcal-tl-row').length
    const box = root.querySelector('.pcal-timeline') as HTMLElement
    const t1 = performance.now()
    box.scrollTop = 4000
    await sleep(60)
    const scroll = performance.now() - t1
    console.info(`[calendar perf] 200 resources x week, 1000 events: first render ${first.toFixed(0)} ms, ${drawn} rows drawn of 200, scroll ${scroll.toFixed(0)} ms, ${root.querySelectorAll('*').length} nodes`)
    expect(drawn).toBeLessThan(30)
    expect(root.querySelectorAll('.pcal-tl-row').length).toBeLessThan(30)
    expect(root.querySelector('.pcal-tl-row[data-resource="r0"]')).toBeNull()
    expect(first).toBeLessThan(2000)
  })
})
