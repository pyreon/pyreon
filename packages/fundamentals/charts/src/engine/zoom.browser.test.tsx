// Real-Chromium specs for dataZoom + brush.
//
// The gestures are pointer/wheel driven and paint onto a canvas — happy-dom
// has neither real event routing nor pixels, so these run only in the real
// browser (the canvas-host precedent: chart/pie/heatmap/candlestick suites).
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { bars, line } from './marks'
import { PlotChart } from './Chart'

interface Row {
  v: number
}

const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ v: i + 1 }))

/** Count non-transparent pixels — proof that something was actually painted. */
const inked = (canvas: HTMLCanvasElement): number => {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

const wheelAt = (el: HTMLCanvasElement, dx: number, deltaY: number): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(
    new WheelEvent('wheel', { clientX: r.left + dx, clientY: r.top + 100, deltaY, bubbles: true, cancelable: true }),
  )
}

const drag = (el: HTMLCanvasElement, fromX: number, toX: number, shift = false): void => {
  const r = el.getBoundingClientRect()
  const opts = (x: number) => ({
    clientX: r.left + x,
    clientY: r.top + 100,
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
  })
  el.dispatchEvent(new MouseEvent('mousedown', opts(fromX)))
  el.dispatchEvent(new MouseEvent('mousemove', opts((fromX + toX) / 2)))
  el.dispatchEvent(new MouseEvent('mousemove', opts(toX)))
  el.dispatchEvent(new MouseEvent('mouseup', opts(toX)))
}

const canvasOf = (container: HTMLElement): HTMLCanvasElement => {
  const c = container.querySelector('canvas')
  if (c === null) throw new Error('no canvas mounted')
  return c
}

describe('dataZoom + brush (real browser)', () => {
  it('wheel zoom narrows the visible data and dblclick resets', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: rows, marks: [bars((d: Row) => d.v)],
      dataZoom: true, animate: false, width: 400, height: 200,
    }),
    )
    const canvas = canvasOf(container)
    await flush()
    const before = inked(canvas)
    wheelAt(canvas, 200, -1) // zoom in at the middle
    wheelAt(canvas, 200, -1)
    await flush()
    const zoomed = inked(canvas)
    // Fewer, wider bars: the paint genuinely changes.
    expect(zoomed).not.toBe(before)
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flush()
    expect(inked(canvas)).toBe(before)
  })

  it('a zoom-in wheel is CAPTURED (preventDefault) so the page does not scroll', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: rows, marks: [bars((d: Row) => d.v)],
      dataZoom: true, animate: false, width: 400, height: 200,
    }),
    )
    const canvas = canvasOf(container)
    const r = canvas.getBoundingClientRect()
    const ev = new WheelEvent('wheel', { clientX: r.left + 200, clientY: r.top + 100, deltaY: -1, bubbles: true, cancelable: true })
    canvas.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('drag pans a zoomed window (paint changes without new wheel input)', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: rows, marks: [bars((d: Row) => d.v)],
      dataZoom: true, animate: false, width: 400, height: 200,
    }),
    )
    const canvas = canvasOf(container)
    await flush()
    wheelAt(canvas, 200, -1)
    wheelAt(canvas, 200, -1)
    await flush()
    const zoomed = inked(canvas)
    drag(canvas, 300, 100)
    await flush()
    expect(inked(canvas)).not.toBe(zoomed)
  })

  it('brush drag reports a GLOBAL inclusive range and a plain click clears it', async () => {
    const got: ({ start: number; end: number } | null)[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: rows, marks: [line((d: Row) => d.v)],
      brush: true, animate: false, width: 400, height: 200,
      onBrush: (r: { start: number; end: number } | null) => got.push(r),
    }),
    )
    const canvas = canvasOf(container)
    await flush()
    drag(canvas, 100, 300)
    await flush()
    expect(got).toHaveLength(1)
    expect(got[0]).not.toBeNull()
    expect(got[0]!.end).toBeGreaterThan(got[0]!.start)
    expect(got[0]!.start).toBeGreaterThanOrEqual(0)
    expect(got[0]!.end).toBeLessThanOrEqual(19)
    // Clearing is a NEW gesture — down, up, click — exactly what a real
    // browser produces. A bare click would be eaten by the drag's own click
    // suppression, which is the correct behavior for the drag's trailing
    // click and is re-armed by the next mousedown.
    const rr = canvas.getBoundingClientRect()
    const at = { clientX: rr.left + 50, clientY: rr.top + 50, bubbles: true }
    canvas.dispatchEvent(new MouseEvent('mousedown', at))
    canvas.dispatchEvent(new MouseEvent('mouseup', at))
    canvas.dispatchEvent(new MouseEvent('click', at))
    await flush()
    expect(got).toHaveLength(2)
    expect(got[1]).toBeNull()
  })

  it('a drag never fires onSelect (click suppression)', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: rows, marks: [bars((d: Row) => d.v)],
      dataZoom: true, animate: false, width: 400, height: 200,
      onSelect: (i: number) => picked.push(i),
    }),
    )
    const canvas = canvasOf(container)
    await flush()
    drag(canvas, 100, 300)
    canvas.dispatchEvent(new MouseEvent('click', { clientX: canvas.getBoundingClientRect().left + 300, clientY: canvas.getBoundingClientRect().top + 150, bubbles: true }))
    await flush()
    expect(picked).toHaveLength(0)
  })

  it('onSelect reports GLOBAL indices under zoom', async () => {
    const picked: number[] = []
    const data = signal(rows)
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
      data: () => data(), marks: [bars((d: Row) => d.v)],
      dataZoom: true, animate: false, width: 400, height: 200,
      onSelect: (i: number) => picked.push(i),
    }),
    )
    const canvas = canvasOf(container)
    await flush()
    // Zoom hard into the RIGHT half repeatedly, then click the middle bar.
    for (let i = 0; i < 6; i++) wheelAt(canvas, 380, -1)
    await flush()
    const r = canvas.getBoundingClientRect()
    // y = 170 sits INSIDE the plot (the bottom gutter starts near y = 179 on
    // a 200px chart — a 180px click lands in the axis-label strip).
    canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + 250, clientY: r.top + 170, bubbles: true }))
    await flush()
    expect(picked).toHaveLength(1)
    // The visible slice sits deep in the right half — a LOCAL index would be
    // small; the GLOBAL one cannot be.
    expect(picked[0]!).toBeGreaterThan(9)
  })
})
