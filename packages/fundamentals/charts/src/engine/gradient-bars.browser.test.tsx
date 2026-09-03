// Gradient fills in a REAL browser, asserted on PIXELS.
//
// A `createLinearGradient` that is built but never assigned, or built with the
// wrong two points, still serializes and still paints — just in one flat
// colour. The only thing that settles it is reading two pixels at different
// heights of the same bar and finding them DIFFERENT.

import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import type { PlotChartProps } from './Chart'
import { bars } from './marks'

interface Row {
  k: string
  v: number
}
const DATA: Row[] = [{ k: 'only', v: 10 }]
const TOP = '#ff0000'
const BOTTOM = '#0000ff'

const chartProps = (over: Partial<PlotChartProps<Row>> = {}): PlotChartProps<Row> => ({
  data: DATA,
  marks: [bars((d: Row) => d.v, { color: TOP })],
  x: (d: Row) => d.k,
  width: 200,
  height: 160,
  animate: false,
  showXAxis: false,
  showYAxis: false,
  showGrid: false,
  ...over,
})

const rgbaAt = (canvas: HTMLCanvasElement, x: number, y: number): number[] => {
  const ctx = canvas.getContext('2d')!
  const dpr = canvas.width / Number.parseFloat(canvas.style.width)
  const px = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return [px[0]!, px[1]!, px[2]!, px[3]!]
}

/** The painted box — any pixel with real alpha. */
const paintedBox = (canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } => {
  const ctx = canvas.getContext('2d')!
  const dpr = canvas.width / Number.parseFloat(canvas.style.width)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (img[(y * canvas.width + x) * 4 + 3]! > 200) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  return { x: minX / dpr, y: minY / dpr, w: (maxX - minX + 1) / dpr, h: (maxY - minY + 1) / dpr }
}

const GRADIENT = {
  stops: [
    { offset: 0, color: TOP },
    { offset: 1, color: BOTTOM },
  ],
}

describe('gradient fills — pixels', () => {
  it('a solid bar is one colour top to bottom; a gradient bar is red at the top and blue at the bottom', async () => {
    const solid = mountInBrowser(<PlotChart<Row> {...chartProps()} />)
    await flush()
    const sc = solid.container.querySelector('canvas') as HTMLCanvasElement
    const sbox = paintedBox(sc)
    const sTop = rgbaAt(sc, sbox.x + sbox.w / 2, sbox.y + 4)
    const sBottom = rgbaAt(sc, sbox.x + sbox.w / 2, sbox.y + sbox.h - 5)
    expect(sTop[0]).toBeGreaterThan(200)
    expect(sBottom[0]).toBeGreaterThan(200)
    expect(Math.abs(sTop[2]! - sBottom[2]!)).toBeLessThan(10)
    solid.unmount()

    const grad = mountInBrowser(
      <PlotChart<Row> {...chartProps({ marks: [bars((d: Row) => d.v, { color: TOP, gradient: GRADIENT })] })} />,
    )
    await flush()
    const gc = grad.container.querySelector('canvas') as HTMLCanvasElement
    const gbox = paintedBox(gc)
    const gTop = rgbaAt(gc, gbox.x + gbox.w / 2, gbox.y + 4)
    const gBottom = rgbaAt(gc, gbox.x + gbox.w / 2, gbox.y + gbox.h - 5)
    // Red at the top, blue at the bottom — and the two ends differ, which is
    // the whole claim.
    expect(gTop[0]).toBeGreaterThan(150)
    expect(gTop[2]).toBeLessThan(120)
    expect(gBottom[2]).toBeGreaterThan(150)
    expect(gBottom[0]).toBeLessThan(120)
    grad.unmount()
  })

  it("'horizontal' ramps across instead of down", async () => {
    const { container, unmount } = mountInBrowser(
      <PlotChart<Row>
        {...chartProps({
          marks: [bars((d: Row) => d.v, { color: TOP, gradient: { ...GRADIENT, direction: 'horizontal' } })],
        })}
      />,
    )
    await flush()
    const c = container.querySelector('canvas') as HTMLCanvasElement
    const box = paintedBox(c)
    const left = rgbaAt(c, box.x + 3, box.y + box.h / 2)
    const right = rgbaAt(c, box.x + box.w - 4, box.y + box.h / 2)
    expect(left[0]! - right[0]!).toBeGreaterThan(60)
    expect(right[2]! - left[2]!).toBeGreaterThan(60)
    // ...and vertically it is now FLAT, which the vertical case is not.
    const top = rgbaAt(c, box.x + box.w / 2, box.y + 4)
    const bottom = rgbaAt(c, box.x + box.w / 2, box.y + box.h - 5)
    expect(Math.abs(top[0]! - bottom[0]!)).toBeLessThan(30)
    unmount()
  })
})
