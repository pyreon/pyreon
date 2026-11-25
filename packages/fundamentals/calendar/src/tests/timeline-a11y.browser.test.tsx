// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the tests observe real DOM events
/**
 * The timeline as assistive technology gets it, in real Chromium (#4848): axe-core, the accessibility tree Chromium builds
 * (through CDP), real layout (each day's cell under its column header) and real keyboard input (one tab stop, arrows).
 */
import { setLocale, setTimeZone } from '@pyreon/ambient'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import axe from 'axe-core'
import type {} from '@vitest/browser-playwright'
import { cdp, page, userEvent } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../../styles.css'
import { TimelineView } from '../components'
import { createCalendar } from '../index'
import type { CalendarEvent, CalendarOptions } from '../index'

const NOW = Date.UTC(2026, 10, 18, 11, 0)
const sleep = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms))
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

beforeEach(async () => {
  setLocale('en-GB')
  setTimeZone('UTC')
  await page.viewport(1280, 900)
})

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const rooms = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, title: `Room ${i + 1}` }))
const meetings = (list: { id: string }[]): CalendarEvent[] => list.map((r) => ({ id: `e-${r.id}`, title: `Meeting in ${r.id}`, start: '2026-11-18T14:00' as never, end: '2026-11-18T15:00' as never, resourceId: r.id }))
const HOURS = { 1: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '17:00' }] } as never

function timeline(n: number, extra: Partial<CalendarOptions> = {}) {
  const resources = rooms(n)
  const calendar = createCalendar({ view: 'timeline', date: '2026-11-18', now: () => NOW, timeZone: () => 'UTC', locale: () => 'en-GB', events: () => meetings(resources), resources: () => resources, businessHours: HOURS, ...extra } as CalendarOptions)
  const root = render(
    <div class="pcal">
      <button type="button" class="before">before</button>
      <TimelineView calendar={calendar} />
      <button type="button" class="after">after</button>
    </div>,
  )

  return { calendar, root, grid: root.querySelector('[role=grid]') as HTMLElement }
}

