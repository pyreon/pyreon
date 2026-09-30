// `<PlotChart by>` morphs geometry by key, driven frame by frame here through
// a stepped requestAnimationFrame. Midway through a sliding window the
// survivors are BETWEEN slots — over the gap between two bars — which only a
// sliding morph produces; the unkeyed control never paints there.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { bars } from './marks'
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

async function run(by: boolean): Promise<{ midGap: boolean; startCol0: boolean }> {
  const rows = signal<Row[]>([{ id: 'a', v: 4 }, { id: 'b', v: 8 }, { id: 'c', v: 6 }])
  const { container, unmount } = mountInBrowser(
    h(PlotChart<Row>, {
      data: () => rows(), x: (d: Row) => d.id, ...(by ? { by: (d: Row) => d.id } : {}),
      marks: [bars((d: Row) => d.v, { color: '#2060ff' })],
      yDomain: { min: 0, max: 10 }, width: W, height: H, animate: false, showGrid: false, updateDuration: 1000,
    }),
  )
  await flush()
  const c = container.querySelector('canvas')!
  // The plot the chart lays out, to find the gap between slot 0 and slot 1.
  const l = layoutChart({ width: W, height: H, series: [{ kind: 'bars', values: [8, 6, 9], color: '', label: '', width: 2, radius: 3 }], categories: ['b', 'c', 'd'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: false, yDomain: { min: 0, max: 10 } }, (t, s) => t.length * s * 0.6)
  const band = l.plot.w / 3
  const gapX = l.plot.x + band
  const lowY = l.plot.y + l.plot.h - 3
  stepRaf()
  rows.set([{ id: 'b', v: 8 }, { id: 'c', v: 6 }, { id: 'd', v: 9 }])
  // Not flush(): it waits on the requestAnimationFrame this test now steps.
  await new Promise((r) => setTimeout(r, 20))
  frameAt(0)
  frameAt(0)
  const startCol0 = blueAt(c, l.plot.x + band / 2, lowY)
  // ~200ms of 1000 is ~50% after the ease-out: survivors half way between slots.
  frameAt(200)
  const midGap = blueAt(c, gapX, lowY)
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
