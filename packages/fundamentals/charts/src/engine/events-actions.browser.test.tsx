// The events/actions model in a real browser: selectedMode pins by keyboard
// pick, the change callbacks fire from ONE source of truth whoever wrote it
// (pointer, keyboard, dispatch), and the handle's signals ARE the chart.

import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { PlotChart } from './Chart'
import type { PlotChartProps } from './Chart'
import { bars } from './marks'
import { createChartHandle } from './link'
import type { ChartHandle } from './link'

interface Row {
  k: string
  v: number
}
const DATA: Row[] = [
  { k: 'Jan', v: 3 },
  { k: 'Feb', v: 5 },
  { k: 'Mar', v: 2 },
  { k: 'Apr', v: 4 },
]

// JSX, not a `() => PlotChart(...)` factory: a function child is a reactive
// accessor that the mount pipeline samples AND runs, so the component body
// executes twice — and two instances sharing one handle fire every change
// callback twice. A JSX element mounts the component exactly once, which is
// what a ledger-counting test needs.
const chartProps = (over: Partial<PlotChartProps<Row>> = {}): PlotChartProps<Row> => ({
  data: DATA,
  marks: [bars((d: Row) => d.v, { label: 'Value', color: '#b42318' })],
  x: (d: Row) => d.k,
  width: 320,
  height: 200,
  animate: false,
  ...over,
})
const mountChart = (over: Partial<PlotChartProps<Row>> = {}) => mountInBrowser(<PlotChart<Row> {...chartProps(over)} />)

const canvasOf = (container: HTMLElement): HTMLCanvasElement => query(container, 'canvas')
const key = (el: HTMLElement, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
}
const at = (el: HTMLElement, type: string, x: number, y: number): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('selectedMode', () => {
  it("'single' pins the picked datum, replaces it on the next pick, and reports every change with GLOBAL indices", async () => {
    const changes: number[][] = []
    const picks: number[] = []
    const { container } = mountChart({ selectedMode: 'single', onSelectChange: (s: number[]) => changes.push(s), onSelect: (i: number) => picks.push(i) })
    await flush()
    const c = canvasOf(container)
    c.focus()
    key(c, 'ArrowRight')
    key(c, 'Enter')
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('0')
    key(c, 'ArrowRight')
    key(c, 'Enter')
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('1')
    // Picking the pinned datum again unpins it.
    key(c, 'Enter')
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('')
    expect(changes).toEqual([[0], [1], []])
    // onSelect still reports each pick.
    expect(picks).toEqual([0, 1, 1])
  })

  it("'multiple' toggles each picked datum", async () => {
    const changes: number[][] = []
    const { container } = mountChart({ selectedMode: 'multiple', onSelectChange: (s: number[]) => changes.push(s) })
    await flush()
    const c = canvasOf(container)
    c.focus()
    key(c, 'ArrowRight')
    key(c, 'Enter')
    key(c, 'ArrowRight')
    key(c, 'Enter')
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('0,1')
    key(c, 'ArrowLeft')
    key(c, 'Enter')
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('1')
    expect(changes).toEqual([[0], [0, 1], [1]])
  })
})

describe('createChartHandle', () => {
  it('dispatch drives selection, highlight, legend and zoom, and every change callback fires as for a gesture', async () => {
    const chart: ChartHandle = createChartHandle()
    const sel: number[][] = []
    const hi: number[] = []
    const hid: number[][] = []
    const zoom: ({ start: number; end: number } | null)[] = []
    const { container } = mountChart({
      handle: chart,
      showLegend: true,
      onSelectChange: (s: number[]) => sel.push(s),
      onHighlight: (i: number) => hi.push(i),
      onLegendChange: (s: number[]) => hid.push(s),
      onZoom: (w: { start: number; end: number } | null) => zoom.push(w),
    })
    await flush()
    const c = canvasOf(container)

    chart.dispatch({ type: 'select', index: 2 })
    chart.dispatch({ type: 'toggleSelect', index: 0 })
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('2,0')
    expect(chart.selected()).toEqual([2, 0])
    chart.dispatch({ type: 'unselect', index: 2 })
    // Unselecting an absent datum is a no-op — no spurious change event.
    chart.dispatch({ type: 'unselect', index: 2 })
    await flush()
    expect(sel).toEqual([[2], [2, 0], [0]])

    chart.dispatch({ type: 'highlight', index: 1 })
    await flush()
    expect(c.getAttribute('data-pyreon-hover')).toBe('1')
    chart.dispatch({ type: 'downplay' })
    await flush()
    expect(hi).toEqual([1, -1])

    chart.dispatch({ type: 'legendToggle', series: 0 })
    await flush()
    expect(chart.hidden()).toEqual([0])
    chart.dispatch({ type: 'legendSelect', series: 0 })
    await flush()
    expect(hid).toEqual([[0], []])

    chart.dispatch({ type: 'dataZoom', start: 0.25, end: 0.75 })
    await flush()
    expect(c.getAttribute('data-pyreon-zoom')).toBe('0.250-0.750')
    // A full window is "everything" — it reads back as null, not as {0,1}.
    chart.dispatch({ type: 'dataZoom', start: 0, end: 1 })
    await flush()
    expect(zoom).toEqual([{ start: 0.25, end: 0.75 }, null])

    chart.dispatch({ type: 'select', index: 3 })
    chart.dispatch({ type: 'restore' })
    await flush()
    expect(c.getAttribute('data-pyreon-selected')).toBe('')
    expect(chart.zoom()).toBeNull()
    expect(chart.hover()).toBe(-1)
    expect(chart.hidden()).toEqual([])
  })

  it('a pointer hover reports through onHighlight and clears on leave — the events model alone installs the handlers', async () => {
    const hi: number[] = []
    const { container } = mountChart({ onHighlight: (i: number) => hi.push(i) })
    await flush()
    const c = canvasOf(container)
    at(c, 'pointermove', 200, 120)
    await flush()
    expect(hi.length).toBe(1)
    expect(hi[0]).toBeGreaterThanOrEqual(0)
    expect(c.getAttribute('data-pyreon-hover')).toBe(String(hi[0]))
    at(c, 'pointerleave', 0, 0)
    await flush()
    expect(hi[hi.length - 1]).toBe(-1)
  })

  it('a handle is a link: a sibling given it as `link` follows its zoom window', async () => {
    const hd = createChartHandle()
    const { container } = mountInBrowser(
      <div>
        <PlotChart<Row> {...chartProps({ handle: hd })} />
        <PlotChart<Row> {...chartProps({ link: hd })} />
      </div>,
    )
    await flush()
    hd.dispatch({ type: 'dataZoom', start: 0.5, end: 1 })
    await flush()
    const zooms = Array.from(container.querySelectorAll('canvas')).map((el) => el.getAttribute('data-pyreon-zoom'))
    expect(zooms).toEqual(['0.500-1.000', '0.500-1.000'])
  })
})

