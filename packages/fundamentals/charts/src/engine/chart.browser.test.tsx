import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { bars, line } from './marks'

interface Row {
  month: string
  revenue: number
  target: number
}

const DATA: Row[] = [
  { month: 'Jan', revenue: 100, target: 120 },
  { month: 'Feb', revenue: 180, target: 130 },
  { month: 'Mar', revenue: 140, target: 140 },
  { month: 'Apr', revenue: 220, target: 150 },
]

/** Count non-transparent pixels — proof that something was actually painted. */
function inkedPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('PlotChart renders real pixels in a real browser', () => {
  it('paints a bar chart', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        x: (d) => d.month,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    // A canvas that exists but was never drawn to is the failure this guards:
    // every structural assertion passes against a blank one.
    expect(inkedPixels(canvas!)).toBeGreaterThan(500)
  })

  it('sizes the backing store for the device pixel ratio', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: [bars((d) => d.revenue)], width: 400, height: 200 }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const dpr = globalThis.devicePixelRatio ?? 1
    expect(canvas.width).toBe(Math.round(400 * dpr))
    expect(canvas.style.width).toBe('400px')
  })

  /**
   * The load-bearing reactivity test. Comparing pixel COUNTS would pass on a
   * chart that never repainted whenever the two datasets happened to ink a
   * similar area, so this compares the actual image bytes.
   */
  it('repaints when the data signal changes', async () => {
    const rows = signal<Row[]>(DATA)
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: () => rows(),
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const before = canvas.toDataURL()

    rows.set([
      { month: 'Jan', revenue: 20, target: 0 },
      { month: 'Feb', revenue: 30, target: 0 },
      { month: 'Mar', revenue: 250, target: 0 },
      { month: 'Apr', revenue: 40, target: 0 },
    ])
    await flush()
    expect(canvas.toDataURL()).not.toBe(before)
  })

  it('paints more ink for a line drawn over bars than for bars alone', async () => {
    const one = mountInBrowser(() =>
      PlotChart<Row>({ data: DATA, marks: [bars((d) => d.revenue)], width: 400, height: 200 }),
    )
    await flush()
    const barsOnly = inkedPixels(one.container.querySelector('canvas')!)

    const two = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue), line((d) => d.target, { color: '#b45309' })],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    expect(inkedPixels(two.container.querySelector('canvas')!)).toBeGreaterThan(barsOnly)
  })

  it('reports the bar index under a click', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        onSelect: (i) => picked.push(i),
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const box = canvas.getBoundingClientRect()
    // Inside the THIRD band and above the axis gutter. y must clear the bottom
    // gutter the x labels occupy: clicking at y=190 of a 200px chart lands
    // below the plot and correctly reports a miss, which is what the first
    // version of this test actually asserted.
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: box.left + 264,
        clientY: box.top + 150,
      }),
    )
    await flush()
    expect(picked).toEqual([2])
  })

  it('reports a miss for a click outside every bar', async () => {
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: DATA,
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        onSelect: (i) => picked.push(i),
      }),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    const box = canvas.getBoundingClientRect()
    // Top-left: inside the canvas, above every bar and left of the plot.
    canvas.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: box.left + 2, clientY: box.top + 2 }),
    )
    await flush()
    expect(picked).toEqual([-1])
  })

  it('renders an empty dataset without throwing or inking', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: [],
        marks: [bars((d) => d.revenue)],
        width: 400,
        height: 200,
        showGrid: false,
        showXAxis: false,
        showYAxis: false,
      }),
    )
    await flush()
    expect(inkedPixels(container.querySelector('canvas')!)).toBe(0)
  })
})
