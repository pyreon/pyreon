// `<PlotChart by>` morphs geometry by key, driven frame by frame here through
// a stepped requestAnimationFrame. Midway through a sliding window the
// survivors are BETWEEN slots — over the gap between two bars — which only a
// sliding morph produces; the unkeyed control never paints there.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { bars, groupedBars, stackedBars } from './marks'
import type { Mark } from './marks'
import { defaultTheme, layoutChart } from './render'

interface Row { id: string; v: number }
const W = 300
const H = 200

const realRaf = globalThis.requestAnimationFrame
let queue: FrameRequestCallback[] = []
function stepRaf(): void {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { queue.push(cb); return queue.length }) as typeof requestAnimationFrame
}
function frameAt(ms: number): void {
  const q = queue
  queue = []
  for (const cb of q) cb(ms)
}
afterEach(() => { globalThis.requestAnimationFrame = realRaf; queue = [] })

const blueAt = (c: HTMLCanvasElement, x: number, y: number): boolean => {
  const dpr = c.width / W
  const d = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return d[2]! > 150 && d[0]! < 120
}

type Layout = 'bars' | 'stacked' | 'grouped' | 'horizontal'

function marksFor(kind: Layout): Mark<Row>[] {
  if (kind === 'stacked') return [stackedBars((d: Row) => d.v * 0.5, { color: '#2060ff' }), stackedBars((d: Row) => d.v * 0.5, { color: '#ff3020' })]
  if (kind === 'grouped') return [groupedBars((d: Row) => d.v, { color: '#2060ff' }), groupedBars((d: Row) => d.v, { color: '#2060ff' })]
  return [bars((d: Row) => d.v, { color: '#2060ff' })]
}

async function run(by: boolean, kind: Layout = 'bars'): Promise<{ midGap: boolean; startCol0: boolean }> {
  const rows = signal<Row[]>([{ id: 'a', v: 4 }, { id: 'b', v: 8 }, { id: 'c', v: 6 }])
  const { container, unmount } = mountInBrowser(
    h(PlotChart<Row>, {
      data: () => rows(), x: (d: Row) => d.id, ...(by ? { by: (d: Row) => d.id } : {}),
      marks: marksFor(kind), ...(kind === 'horizontal' ? { horizontal: true } : {}),
      yDomain: { min: 0, max: 10 }, width: W, height: H, animate: false, showGrid: false, updateDuration: 1000,
    }),
  )
  await flush()
  const c = container.querySelector('canvas')!
  // The plot the chart lays out, to find the gap between slot 0 and slot 1.
  const horizontal = kind === 'horizontal'
  const l = layoutChart({ width: W, height: H, series: [{ kind: 'bars', values: [8, 6, 9], color: '', label: '', width: 2, radius: 3 }], categories: ['b', 'c', 'd'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: false, yDomain: { min: 0, max: 10 }, horizontal }, (t, s) => t.length * s * 0.6)
  // Sample just off the zero line, at the centre of slot 0 and at the gap between slot 0 and slot 1.
  const band = (horizontal ? l.plot.h : l.plot.w) / 3
  const slot0 = horizontal ? { x: l.plot.x + 3, y: l.plot.y + band / 2 } : { x: l.plot.x + band / 2, y: l.plot.y + l.plot.h - 3 }
  const gap = horizontal ? { x: l.plot.x + 3, y: l.plot.y + band } : { x: l.plot.x + band, y: l.plot.y + l.plot.h - 3 }
  stepRaf()
  rows.set([{ id: 'b', v: 8 }, { id: 'c', v: 6 }, { id: 'd', v: 9 }])
  // Not flush(): it waits on the requestAnimationFrame this test now steps.
  await new Promise((r) => setTimeout(r, 20))
  frameAt(0)
  frameAt(0)
  const startCol0 = blueAt(c, slot0.x, slot0.y)
  // ~200ms of 1000 is ~50% after the ease-out: survivors half way between slots.
  frameAt(200)
  const midGap = blueAt(c, gap.x, gap.y)
  frameAt(2000)
  unmount()
  return { midGap, startCol0 }
}

describe('<PlotChart by> morphs geometry by key', () => {
  it('keyed: midway, a survivor is sliding across the gap between slots', async () => {
    const r = await run(true)
    expect(r.startCol0, 'the first frame still shows the old slot-0 bar').toBe(true)
    expect(r.midGap).toBe(true)
  })
  it('unkeyed (control): bars tween in place, nothing crosses the gap', async () => {
    const r = await run(false)
    expect(r.midGap).toBe(false)
  })
})

describe('<PlotChart by> morphs stacked, grouped and horizontal bars too', () => {
  for (const kind of ['stacked', 'grouped', 'horizontal'] as const) {
    it(`${kind}: midway, a survivor is sliding across the gap between slots`, async () => {
      const r = await run(true, kind)
      expect(r.startCol0, 'the first frame still shows the old slot-0 bar').toBe(true)
      expect(r.midGap).toBe(true)
    })
    it(`${kind} (control, unkeyed): nothing crosses the gap`, async () => {
      const r = await run(false, kind)
      expect(r.midGap).toBe(false)
    })
  }
})
