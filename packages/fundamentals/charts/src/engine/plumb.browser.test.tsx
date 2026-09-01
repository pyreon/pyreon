// Real-Chromium specs for the PlotChart plumb wave: dual-y props, markers,
// legend paging, the title block, the tooltip formatter — and the hit-test
// offset fix (pointer handlers now work in PLOT space under a title/legend).
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { bars, line } from './marks'
import { PlotChart } from './Chart'

interface Row { v: number; r: number }
const DATA: Row[] = [{ v: 100, r: 0.2 }, { v: 50, r: 0.9 }, { v: 100, r: 0.5 }]
const many = Array.from({ length: 12 }, (_, i) => line((d: Row) => d.v + i, { label: `series-number-${i}` }))

const inkedIn = (canvas: HTMLCanvasElement, x0: number, x1: number, y0 = 0, y1 = 100000): number => {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) {
    const p = (i - 3) / 4
    const px = p % width
    const py = Math.floor(p / width)
    if (px >= x0 * dpr && px < x1 * dpr && py >= y0 * dpr && py < y1 * dpr && data[i]! > 0) n++
  }
  return n
}
const inked = (c: HTMLCanvasElement) => inkedIn(c, 0, 100000)
const canvasOf = (el: HTMLElement) => el.querySelector('canvas') as HTMLCanvasElement
const click = (c: HTMLCanvasElement, x: number, y: number) => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('PlotChart plumb (real browser)', () => {
  it('hit tests run in PLOT space under a title + legend (a click above a short bar is a miss)', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v, { label: 'v' })], width: 400, height: 200, animate: false,
        showLegend: true, showTitle: true, title: 'Heading', subtitle: 'Sub', onSelect: (i) => picked.push(i) }),
    )
    await flush()
    const c = canvasOf(container)
    // Middle bar is half-height. Under ~50px of title+legend the drawn bar
    // spans roughly y 119..179; y=100 is empty canvas. Before the fix the
    // unshifted layout reported a bar there.
    click(c, 210, 100)
    click(c, 210, 150)
    await flush()
    expect(picked).toEqual([-1, 1])
  })

  it('a right-axis mark paints right-gutter labels where a single-axis chart paints nothing', async () => {
    // Grid off, so the far-right strip of a single-axis chart is EMPTY (the
    // last bar ends near x=373); a right axis puts its tick labels there.
    const pct = (v: number): string => Math.round(v * 100) + '%'
    const one = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v), line((d) => d.r)], width: 400, height: 200, animate: false, showGrid: false }))
    const two = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v), line((d) => d.r, { axis: 'right' })], width: 400, height: 200, animate: false, showGrid: false, y2Format: pct }))
    await flush()
    // Band y 20..140: above the x-axis strip and the low-lying line, where a
    // single-axis chart draws nothing at the far right.
    expect(inkedIn(canvasOf(one.container), 378, 400, 20, 140)).toBe(0)
    expect(inkedIn(canvasOf(two.container), 378, 400, 20, 140)).toBeGreaterThan(0)
  })

  it('markers paint extra ink', async () => {
    const a = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [line((d) => d.v)], width: 400, height: 200, animate: false }))
    const b = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [line((d) => d.v)], width: 400, height: 200, animate: false, markers: [{ at: 'min', label: 'low', radius: 8 }] }))
    await flush()
    expect(inked(canvasOf(b.container))).toBeGreaterThan(inked(canvasOf(a.container)))
  })

  it('legend paging: the next arrow flips the page and repaints', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: many, width: 400, height: 200, animate: false, showLegend: true, legendMaxRows: 1 }),
    )
    await flush()
    const c = canvasOf(container)
    const before = inked(c)
    // The pager sits right-aligned on the single visible legend row.
    click(c, 396, 10)
    await flush()
    expect(inked(c)).not.toBe(before)
  })

  it('the title block consumes height (the plot moves down)', async () => {
    const plain = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false }))
    const titled = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, showTitle: true, title: 'Heading' }))
    await flush()
    const rowInk = (c: HTMLCanvasElement, y: number): number => {
      const ctx = c.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      const row = ctx.getImageData(0, Math.round(y * dpr), c.width, 1).data
      let n = 0
      for (let i = 3; i < row.length; i += 4) if (row[i]! > 0) n++
      return n
    }
    // Just under the top pad, the plain chart already draws the 100-value
    // bars; the titled one has heading text there instead — different ink.
    expect(rowInk(titled.container.querySelector('canvas')!, 14)).not.toBe(rowInk(plain.container.querySelector('canvas')!, 14))
  })

  it('tooltipFormatter replaces the default lines', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v, { label: 'v' })], width: 400, height: 200, animate: false,
        tooltip: true, tooltipFormatter: (c) => `custom:${c.rows[0]!.value}` }),
    )
    await flush()
    const c = canvasOf(container)
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 210, clientY: r.top + 150, bubbles: true }))
    await flush()
    const tip = container.querySelector('[data-pyreon-chart-tooltip]') as HTMLElement
    expect(tip.textContent).toBe('custom:50')
  })
})
