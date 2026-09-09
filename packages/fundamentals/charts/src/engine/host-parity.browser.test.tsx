// Every family host carries the interaction stack `<PlotChart>` had alone:
// keyboard navigation with a live region and a focus ring, pointer (touch)
// tooltips, an update tween, a legend on any side, a PNG toolbox, and an
// accessible table the canvas is described BY. Real Chromium — a canvas host
// has nothing to assert without a real 2d context.
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { TreemapChart } from './TreemapChart'
import { GaugeChart, PieChart } from './PieChart'
import { CalendarChart } from './CalendarChart'
import { PlotChart } from './Chart'
import { bars, line, resolveMarks } from './marks'
import type { TreeNode } from './treemap'

const TREE: TreeNode[] = [
  { name: 'a', value: 40 },
  { name: 'b', value: 30 },
  { name: 'c', value: 20 },
]

function inked(canvas: HTMLCanvasElement, y0 = 0, y1 = canvas.height): number {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, y0, canvas.width, Math.max(1, y1 - y0))
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
/** A checksum of every channel — a treemap inks EVERY pixel, so a count cannot see a cell move; a sum can. */
function checksum(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 0; i < data.length; i++) n = (n + data[i]! * ((i % 7) + 1)) % 1_000_000_007
  return n
}
const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}
const pointer = (el: Element, type: string, x: number, y: number, extra: PointerEventInit = {}): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true, ...extra }))
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('keyboard on a family host', () => {
  it('walks the items with the arrows, announces each in the live region, and Enter selects through onSelect + onSelectIndex', async () => {
    const picked: string[] = []
    const indices: number[] = []
    const { container } = mountInBrowser(() =>
      TreemapChart({ data: TREE, width: 300, height: 200, animate: false, onSelect: (c) => picked.push(c?.name ?? 'null'), onSelectIndex: (i) => indices.push(i) }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.getAttribute('tabindex')).toBe('0')
    const live = container.querySelector('[aria-live="polite"]')!
    const before = checksum(canvas)
    key(canvas, 'ArrowRight')
    await flush()
    expect(live.textContent).toBe('a, 40')
    // The ring is painted around the focused cell.
    expect(checksum(canvas)).not.toBe(before)
    key(canvas, 'ArrowRight')
    await flush()
    expect(live.textContent).toBe('b, 30')
    key(canvas, 'End')
    await flush()
    expect(live.textContent).toBe('c, 20')
    key(canvas, 'Enter')
    expect(picked).toEqual(['c'])
    expect(indices).toEqual([2])
    key(canvas, 'Escape')
    await flush()
    expect(live.textContent).toBe('')
  })

  it('a pie (no focus rect) still walks and picks by index; keyboard={false} removes the tab stop', async () => {
    const indices: number[] = []
    const { container } = mountInBrowser(() =>
      PieChart<{ n: string; v: number }>({ data: [{ n: 'x', v: 1 }, { n: 'y', v: 2 }], value: (d) => d.v, label: (d) => d.n, width: 200, height: 200, onSelectIndex: (i) => indices.push(i) }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    key(canvas, 'ArrowLeft')
    key(canvas, ' ')
    expect(indices).toEqual([1])
    const { container: off } = mountInBrowser(() =>
      PieChart<{ n: string; v: number }>({ data: [{ n: 'x', v: 1 }], value: (d) => d.v, label: (d) => d.n, keyboard: false }),
    )
    await flush()
    expect(off.querySelector('canvas')!.hasAttribute('tabindex')).toBe(false)
    expect(off.querySelector('[aria-live]')).toBeNull()
  })
})

describe('accessibility wiring on a family host', () => {
  it('the canvas is described BY the table, and the gauge has the same contract as every host', async () => {
    const { container } = mountInBrowser(() => GaugeChart({ value: 42, max: 100, title: 'Load', width: 200 }))
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.getAttribute('role')).toBe('img')
    expect(canvas.getAttribute('aria-label')).toBe('Load: 42 of 100')
    const id = canvas.getAttribute('aria-describedby')
    expect(id).not.toBeNull()
    const table = query<HTMLTableElement>(container, `#${id}`)
    expect(table.tagName).toBe('TABLE')
    expect(table.querySelector('caption')!.textContent).toBe('Load')
    expect(table.textContent).toContain('42')
    expect(inked(canvas)).toBeGreaterThan(200)
  })

  it('a reactive gauge value repaints and re-describes', async () => {
    const v = signal(10)
    const { container } = mountInBrowser(() => GaugeChart({ value: () => v(), width: 200, animate: false, updateAnimation: false }))
    await flush()
    const canvas = container.querySelector('canvas')!
    const before = inked(canvas)
    v.set(90)
    await flush()
    expect(canvas.getAttribute('aria-label')).toBe('Gauge: 90 of 100')
    expect(inked(canvas)).not.toBe(before)
  })
})

describe('update animation on a family host', () => {
  it('tweens a same-shape data change over updateDuration and settles on the new frame; updateAnimation={false} snaps', async () => {
    const data = signal<TreeNode[]>(TREE)
    const { container } = mountInBrowser(() => TreemapChart({ data: () => data(), width: 400, height: 300, animate: false, updateDuration: 120 }))
    await flush()
    const canvas = container.querySelector('canvas')!
    // A mild change: every cell keeps its label, so the two frames share a shape and tween.
    const snap = (): number => checksum(canvas)
    const first = snap()
    data.set([{ name: 'a', value: 46 }, { name: 'b', value: 30 }, { name: 'c', value: 20 }])
    // Sample the canvas through the tween: a tween passes through frames that
    // are neither the old nor the new one; a snap would show exactly two values.
    const seen = new Set<number>([first])
    for (let i = 0; i < 16; i++) {
      await wait(20)
      seen.add(snap())
    }
    const settled = snap()
    expect(settled).not.toBe(first)
    expect(seen.size).toBeGreaterThan(2)
    // The settled frame is what a snap paints.
    const { container: c2 } = mountInBrowser(() => TreemapChart({ data: [{ name: 'a', value: 46 }, { name: 'b', value: 30 }, { name: 'c', value: 20 }], width: 400, height: 300, animate: false }))
    await flush()
    expect(settled).toBe(checksum(c2.querySelector('canvas')!))
    // `updateAnimation={false}` paints the new frame at once.
    const snapData = signal<TreeNode[]>(TREE)
    const { container: c3 } = mountInBrowser(() => TreemapChart({ data: () => snapData(), width: 400, height: 300, animate: false, updateAnimation: false }))
    await flush()
    snapData.set([{ name: 'a', value: 46 }, { name: 'b', value: 30 }, { name: 'c', value: 20 }])
    await flush()
    expect(checksum(c3.querySelector('canvas')!)).toBe(settled)
  })
})

describe('legend placement', () => {
  it('bottom puts the legend under the chart; right puts it in a column beside it', async () => {
    const top = mountInBrowser(() => TreemapChart({ data: TREE, width: 300, height: 200, animate: false, showLegend: true }))
    const bottom = mountInBrowser(() => TreemapChart({ data: TREE, width: 300, height: 200, animate: false, showLegend: true, legendPosition: 'bottom' }))
    const right = mountInBrowser(() => TreemapChart({ data: TREE, width: 300, height: 200, animate: false, showLegend: true, legendPosition: 'right' }))
    await flush()
    const ct = top.container.querySelector('canvas')!
    const cb = bottom.container.querySelector('canvas')!
    const cr = right.container.querySelector('canvas')!
    // The top legend leaves the bottom strip to the treemap (dense ink); the bottom legend leaves it sparse.
    const strip = (c: HTMLCanvasElement) => inked(c, c.height - 12, c.height)
    expect(strip(ct)).toBeGreaterThan(strip(cb) * 2)
    // A right legend keeps the top strip dense (no legend row) — differs from the top layout.
    expect(inked(cr, 0, 12)).toBeGreaterThan(inked(ct, 0, 12) * 2)
  })

  it('PlotChart: a left legend shifts the plot right and a click still hits the right bar', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<{ m: string; v: number }>({
        data: [{ m: 'a', v: 3 }, { m: 'b', v: 6 }, { m: 'c', v: 9 }],
        x: (d) => d.m,
        marks: [bars((d) => d.v, { label: 'A very long legend label' })],
        width: 400,
        height: 200,
        animate: false,
        showLegend: true,
        legendPosition: 'left',
        onSelect: (i) => picked.push(i),
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    // The left strip holds the legend, so the plot starts well right of it: a
    // click at the plot's own right third lands on the LAST bar.
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + 350, clientY: r.top + 100, bubbles: true }))
    expect(picked).toEqual([2])
    // The same x on a top legend is ALSO the last bar — the far-right click
    // agrees across layouts, which is why the discriminating pair below exists.
    const top = mountInBrowser(() =>
      PlotChart<{ m: string; v: number }>({ data: [{ m: 'a', v: 3 }, { m: 'b', v: 6 }, { m: 'c', v: 9 }], x: (d) => d.m, marks: [bars((d) => d.v, { label: 'A very long legend label' })], width: 400, height: 200, animate: false, showLegend: true, onSelect: (i) => picked.push(i) }),
    )
    await flush()
    const c2 = top.container.querySelector('canvas')!
    const r2 = c2.getBoundingClientRect()
    c2.dispatchEvent(new MouseEvent('click', { clientX: r2.left + 350, clientY: r2.top + 100, bubbles: true }))
    expect(picked).toEqual([2, 2])
    // …and the far-right bar is the one x that agrees, so it proves nothing on
    // its own. THIS is the discriminating pair: with the legend in a left
    // column the plot starts well right of 0, so x = 280 is over the middle
    // bar and x = 200 is over the short first one (a miss at this y); with the
    // legend on top the plot spans the full width and the two swap.
    //
    // The spec used to claim the difference in a comment and assert only the
    // agreeing click — a comment is not a test.
    const clickAt = (c: HTMLCanvasElement, x: number): number => {
      const box = c.getBoundingClientRect()
      picked.length = 0
      c.dispatchEvent(new MouseEvent('click', { clientX: box.left + x, clientY: box.top + 100, bubbles: true }))
      return picked[0] ?? Number.NaN
    }
    expect(clickAt(canvas, 280), 'left legend: x=280 is the middle bar').toBe(1)
    expect(clickAt(canvas, 200), 'left legend: x=200 is past the plot start but over the short bar').toBe(-1)
    expect(clickAt(c2, 200), 'top legend: x=200 is the middle bar').toBe(1)
    expect(clickAt(c2, 280), 'top legend: x=280 falls between bars').toBe(-1)
    expect(inked(canvas, 0, 200)).toBeGreaterThan(0)
  })
})

