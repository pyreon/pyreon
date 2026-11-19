// A reversed value axis in real Chromium: bars hang from the top, so the pointer
// must hit them there, the tooltip and the table keep reading the data in its
// own order, and a zoom window composes with the flip.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Axis, Bar, Chart, Tooltip, Zoom } from './grammar'

interface Row { m: string; v: number }
const DATA: Row[] = [{ m: 'a', v: 10 }, { m: 'b', v: 40 }, { m: 'c', v: 25 }, { m: 'd', v: 5 }]
const W = 360
const H = 220

async function mountChart(inverse: boolean, extra: Record<string, unknown> = {}, kids: unknown[] = []) {
  const picked: number[] = []
  const m = mountInBrowser(
    h(Chart<Row>, { data: DATA, x: 'm', width: W, height: H, animate: false, showGrid: false, onSelect: (i: number) => picked.push(i), ...extra }, h(Bar<Row>, { y: 'v', label: 'Value' }), h(Axis, { y: true, inverse }), h(Tooltip, {}), ...(kids as never[])),
  )
  await flush()

  return { ...m, picked, canvas: query<HTMLCanvasElement>(m.container, 'canvas') }
}

const click = (c: HTMLCanvasElement, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

/** Which bars a vertical sweep at one column of the canvas hits, top to bottom. */
function column(c: HTMLCanvasElement, picked: number[], x: number): number[] {
  const hits: number[] = []
  for (let y = 0; y < H; y += 2) {
    picked.length = 0
    click(c, x, y)
    hits.push(picked.length > 0 ? picked[picked.length - 1]! : -1)
  }

  return hits
}

describe('yInverse in real Chromium', () => {
  it('a plain chart hits its bars from the bottom; an inverted one from the top', async () => {
    const plain = await mountChart(false)
    const inv = await mountChart(true)
    // x of the short bar "d" (the last band): its bar is short, so only one end of the column hits.
    const x = 16 + (W - 28) * 0.875
    const p = column(plain.canvas, plain.picked, x)
    const i = column(inv.canvas, inv.picked, x)
    const firstHit = (hits: number[]): number => hits.findIndex((v) => v === 3)
    const lastHit = (hits: number[]): number => hits.length - 1 - [...hits].reverse().findIndex((v) => v === 3)
    // plain: the hit run touches the bottom of the plot; inverted: it starts at the top
    expect(lastHit(p)).toBeGreaterThan(firstHit(p))
    expect(firstHit(i)).toBeLessThan(firstHit(p))
    expect(firstHit(i)).toBeLessThanOrEqual(6)
    plain.unmount()
    inv.unmount()
  })

  it('the tooltip reads the datum under the pointer, with its real value', async () => {
    const { canvas, container, unmount } = await mountChart(true)
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 16 + (W - 28) * 0.375, clientY: r.top + 20, bubbles: true }))
    await flush()
    expect(query<HTMLElement>(container, '[data-pyreon-chart-tooltip]').textContent).toContain('40')
    unmount()
  })

  it('the accessible table keeps the data order, not the visual one', async () => {
    const { container, unmount } = await mountChart(true)
    const cells = [...container.querySelectorAll('table tbody th')].map((e) => e.textContent)
    expect(cells).toEqual(['a', 'b', 'c', 'd'])
    unmount()
  })

  it('composes with a zoom window: only the visible bars (GLOBAL indices 2 and 3), hung from the top', async () => {
    const { canvas, picked, unmount } = await mountChart(true, { initialZoom: { start: 0.5, end: 1 } }, [h(Zoom, {})])
    const hits = new Set<number>()
    for (const fx of [0.25, 0.75]) for (const v of column(canvas, picked, 16 + (W - 28) * fx)) if (v >= 0) hits.add(v)
    expect([...hits].every((i) => i >= 2 && i <= 3)).toBe(true)
    expect(hits.size).toBeGreaterThan(0)
    unmount()
  })
})