describe('ECharts vocabulary: tip + legend-all/inverse actions, click/dblclick/contextmenu/rendered', () => {
  it('showTip / hideTip move the crosshair datum; legendAllSelect and legendInverseSelect flip over the bound series count', async () => {
    const chart: ChartHandle = createChartHandle()
    const hid: number[][] = []
    const { container } = mountChart({ handle: chart, showLegend: true, onLegendChange: (s: number[]) => hid.push(s) })
    await flush()
    const c = canvasOf(container)
    chart.dispatch({ type: 'showTip', index: 2 })
    await flush()
    expect(c.getAttribute('data-pyreon-hover')).toBe('2')
    chart.dispatch({ type: 'hideTip' })
    await flush()
    expect(c.getAttribute('data-pyreon-hover')).toBe('-1')
    // One mark → the chart reports one series to the handle.
    expect(chart.seriesCount()).toBe(1)
    chart.dispatch({ type: 'legendToggle', series: 0 })
    chart.dispatch({ type: 'legendInverseSelect' })
    await flush()
    expect(chart.hidden(), 'inverse of [0] over one series').toEqual([])
    chart.dispatch({ type: 'legendInverseSelect' })
    await flush()
    expect(chart.hidden()).toEqual([0])
    chart.dispatch({ type: 'legendAllSelect' })
    chart.dispatch({ type: 'legendAllSelect' }) // idempotent — no spurious change
    await flush()
    expect(chart.hidden()).toEqual([])
    expect(hid).toEqual([[0], [], [0], []])
    // An explicit count stands in when no chart is bound.
    const loose = createChartHandle()
    loose.dispatch({ type: 'legendToggle', series: 1 })
    loose.dispatch({ type: 'legendInverseSelect', count: 3 })
    expect(loose.hidden()).toEqual([0, 2])
  })

  it('click / dblclick / contextmenu report the datum under the pointer, -1 for a miss; onRendered follows each paint', async () => {
    const clicks: number[] = []
    const dbl: number[] = []
    const ctx: number[] = []
    let paints = 0
    const { container } = mountChart({
      onClick: (i: number) => clicks.push(i),
      onDoubleClick: (i: number) => dbl.push(i),
      onContextMenu: (i: number) => ctx.push(i),
      onRendered: () => { paints += 1 },
    })
    await flush()
    const c = canvasOf(container)
    expect(paints, 'the mount painted').toBeGreaterThan(0)
    const r = c.getBoundingClientRect()
    const fire = (type: string, x: number, y: number): void => {
      c.dispatchEvent(new MouseEvent(type, { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }))
    }
    // A miss at the very corner is -1. Then find a bar: sweep the plot until
    // a click reports a datum (the bar geometry is the engine's, not the test's).
    fire('click', 1, 1)
    await flush()
    expect(clicks).toEqual([-1])
    let hit: { x: number; y: number } | null = null
    for (let y = 40; y < 200 && hit === null; y += 20) {
      for (let x = 20; x < 320 && hit === null; x += 10) {
        const before = clicks.length
        fire('click', x, y)
        if (clicks.length > before && clicks[before]! >= 0) hit = { x, y }
      }
    }
    expect(hit, 'a click somewhere on the plot lands on a bar').not.toBeNull()
    const index = clicks[clicks.length - 1]!
    fire('dblclick', 1, 1)
    fire('dblclick', hit!.x, hit!.y)
    fire('contextmenu', 1, 1)
    fire('contextmenu', hit!.x, hit!.y)
    await flush()
    expect(dbl).toEqual([-1, index])
    expect(ctx).toEqual([-1, index])
    // No selectedMode → a click never pins.
    expect(c.getAttribute('data-pyreon-selected')).toBe('')
  })
})
