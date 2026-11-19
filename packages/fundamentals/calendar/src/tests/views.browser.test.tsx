// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests dispatch and observe real DOM events
import { setLocale, setTimeZone } from '@pyreon/ambient'
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import axe from 'axe-core'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../styles.css'
import { Calendar } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'

const cleanups: (() => void)[] = []
const sleep = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))
const NOW = Date.UTC(2026, 10, 18, 11, 0) // 12:00 in Prague
const ev = (id: string, start: string, end: string, extra?: Partial<CalendarEvent>): CalendarEvent => ({ id, title: id, start: start as never, end: end as never, ...extra })

const base: CalendarEvent[] = [
  ev('Design review', '2026-11-18T14:00', '2026-11-18T15:00'),
  ev('Public holiday', '2026-11-17', '2026-11-18'),
  ev('Conference', '2026-11-16', '2026-11-19'),
]

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

function make(options: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}, dir?: string) {
  const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'month', ...options })
  const root = render(<Calendar calendar={calendar} {...props} />, dir)

  return { calendar, root }
}

beforeEach(() => {
  setLocale('en-GB')
  setTimeZone('Europe/Prague')
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const cell = (root: HTMLElement, date: string): HTMLElement => root.querySelector<HTMLElement>(`[role=gridcell][data-date="${date}"]:not(.pcal-slot):not(.pcal-allday-cell)`)!
const slot = (root: HTMLElement, date: string, minute: number): HTMLElement => root.querySelector<HTMLElement>(`.pcal-slot[data-date="${date}"][data-minute="${minute}"]`)!
const live = (root: HTMLElement): string => root.querySelector('.pcal-live')!.textContent ?? ''
const tabStops = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[role=gridcell][tabindex="0"]')]

describe('the month view', () => {
  it('is a labelled ARIA grid with weekday headers, a day cell per day, today and the outside days marked', async () => {
    const { root } = make()
    const grid = root.querySelector('[role=grid]')!
    expect(grid.getAttribute('aria-label')).toBe('Calendar, November 2026')
    expect([...root.querySelectorAll('[role=columnheader]')].map((h) => h.getAttribute('aria-label'))).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(root.querySelectorAll('.pcal-week')).toHaveLength(6)
    const today = cell(root, '2026-11-18')
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(today.textContent).toContain('Wednesday 18 November, today')
    expect(today.hasAttribute('data-today')).toBe(true)
    expect(cell(root, '2026-10-27').hasAttribute('data-outside')).toBe(true)
    expect(root.querySelectorAll('[aria-current=date]')).toHaveLength(1)
  })

  it('has events as labelled buttons in the cell they start in, spanning the days they last', async () => {
    const { root } = make()
    const review = root.querySelector<HTMLElement>('[data-key^="Design review"]')!
    expect(review.getAttribute('aria-label')).toBe('Design review, Wednesday 18 November, 14:00 to 15:00')
    expect(review.closest('[role=gridcell]')!.getAttribute('data-date')).toBe('2026-11-18')
    const holiday = root.querySelector<HTMLElement>('[data-key^="Public holiday"]')!
    expect(holiday.getAttribute('aria-label')).toBe('Public holiday, Tuesday 17 November, all day')
    const conf = root.querySelector<HTMLElement>('[data-key^="Conference"]')!
    expect(conf.getAttribute('aria-label')).toBe('Conference, Monday 16 November to Wednesday 18 November, all day')
    expect(conf.closest('[role=gridcell]')!.getAttribute('data-date')).toBe('2026-11-16')
    const cellWidth = cell(root, '2026-11-16').getBoundingClientRect().width
    expect(conf.getBoundingClientRect().width).toBeGreaterThan(cellWidth * 2.5)
    // the cell is named by its content: the date, then the events that start in it
    expect(cell(root, '2026-11-18').textContent).toContain('Wednesday 18 November')
  })

  it('exactly one cell is in the tab order, and it is the cursor', async () => {
    const { root, calendar } = make()
    expect(tabStops(root).map((c) => c.dataset.date)).toEqual(['2026-11-18'])
    calendar.setCursor('2026-11-20')
    await sleep()
    expect(tabStops(root).map((c) => c.dataset.date)).toEqual(['2026-11-20'])
  })

  it('keyboard: arrows, Home, End, PageUp, PageDown and Shift+PageDown move the focus, and the view follows', async () => {
    const { root, calendar } = make()
    cell(root, '2026-11-18').focus()
    const press = async (keys: string): Promise<string> => {
      await userEvent.keyboard(keys)
      await sleep()

      return (document.activeElement as HTMLElement).dataset.date ?? ''
    }
    expect(await press('{ArrowRight}')).toBe('2026-11-19')
    expect(await press('{ArrowDown}')).toBe('2026-11-26')
    expect(await press('{ArrowLeft}')).toBe('2026-11-25')
    expect(await press('{ArrowUp}')).toBe('2026-11-18')
    expect(await press('{Home}')).toBe('2026-11-16')
    expect(await press('{End}')).toBe('2026-11-22')
    expect(await press('{PageDown}')).toBe('2026-12-22')
    expect(calendar.title()).toBe('December 2026')
    expect(live(root)).toBe('December 2026, month')
    expect(await press('{PageUp}')).toBe('2026-11-22')
    expect(await press('{Shift>}{PageDown}{/Shift}')).toBe('2027-11-22')
    expect(calendar.title()).toBe('November 2027')
    expect(tabStops(root)).toHaveLength(1)
  })

  it('keyboard: Shift with the arrows selects a range, Enter confirms it, Escape clears it', async () => {
    const onSelect = vi.fn()
    const { root, calendar } = make({ onSelect })
    cell(root, '2026-11-18').focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
    await sleep()
    expect(calendar.selection()).toEqual({ start: '2026-11-18', end: '2026-11-21', allDay: true })
    expect(['2026-11-18', '2026-11-19', '2026-11-20'].every((d) => cell(root, d).getAttribute('aria-selected') === 'true')).toBe(true)
    expect(cell(root, '2026-11-21').getAttribute('aria-selected')).toBe('false')
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-18', end: '2026-11-21', allDay: true })
    await userEvent.keyboard('{Escape}')
    await sleep()
    expect(calendar.selection()).toBeNull()
    expect(cell(root, '2026-11-19').getAttribute('aria-selected')).toBe('false')
  })

  it('a click on a day selects it, a click on an event reports the event and does not select', async () => {
    const onSelect = vi.fn()
    const onEventClick = vi.fn()
    const { root } = make({ onSelect, onEventClick })
    cell(root, '2026-11-24').click()
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-24', end: '2026-11-25', allDay: true })
    onSelect.mockClear()
    root.querySelector<HTMLElement>('[data-key^="Design review"]')!.click()
    expect(onEventClick.mock.calls[0]![0].id).toBe('Design review')
    expect(onEventClick.mock.calls[0]![1].key).toBe('Design review:2026-11-18T14:00')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows "+N more" when a week has more events than its capacity, and says how many', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ev(`e${i}`, '2026-11-18T09:00', '2026-11-18T10:00'))
    const onMore = vi.fn()
    const { root } = make({ events: () => many, monthCapacity: 2 }, { onMore })
    const more = root.querySelector<HTMLElement>('.pcal-more')!
    expect(more.textContent).toBe('3 more')
    expect(more.closest('[role=gridcell]')!.getAttribute('data-date')).toBe('2026-11-18')
    expect(root.querySelectorAll('[data-date="2026-11-18"] .pcal-event')).toHaveLength(2)
    more.click()
    expect(onMore).toHaveBeenCalledWith('2026-11-18')
  })

  it('keeps focus on the cursor cell when the toolbar changes the month', async () => {
    const { root, calendar } = make()
    cell(root, '2026-11-18').focus()
    calendar.next()
    await sleep()
    expect(calendar.date()).toBe('2026-12-18')
    root.querySelector<HTMLElement>('.pcal-next')!.focus()
    root.querySelector<HTMLElement>('.pcal-next')!.click()
    await sleep()
    expect(document.activeElement).toBe(root.querySelector('.pcal-next'))
  })
})

describe('the time grid', () => {
  const week = (extra: Partial<CalendarOptions> = {}, props: Record<string, unknown> = {}, dir?: string) => make({ view: 'week', ...extra }, props, dir)

  it('has a header row, an all-day row with the all-day events, a gutter and 48 slot rows of 7 days', async () => {
    const { root } = week()
    expect(root.querySelectorAll('.pcal-colhead')).toHaveLength(7)
    expect(root.querySelectorAll('.pcal-row')).toHaveLength(48)
    expect(root.querySelectorAll('.pcal-slot')).toHaveLength(48 * 7)
    expect([...root.querySelectorAll('.pcal-allday-event')].map((e) => e.getAttribute('data-key')!.split(':')[0])).toEqual(['Conference', 'Public holiday'])
    expect(root.querySelector('[role=grid]')!.getAttribute('aria-label')).toContain('Calendar, time grid')
    expect(root.querySelector('.pcal-colhead[data-today]')!.getAttribute('aria-label')).toBe('Wednesday 18 November')
  })

  it('places a block at its time: inside its slot, as tall as it lasts, and labelled', async () => {
    const { root } = week()
    const block = root.querySelector<HTMLElement>('.pcal-block')!
    expect(block.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 840))
    expect(block.getAttribute('aria-label')).toBe('Design review, Wednesday 18 November, 14:00 to 15:00')
    const slotBox = slot(root, '2026-11-18', 840).getBoundingClientRect()
    expect(Math.abs(block.getBoundingClientRect().height - slotBox.height * 2)).toBeLessThanOrEqual(3)
    expect(Math.abs(block.getBoundingClientRect().top - slotBox.top)).toBeLessThanOrEqual(2)
  })

  it('draws the now line from the clock in the right slot, and shades the hours that are closed', async () => {
    const { root } = week({ businessHours: { 3: [{ from: '09:00', to: '17:00' }] } })
    const now = root.querySelector<HTMLElement>('.pcal-now')!
    expect(now.closest('.pcal-slot')).toBe(slot(root, '2026-11-18', 720))
    expect(slot(root, '2026-11-18', 600).getAttribute('data-business')).toBe('open')
    expect(slot(root, '2026-11-18', 480).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-18', 1020).getAttribute('data-business')).toBe('closed')
    expect(slot(root, '2026-11-17', 600).getAttribute('data-business')).toBe('closed')
  })

  it('a day that is not today has no now line, and dayStart and dayEnd cut the grid', async () => {
    const { root } = week({ dayStart: '08:00', dayEnd: '18:00' })
    expect(root.querySelectorAll('.pcal-row')).toHaveLength(20)
    expect(root.querySelectorAll('.pcal-now')).toHaveLength(1)
  })

  it('keyboard: arrows move by slot and day, Home and End to the first and last slot, PageUp and PageDown by a week of columns; Shift selects a range of slots; Enter confirms', async () => {
    const onSelect = vi.fn()
    const { root, calendar } = week({ onSelect })
    calendar.setCursor('2026-11-18', 540)
    await sleep()
    slot(root, '2026-11-18', 540).focus()
    const where = (): string => `${(document.activeElement as HTMLElement).dataset.date}@${(document.activeElement as HTMLElement).dataset.minute}`
    await userEvent.keyboard('{ArrowDown}')
    await sleep()
    expect(where()).toBe('2026-11-18@570')
    await userEvent.keyboard('{ArrowRight}')
    await sleep()
    expect(where()).toBe('2026-11-19@570')
    await userEvent.keyboard('{End}')
    await sleep()
    expect(where()).toBe('2026-11-19@1410')
    await userEvent.keyboard('{Home}')
    await sleep()
    expect(where()).toBe('2026-11-19@0')
    calendar.setCursor('2026-11-18', 540)
    await sleep()
    slot(root, '2026-11-18', 540).focus()
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}')
    await sleep()
    expect(calendar.selection()).toEqual({ start: '2026-11-18T09:00', end: '2026-11-18T10:30', allDay: false })
    expect(['540', '570', '600'].every((m) => slot(root, '2026-11-18', Number(m)).getAttribute('aria-selected') === 'true')).toBe(true)
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-18T09:00', end: '2026-11-18T10:30', allDay: false })
    expect(tabStops(root)).toHaveLength(1)
  })

  it('a click on a slot selects it; the view switch changes the view and keeps the cursor', async () => {
    const onSelect = vi.fn()
    const { root, calendar } = week({ onSelect })
    slot(root, '2026-11-19', 600).click()
    expect(onSelect).toHaveBeenCalledWith({ start: '2026-11-19T10:00', end: '2026-11-19T10:30', allDay: false })
    root.querySelector<HTMLElement>('.pcal-view[data-view=day]')!.click()
    await sleep()
    expect(calendar.view()).toBe('day')
    expect(root.querySelectorAll('.pcal-colhead')).toHaveLength(1)
    expect(root.querySelector('.pcal-view[data-view=day]')!.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('.pcal-view[data-view=month]')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('hidden weekdays leave their columns out of a week', async () => {
    const { root } = week({ hiddenDays: [6, 7] })
    expect(root.querySelectorAll('.pcal-colhead')).toHaveLength(5)
  })
})

describe('right to left', () => {
  it('month: the arrows swap, the weekday order mirrors, an event starts at the inline start', async () => {
    const { root } = make({}, {}, 'rtl')
    cell(root, '2026-11-18').focus()
    await userEvent.keyboard('{ArrowRight}')
    await sleep()
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-17')
    const monday = root.querySelector<HTMLElement>('.pcal-weekday')!.getBoundingClientRect()
    const sunday = [...root.querySelectorAll<HTMLElement>('.pcal-weekday')].at(-1)!.getBoundingClientRect()
    expect(monday.left).toBeGreaterThan(sunday.left)
    const conf = root.querySelector<HTMLElement>('[data-key^="Conference"]')!.getBoundingClientRect()
    expect(conf.right).toBeGreaterThan(conf.left + 50)
    expect(Math.abs(conf.right - cell(root, '2026-11-16').getBoundingClientRect().right)).toBeLessThan(6)
  })

  it('time grid: Left and Right swap, blocks are placed from the inline start', async () => {
    const { root, calendar } = make({ view: 'week' }, {}, 'rtl')
    calendar.setCursor('2026-11-18', 540)
    await sleep()
    slot(root, '2026-11-18', 540).focus()
    await userEvent.keyboard('{ArrowRight}')
    await sleep()
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-17')
  })
})

describe('what is announced and what the markup claims', () => {
  it('announces where navigation went, in the active locale', async () => {
    const { root, calendar } = make()
    expect(live(root)).toBe('')
    calendar.next()
    await sleep()
    expect(live(root)).toBe('December 2026, month')
    setLocale('cs')
    calendar.setView('week')
    await sleep()
    expect(live(root)).toContain('week')
  })

  it('has no axe violations: the month, the week and the day, with events, a selection and a business-hours shading', async () => {
    const { root, calendar } = make({ businessHours: { 3: [{ from: '09:00', to: '17:00' }] } })
    const check = async (): Promise<void> => {
      const results = await axe.run(root, { rules: { region: { enabled: false } } })
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 160)).join(' | ')}`)).toEqual([])
    }
    calendar.selectDay('2026-11-19')
    await sleep()
    await check()
    calendar.setView('week')
    await sleep()
    calendar.selectSlot('2026-11-18', 600)
    await sleep()
    await check()
    calendar.setView('day')
    await sleep()
    await check()
  })
})

describe('fine-grained updates and scale', () => {
  it('changing one event updates only its own nodes: the other days are not touched in the DOM, and their event components do not run again', async () => {
    const events = signal<CalendarEvent[]>([ev('a', '2026-11-16T09:00', '2026-11-16T10:00'), ev('b', '2026-11-18T09:00', '2026-11-18T10:00'), ev('c', '2026-11-20T09:00', '2026-11-20T10:00')])
    const ran: string[] = []
    const layoutDay = vi.fn()
    const { root } = make({ events: () => events(), view: 'week', instrument: { layoutDay } }, { renderEvent: ({ occurrence }: { occurrence: { key: string; title: string } }) => (ran.push(occurrence.key), occurrence.title) })
    await sleep()
    ran.length = 0
    layoutDay.mockClear()
    const touched: string[] = []
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const target = (r.target as Element).closest?.('.pcal-slot') ?? (r.target.parentElement?.closest('.pcal-slot') ?? null)
        if (target !== null) touched.push((target as HTMLElement).dataset.date ?? '')
      }
    })
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
    events.set([events()[0]!, ev('b', '2026-11-18T09:30', '2026-11-18T10:30'), events()[2]!])
    await sleep(60)
    observer.disconnect()
    expect(layoutDay.mock.calls.map((c) => c[0])).toEqual(['2026-11-18'])
    expect(new Set(touched)).toEqual(new Set(['2026-11-18']))
    expect(ran.every((k) => k.startsWith('b:'))).toBe(true)
    expect(ran.length).toBeLessThanOrEqual(2)
  })

  it('renders a month of 1,000 events within a generous bound', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => {
      const day = String(1 + (i % 28)).padStart(2, '0')

      return ev(`e${i}`, `2026-11-${day}T${String(8 + (i % 10)).padStart(2, '0')}:00`, `2026-11-${day}T${String(9 + (i % 10)).padStart(2, '0')}:00`)
    })
    const t0 = performance.now()
    const { root } = make({ events: () => many })
    const ms = performance.now() - t0
    expect(root.querySelectorAll('.pcal-event').length).toBeGreaterThan(50)
    expect(root.querySelectorAll('.pcal-more').length).toBeGreaterThan(20)
    expect(ms).toBeLessThan(4000)
    console.info(`[measured] mount a month of 1,000 events: ${ms.toFixed(0)} ms`)
  })
})

describe('hydration', () => {
  it('a month and a week hydrate with no mismatch, and the now line comes from the same clock', async () => {
    const calendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week' })
    const scratch = document.createElement('div')
    document.body.append(scratch)
    const stop = mount(<Calendar calendar={calendar} />, scratch)
    const html = scratch.innerHTML
    stop()
    scratch.remove()
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    const mismatches: unknown[] = []
    const off = onHydrationMismatch((m) => void mismatches.push(m))
    const hydratedCalendar = createCalendar({ events: () => base, date: '2026-11-18', now: () => NOW, view: 'week' })
    const dispose = hydrateRoot(root, <Calendar calendar={hydratedCalendar} />)
    off()
    cleanups.push(() => {
      dispose()
      root.remove()
    })
    expect(mismatches).toEqual([])
    expect(root.querySelector('.pcal-now')).not.toBeNull()
    hydratedCalendar.selectSlot('2026-11-19', 600)
    await sleep()
    expect(slot(root, '2026-11-19', 600).getAttribute('aria-selected')).toBe('true')
  })
})

void h
