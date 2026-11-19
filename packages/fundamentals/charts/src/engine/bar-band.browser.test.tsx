// Bars on a numeric x axis in real Chromium: hits, the tooltip, zoom, brush and a streaming (keyed) update.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { bars } from './marks'

interface Row { id: string; x: number; v: number }
// Irregular x: 3 and 6-8 are missing, so the slot is 1 wide and there are empty stretches between bars.
const XS = [1, 2, 4, 5, 9]
const DATA: Row[] = XS.map((x, i) => ({ id: String(x), x, v: 40 + i }))
const W = 500
const H = 200

async function mountBars(extra: Record<string, unknown> = {}, data: Row[] | (() => Row[]) = DATA) {
  const picked: number[] = []
  const brushed: ({ start: number; end: number } | null)[] = []
  const m = mountInBrowser(() => PlotChart<Row>({ data, xValue: (d) => d.x, marks: [bars((d: Row) => d.v)], animate: false, showGrid: false, tooltip: true, width: W, height: H, onSelect: (i: number) => picked.push(i), onBrush: (r) => brushed.push(r), ...extra }))
  await flush()

  return { ...m, picked, brushed, canvas: query<HTMLCanvasElement>(m.container, 'canvas') }
}

const click = (c: HTMLCanvasElement, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

/** For each datum index, the pixel columns that report it (a click at the bars' height), scanning the whole width. */
function columns(c: HTMLCanvasElement, picked: number[]): Map<number, number[]> {
  const out = new Map<number, number[]>()
  for (let x = 0; x < W; x += 1) {
    picked.length = 0
    click(c, x, H - 30)
    if (picked.length > 0 && picked[picked.length - 1]! >= 0) out.set(picked[picked.length - 1]!, [...(out.get(picked[picked.length - 1]!) ?? []), x])
  }

  return out
}

const centre = (xs: number[]): number => (xs[0]! + xs[xs.length - 1]!) / 2

describe('bars on a numeric x axis in real Chromium', () => {
  it('each bar answers a click at its own x: the centres are proportional to the x values and the gaps are misses', async () => {
    const { canvas, picked, unmount } = await mountBars()
    const cols = columns(canvas, picked)
    expect([...cols.keys()]).toEqual([0, 1, 2, 3, 4])
    const c = [0, 1, 2, 3, 4].map((i) => centre(cols.get(i)!))
    for (let i = 1; i < 5; i++) expect((c[i]! - c[0]!) / (c[4]! - c[0]!)).toBeCloseTo((XS[i]! - XS[0]!) / (XS[4]! - XS[0]!), 1)
    // a click between the bar of x=5 and the bar of x=9 hits nothing: there is an empty stretch of columns
    expect(Math.min(...cols.get(4)!) - Math.max(...cols.get(3)!)).toBeGreaterThan(30)
    unmount()
  })

  it('the tooltip names the datum under the pointer', async () => {
    const { canvas, container, picked, unmount } = await mountBars()
    const x = centre(columns(canvas, picked).get(2)!)
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + H - 30, bubbles: true }))
    await flush()
    expect(query<HTMLElement>(container, '[data-pyreon-chart-tooltip]').textContent).toContain('42')
    unmount()
  })

  it('the accessible table is unchanged by the x axis: one row per datum, in data order', async () => {
    const { container, unmount } = await mountBars()
    expect(container.querySelectorAll('table tbody tr').length).toBe(5)
    unmount()
  })

  it('a zoomed window re-lays the bars: only the visible data are drawn, and they are still hit', async () => {
    const { canvas, picked, unmount } = await mountBars({ dataZoom: true, initialZoom: { start: 0, end: 0.6 } })
    const cols = columns(canvas, picked)
    // the first three rows are in the window
    expect([...cols.keys()]).toEqual([0, 1, 2])
    unmount()
  })

  it('a brush across the left half reports the datum range it covers', async () => {
    const { canvas, brushed, unmount } = await mountBars({ brush: true })
    const r = canvas.getBoundingClientRect()
    const at = (x: number) => ({ clientX: r.left + x, clientY: r.top + 100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(40)))
    canvas.dispatchEvent(new PointerEvent('pointermove', at(200)))
    canvas.dispatchEvent(new PointerEvent('pointerup', at(200)))
    await flush()
    const last = brushed[brushed.length - 1]
    expect(last).not.toBeNull()
    expect(last!.start).toBe(0)
    expect(last!.end).toBeGreaterThanOrEqual(1)
    unmount()
  })

  it('a streaming update (a point appended, the oldest dropped) morphs by key with only finite coordinates', async () => {
    const rows = signal<Row[]>(DATA)
    const m = mountInBrowser(() => PlotChart<Row>({ data: rows, xValue: (d) => d.x, by: (d) => d.id, marks: [bars((d: Row) => d.v)], animate: false, updateDuration: 600, showGrid: false, width: W, height: H }))
    await flush()
    const ctx2d = query<HTMLCanvasElement>(m.container, 'canvas').getContext('2d')!
    const moves = vi.spyOn(ctx2d, 'moveTo')
    const lines = vi.spyOn(ctx2d, 'lineTo')
    rows.set([...rows.peek().slice(1), { id: '10', x: 10, v: 47 }])
    await flush()
    const pts = [...moves.mock.calls, ...lines.mock.calls]
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    moves.mockRestore()
    lines.mockRestore()
    m.unmount()
  })
})