const violations = async (root: HTMLElement): Promise<string[]> => {
  const result = await axe.run(root)

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 90)).join(' | ')}`)
}

interface AXNode {
  nodeId: string
  role?: { value: string }
  childIds?: string[]
  ignored?: boolean
}

/** Chromium's accessibility tree: the role of every row's non-ignored children, the presentational wrappers flattened. */
async function axRows(): Promise<{ cells: string[] }[]> {
  // the test page is a frame of the runner's page: read every frame's tree and keep the one that has the grid
  interface FrameTree { frame: { id: string }; childFrames?: FrameTree[] }
  const { frameTree } = (await cdp().send('Page.getFrameTree' as never)) as { frameTree: FrameTree }
  const ids: string[] = []
  const walk = (t: FrameTree): void => {
    ids.push(t.frame.id)
    for (const c of t.childFrames ?? []) walk(c)
  }
  walk(frameTree)
  let nodes: AXNode[] = []
  for (const frameId of ids) {
    const tree = (await cdp().send('Accessibility.getFullAXTree' as never, { frameId } as never)) as { nodes: AXNode[] }
    if (tree.nodes.some((n) => n.role?.value === 'grid')) nodes = tree.nodes
  }
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const kids = (n: AXNode): AXNode[] =>
    (n.childIds ?? []).flatMap((id) => {
      const c = byId.get(id)
      if (c === undefined) return []
      const role = c.role?.value ?? ''

      return c.ignored === true || role === 'none' || role === 'generic' || role === 'presentation' ? kids(c) : [c]
    })

  return nodes
    .filter((n) => n.role?.value === 'row')
    .map((row) => ({
      cells: kids(row).map((c) => c.role?.value ?? '').filter((r) => r !== 'StaticText'),
    }))
}

describe('the timeline in Chromium', () => {
  it('30 rooms: axe finds nothing; every row is drawn, numbered, and has a cell per day under the day headers', async () => {
    const { root, grid } = timeline(30)
    await sleep()
    expect(await violations(root)).toEqual([])
    const rows = [...grid.querySelectorAll<HTMLElement>('[role=row]')]
    expect(rows).toHaveLength(31)
    expect(rows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)))
    // the cells line up with the columns, in the layout too: a day's cell sits under that day's header
    const heads = [...grid.querySelectorAll<HTMLElement>('.pcal-tl-day[role=columnheader]')]
    const cells = [...rows[5]!.querySelectorAll<HTMLElement>('[role=gridcell]')]
    expect(cells).toHaveLength(heads.length)
    cells.forEach((c, i) => {
      const a = c.getBoundingClientRect()
      const b = heads[i]!.getBoundingClientRect()
      expect(Math.abs(a.left - b.left)).toBeLessThan(2)
      expect(Math.abs(a.width - b.width)).toBeLessThan(2)
      expect(a.height).toBeGreaterThan(20)
    })
    // the bar starts inside its day's cell
    const bar = rows[5]!.querySelector<HTMLElement>('.pcal-tl-block')!.getBoundingClientRect()
    const wednesday = rows[5]!.querySelector<HTMLElement>('[role=gridcell][data-date="2026-11-18"]')!.getBoundingClientRect()
    expect(bar.left).toBeGreaterThanOrEqual(wednesday.left - 1)
    expect(bar.left).toBeLessThan(wednesday.right)
  })

  it("Chromium's accessibility tree: each row holds a rowheader and one gridcell per day (the wrappers flattened)", async () => {
    timeline(4)
    await sleep()
    const rows = await axRows()
    expect(rows).toHaveLength(5)
    expect(rows[0]!.cells).toEqual(['columnheader', ...Array.from({ length: 7 }, () => 'columnheader')])
    for (const r of rows.slice(1)) expect(r.cells).toEqual(['rowheader', ...Array.from({ length: 7 }, () => 'gridcell')])
  })

  it('one tab stop; the arrows move by day and resource, Enter goes into the day, Escape back, Tab leaves', async () => {
    const { root } = timeline(5)
    await sleep()
    const active = (): HTMLElement => document.activeElement as HTMLElement
    ;(root.querySelector('.before') as HTMLElement).focus()
    await userEvent.keyboard('{Tab}')
    expect(active().getAttribute('role')).toBe('gridcell')
    expect(active().dataset.date).toBe('2026-11-18')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    expect(active().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r3')
    expect(active().dataset.date).toBe('2026-11-19')
    await userEvent.keyboard('{ArrowLeft}{Enter}')
    expect(active().matches('button.pcal-tl-block')).toBe(true)
    expect(active().getAttribute('aria-label')).toContain('Meeting in r3')
    await userEvent.keyboard('{Escape}')
    expect(active().getAttribute('role')).toBe('gridcell')
    await userEvent.keyboard('{Tab}')
    expect(active().classList.contains('after')).toBe(true)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(active().closest('.pcal-tl-row')!.getAttribute('data-resource')).toBe('r3')
  })

  it('200 rooms (windowed): Ctrl+End scrolls to the last room and focuses it, numbered 201 of 201', async () => {
    const { grid, root } = timeline(200)
    await sleep()
    expect(grid.querySelectorAll('.pcal-tl-row').length).toBeLessThan(40)
    grid.querySelector<HTMLElement>('[role=gridcell][tabindex="0"]')!.focus()
    await userEvent.keyboard('{Control>}{End}{/Control}')
    await sleep()
    const row = (document.activeElement as HTMLElement).closest('.pcal-tl-row') as HTMLElement
    expect(row.dataset.resource).toBe('r200')
    expect(row.getAttribute('aria-rowindex')).toBe('201')
    expect(grid.getAttribute('aria-rowcount')).toBe('201')
    const box = grid.getBoundingClientRect()
    const at = row.getBoundingClientRect()
    expect(at.top).toBeGreaterThanOrEqual(box.top - 1)
    expect(at.bottom).toBeLessThanOrEqual(box.bottom + 1)
    expect(await violations(root)).toEqual([])
  })

  it('the empty timeline has no axe violation (no bare <p> inside the grid; the scrolling grid itself takes focus)', async () => {
    const calendar = createCalendar({ view: 'timeline', date: '2026-11-18', now: () => NOW, timeZone: () => 'UTC', events: () => [], resources: () => [] } as CalendarOptions)
    const root = render(<div class="pcal"><TimelineView calendar={calendar} /></div>)
    await sleep()
    expect(await violations(root)).toEqual([])
    expect(root.querySelector('[role=grid]')!.getAttribute('tabindex')).toBe('0')
  })

  it('opening hours are drawn: the closed days are tinted and the open hours light', async () => {
    const { grid } = timeline(2)
    await sleep()
    const row = grid.querySelector('.pcal-tl-row[data-resource="r1"]') as HTMLElement
    const closed = row.querySelector<HTMLElement>('[role=gridcell][data-business="closed"]')!
    expect(getComputedStyle(closed).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    const open = row.querySelector<HTMLElement>('.pcal-tl-open')!
    const monday = row.querySelector<HTMLElement>('[role=gridcell][data-date="2026-11-16"]')!.getBoundingClientRect()
    const band = open.getBoundingClientRect()
    // 09:00 to 17:00 of a 0:00 to 24:00 day: a third of the cell
    expect(band.width / monday.width).toBeCloseTo(8 / 24, 1)
    expect(band.left).toBeGreaterThan(monday.left)
  })
})
