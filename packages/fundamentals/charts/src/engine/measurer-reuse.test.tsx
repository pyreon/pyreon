// The text measurer's memo must outlive a frame. Both hosts (the plot host in
// Chart.tsx and the shared family host in canvas-host.tsx) used to build a
// fresh measurer — with an empty memo — inside every draw, so every repaint
// (data update, tween frame, hover) re-measured every tick label, legend entry
// and preset button cold. These lock: a second draw whose strings are the same
// calls `measureText` ZERO more times.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { canvasHost } from './canvas-host'
import type { CanvasHostSpec } from './canvas-host'
import { PlotChart } from './Chart'
import { line } from './marks'
import { sharedCanvasMeasure } from './canvas-web'
import type { Rect } from './types'

let measured = 0
let ctx: Record<string | symbol, unknown>
const prevGet = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
  // happy-dom has no 2D context: a Proxy answers every method with a no-op and
  // COUNTS measureText. One context object for every canvas, as a real
  // canvas element hands back the same context on each getContext call.
  ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) =>
      k === 'measureText'
        ? (text: string) => {
            measured++
            return { width: text.length * 6 }
          }
        : k in t
          ? t[k]
          : () => undefined,
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = prevGet
})

const tick = () => new Promise((r) => setTimeout(r, 0))

function mounted(node: ReturnType<typeof h>) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(node, root)
  return () => {
    dispose()
    root.remove()
  }
}

describe('text measurer reuse across frames', () => {
  it('the plot host measures nothing on a repaint whose labels are unchanged', async () => {
    type Row = { m: string; v: number }
    const rows = signal<Row[]>([
      { m: 'Jan', v: 10 },
      { m: 'Feb', v: 20 },
      { m: 'Mar', v: 30 },
    ])
    const unmount = mounted(
      h(PlotChart<Row>, {
        data: () => rows(),
        x: (d: Row) => d.m,
        marks: [line<Row>((d) => d.v)],
        title: 'Revenue',
        width: 400,
        height: 200,
        animate: false,
      }),
    )
    await tick()
    const first = measured
    expect(first, 'the first frame measures its labels').toBeGreaterThan(0)
    // Same categories and the same y domain (max stays 30) → identical tick
    // labels, legend and title: a fresh frame, nothing new to measure.
    rows.set([
      { m: 'Jan', v: 30 },
      { m: 'Feb', v: 20 },
      { m: 'Mar', v: 10 },
    ])
    await tick()
    expect(measured - first, 'a repaint with the same strings measures nothing').toBe(0)
    unmount()
  })

  it('the shared family host measures nothing on a repaint whose labels are unchanged', async () => {
    type L = { box: Rect; n: number }
    const n = signal(3)
    const spec: CanvasHostSpec<L> = {
      props: { title: 'Family', width: 300, height: 150, animate: false },
      defaultHeight: 150,
      caption: 'Test data',
      track: () => {
        n()
      },
      layout: (box) => ({ box, n: n() }),
      render: (l, measure) => {
        // A family's render measures its own labels through the host's measurer.
        measure('label-a', 12)
        measure('label-b', 12)
        return [{ kind: 'rect', rect: { x: l.box.x, y: l.box.y, w: 10, h: 10 }, fill: '#123456' }]
      },
      legend: () => [{ label: 'series', color: '#123456' }],
      a11y: () => ({ categories: ['c'], series: [{ label: 'v', values: [1], kind: 'bars' }] }),
    }
    const unmount = mounted(canvasHost(spec))
    await tick()
    const first = measured
    expect(first).toBeGreaterThan(0)
    n.set(4) // repaint: same strings
    await tick()
    expect(measured - first, 'a repaint with the same strings measures nothing').toBe(0)
    unmount()
  })

  it('one measurer per (context, family): a new family gets its own memo', () => {
    const c = ctx as unknown as CanvasRenderingContext2D
    expect(sharedCanvasMeasure(c, 'a')).toBe(sharedCanvasMeasure(c, 'a'))
    expect(sharedCanvasMeasure(c, 'a')).not.toBe(sharedCanvasMeasure(c, 'b'))
    const before = measured
    sharedCanvasMeasure(c, 'b')('x', 10)
    sharedCanvasMeasure(c, 'b')('x', 10)
    expect(measured - before).toBe(1)
  })
})