describe('touch and toolbox', () => {
  it('a pointerdown (a tap) shows the tooltip; pointercancel hides it', async () => {
    const { container } = mountInBrowser(() =>
      PieChart<{ n: string; v: number }>({ data: [{ n: 'x', v: 1 }, { n: 'y', v: 2 }], value: (d) => d.v, label: (d) => d.n, width: 200, height: 200, tooltip: true }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const tip = query<HTMLDivElement>(container, '[data-pyreon-chart-tooltip]')
    pointer(canvas, 'pointerdown', 100, 60, { pointerType: 'touch' })
    expect(tip.style.display).toBe('block')
    expect(tip.textContent).toContain('%')
    pointer(canvas, 'pointercancel', 0, 0)
    expect(tip.style.display).toBe('none')
  })

  it('saveAsImage hands a PNG data URL to onSaveImage on the family host, and to the plot host with format', async () => {
    const got: string[] = []
    const { container } = mountInBrowser(() => TreemapChart({ data: TREE, width: 300, height: 200, animate: false, toolbox: { saveAsImage: true }, onSaveImage: (u) => got.push(u) }))
    await flush()
    const canvas = container.querySelector('canvas')!
    const r = canvas.getBoundingClientRect()
    // The tool sits at the top-right corner.
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + 290, clientY: r.top + 10, bubbles: true }))
    expect(got).toHaveLength(1)
    expect(got[0]!.startsWith('data:image/png')).toBe(true)
    const plot: [string, string][] = []
    const { container: c2 } = mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: [{ v: 1 }, { v: 2 }], marks: [bars((d) => d.v)], width: 300, height: 200, animate: false, toolbox: { saveAsImage: 'png' }, onSaveImage: (d, f) => plot.push([d, f]) }),
    )
    await flush()
    const canvas2 = c2.querySelector('canvas')!
    const r2 = canvas2.getBoundingClientRect()
    canvas2.dispatchEvent(new MouseEvent('click', { clientX: r2.left + 290, clientY: r2.top + 10, bubbles: true }))
    expect(plot).toHaveLength(1)
    expect(plot[0]![1]).toBe('png')
    expect(plot[0]![0].startsWith('data:image/png')).toBe(true)
  })
})

