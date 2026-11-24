// A reversed x axis in real Chromium: the plot reads right to left, but every
// index the host reports (clicks, brush ranges, the keyboard walk, the
// tooltip, the table) stays in DATA order.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { bars } from './marks'
import { Axis, Bar, Chart, Tooltip, Zoom } from './grammar'

interface Row { m: string; v: number }
const DATA: Row[] = [{ m: 'a', v: 40 }, { m: 'b', v: 40 }, { m: 'c', v: 40 }, { m: 'd', v: 40 }]
const W = 400
const H = 200

async function mountX(inverse: boolean, extra: Record<string, unknown> = {}) {
  const picked: number[] = []
  const m = mountInBrowser(h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false, showGrid: false, onSelect: (i: number) => picked.push(i), ...extra }, h(Bar<Row>, { y: 'v', label: 'V' }), h(Axis, { x: true, inverse }), h(Tooltip, {})))
  await flush()

  return { ...m, picked, canvas: query<HTMLCanvasElement>(m.container, 'canvas') }
}

const click = (c: HTMLCanvasElement, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

/** The datum index reported for each x across the plot, left to right, run-length encoded. */
function lanes(c: HTMLCanvasElement, picked: number[]): number[] {
  const out: number[] = []
  for (let x = 0; x < W; x += 2) {
    picked.length = 0
    click(c, x, H - 40)
    const v = picked.length > 0 ? picked[picked.length - 1]! : -1
    if (v >= 0 && out[out.length - 1] !== v) out.push(v)
  }

  return out
}

describe('xInverse in real Chromium', () => {
  it('a plain chart reports 0,1,2,3 left to right; a reversed one 3,2,1,0 - still DATA indices', async () => {
    const plain = await mountX(false)
    const inv = await mountX(true)
    expect(lanes(plain.canvas, plain.picked)).toEqual([0, 1, 2, 3])
    expect(lanes(inv.canvas, inv.picked)).toEqual([3, 2, 1, 0])
    plain.unmount()
    inv.unmount()
  })

  it('the tooltip names the datum under the pointer', async () => {
    const { canvas, container, unmount } = await mountX(true)
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 40, clientY: r.top + H - 40, bubbles: true }))
    await flush()
    expect(query<HTMLElement>(container, '[data-pyreon-chart-tooltip]').textContent).toContain('d')
    unmount()
  })

  it('the accessible table keeps data order', async () => {
    const { container, unmount } = await mountX(true)
    expect([...container.querySelectorAll('table tbody th')].map((e) => e.textContent)).toEqual(['a', 'b', 'c', 'd'])
    unmount()
  })

  it('the keyboard walk is in DATA order: the first arrow lands on the first datum, the next on the second', async () => {
    const { canvas, picked, unmount } = await mountX(true)
    canvas.focus()
    const key = (k: string): void => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    }
    key('ArrowRight')
    key('Enter')
    key('ArrowRight')
    key('Enter')
    await flush()
    expect(picked.slice(-2)).toEqual([0, 1])
    unmount()
  })

  it('a brush reports its range in DATA order, whichever way the plot reads', async () => {
    const got: ({ start: number; end: number } | null)[] = []
    const m = mountInBrowser(() => PlotChart<Row>({ data: DATA, x: (d) => d.m, marks: [bars((d: Row) => d.v)], brush: true, xInverse: true, animate: false, width: W, height: H, onBrush: (r) => got.push(r) }))
    await flush()
    const c = query<HTMLCanvasElement>(m.container, 'canvas')
    const r = c.getBoundingClientRect()
    const at = (x: number) => ({ clientX: r.left + x, clientY: r.top + 100, bubbles: true, cancelable: true })
    // drag across the two LEFTMOST bands: on a reversed axis those are the last two data rows
    c.dispatchEvent(new PointerEvent('pointerdown', at(30)))
    c.dispatchEvent(new PointerEvent('pointermove', at(60)))
    c.dispatchEvent(new PointerEvent('pointermove', at(150)))
    c.dispatchEvent(new PointerEvent('pointerup', at(150)))
    await flush()
    expect(got).toHaveLength(1)
    expect(got[0]).toEqual({ start: 2, end: 3 })
    m.unmount()
  })

  it('composes with a zoom window: the window is in data fractions, the rows still read right to left', async () => {
    const { canvas, picked, unmount } = await mountX(true, { initialZoom: { start: 0.5, end: 1 } })
    void Zoom
    expect(lanes(canvas, picked)).toEqual([3, 2])
    unmount()
  })
})

describe('keyboard pick on a thinned chart (fixed alongside)', () => {
  it('reports the datum row, not the position in the thinned list', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ m: `r${i}`, v: Math.sin(i / 7) * 50 + i }))
    const picked: number[] = []
    const m = mountInBrowser(() => PlotChart<{ m: string; v: number }>({ data: rows, x: (d) => d.m, marks: [bars((d: { v: number }) => d.v)], maxPoints: 10, animate: false, width: W, height: H, onSelect: (i) => picked.push(i) }))
    await flush()
    const c = query<HTMLCanvasElement>(m.container, 'canvas')
    c.focus()
    const key = (k: string): void => {
      c.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    }
    key('ArrowRight')
    key('Enter')
    key('ArrowRight')
    key('Enter')
    await flush()
    expect(picked[0]).toBe(0)
    // the second kept row of a 200-row chart thinned to 10 is far from row 1
    expect(picked[1]).toBeGreaterThan(5)
    m.unmount()
  })
})