describe('PlotChart pinch and cached hit-testing', () => {
  it('two pointers moving apart narrow the zoom window; moving together widen it back', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ v: i }))
    const { container } = mountInBrowser(() => PlotChart<{ v: number }>({ data: rows, marks: [line((d) => d.v)], width: 400, height: 200, animate: false, dataZoom: true }))
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(canvas.style.touchAction).toBe('none')
    expect(canvas.getAttribute('data-pyreon-zoom')).toBe('all')
    pointer(canvas, 'pointerdown', 150, 100, { pointerId: 1, pointerType: 'touch' })
    pointer(canvas, 'pointerdown', 250, 100, { pointerId: 2, pointerType: 'touch' })
    pointer(canvas, 'pointermove', 100, 100, { pointerId: 1, pointerType: 'touch' })
    pointer(canvas, 'pointermove', 300, 100, { pointerId: 2, pointerType: 'touch' })
    await flush()
    const zoomed = canvas.getAttribute('data-pyreon-zoom')!
    expect(zoomed).not.toBe('all')
    const [s, e] = zoomed.split('-').map(Number)
    expect(e! - s!).toBeLessThan(1)
    pointer(canvas, 'pointermove', 190, 100, { pointerId: 1, pointerType: 'touch' })
    pointer(canvas, 'pointermove', 210, 100, { pointerId: 2, pointerType: 'touch' })
    await flush()
    expect(canvas.getAttribute('data-pyreon-zoom')).toBe('all')
    pointer(canvas, 'pointerup', 190, 100, { pointerId: 1 })
    pointer(canvas, 'pointerup', 210, 100, { pointerId: 2 })
  })

  it('a hover after a data change hit-tests the NEW frame (the cache follows the draw)', async () => {
    const data = signal([{ v: 1 }, { v: 2 }, { v: 3 }])
    const hovered: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<{ v: number }>({ data: () => data(), marks: [bars((d) => d.v)], width: 300, height: 200, animate: false, updateAnimation: false, onHighlight: (i) => hovered.push(i) }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    pointer(canvas, 'pointermove', 250, 150)
    await flush()
    expect(hovered).toEqual([2])
    data.set([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }, { v: 6 }])
    await flush()
    pointer(canvas, 'pointermove', 250, 150)
    await flush()
    expect(hovered[hovered.length - 1]).toBe(5)
  })

  it('caps the accessible table and says so in the caption', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ v: i }))
    const { container } = mountInBrowser(() => PlotChart<{ v: number }>({ data: rows, marks: [line((d) => d.v)], width: 300, height: 100, animate: false, title: 'Big' }))
    await flush()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1000)
    expect(container.querySelector('caption')!.textContent).toBe('Big (first 1000 of 1500 rows)')
    expect(resolveMarks(rows, [line<{ v: number }>((d) => d.v)])[0]!.values).toHaveLength(1500)
  })

  it('Calendar reports onSelectIndex beside its rich hit', async () => {
    const idx: number[] = []
    const { container } = mountInBrowser(() =>
      CalendarChart({ start: '2024-01-01', end: '2024-01-14', values: { '2024-01-03': 5 }, width: 300, height: 120, animate: false, onSelectIndex: (i) => idx.push(i) }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + 1, clientY: r.top + 1, bubbles: true }))
    expect(idx).toHaveLength(1)
  })
})
