// Rounded bars in a REAL browser, asserted on PIXELS.
//
// The draw list is checked next door; what only a browser can answer is
// whether the 2D context actually rounded the corner — a `roundRect`-free
// arc trace is exactly the kind of thing that serializes correctly and paints
// square. The assertion is a pixel read of the bar's top-left corner against
// its own centre.

import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { PlotChart } from './Chart'
import type { PlotChartProps } from './Chart'
import { bars } from './marks'

interface Row {
  k: string
  v: number
}
const DATA: Row[] = [{ k: 'only', v: 10 }]
const RED = '#ff0000'

const chartProps = (over: Partial<PlotChartProps<Row>> = {}): PlotChartProps<Row> => ({
  data: DATA,
  marks: [bars((d: Row) => d.v, { color: RED })],
  x: (d: Row) => d.k,
  width: 200,
  height: 160,
  animate: false,
  showXAxis: false,
  showYAxis: false,
  showGrid: false,
  ...over,
})

/** The alpha of one CSS pixel, read out of the backing store through the DPR transform. */
const alphaAt = (canvas: HTMLCanvasElement, x: number, y: number): number => {
  const ctx = canvas.getContext('2d')!
  const dpr = canvas.width / Number.parseFloat(canvas.style.width)
  const px = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
  return px[3]!
}

/** The bar's box in CSS pixels — the only red rect in the frame. */
const barBox = (canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } => {
  const ctx = canvas.getContext('2d')!
  const dpr = canvas.width / Number.parseFloat(canvas.style.width)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      if (img[i]! > 200 && img[i + 1]! < 60 && img[i + 2]! < 60 && img[i + 3]! > 200) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  return { x: minX / dpr, y: minY / dpr, w: (maxX - minX + 1) / dpr, h: (maxY - minY + 1) / dpr }
}

describe('rounded bars — pixels', () => {
  // The sample sits 3px in from the corner against a 16px radius: the pixel's
  // CENTRE is then 17.7px from the arc centre, comfortably outside it, so the
  // assertion is not reading antialiasing. (At r=8 the same +2 sample lands
  // 7.8px out — INSIDE the arc — which is how this test first failed.)
  it('a square bar paints its top-left corner; a [16,16,0,0] bar leaves it empty and keeps the bottom-left', async () => {
    const square = mountInBrowser(<PlotChart<Row> {...chartProps()} />)
    await flush()
    const sc = query(square.container, 'canvas')
    const box = barBox(sc)
    expect(box.w).toBeGreaterThan(20)
    expect(box.h).toBeGreaterThan(40)
    // 2px inside the corner: solidly inside a square bar.
    expect(alphaAt(sc, box.x + 3, box.y + 3)).toBeGreaterThan(200)
    square.unmount()

    const rounded = mountInBrowser(
      <PlotChart<Row> {...chartProps({ marks: [bars((d: Row) => d.v, { color: RED, borderRadius: [16, 16, 0, 0] })] })} />,
    )
    await flush()
    const rc = query(rounded.container, 'canvas')
    const rbox = barBox(rc)
    // The bar occupies the same box — rounding removes corners, not width.
    expect(Math.abs(rbox.w - box.w)).toBeLessThanOrEqual(2)
    expect(Math.abs(rbox.x - box.x)).toBeLessThanOrEqual(2)
    // ...but the top corners are gone,
    expect(alphaAt(rc, rbox.x + 3, rbox.y + 3)).toBeLessThan(60)
    expect(alphaAt(rc, rbox.x + rbox.w - 4, rbox.y + 3)).toBeLessThan(60)
    // ...the middle of the top edge is still painted,
    expect(alphaAt(rc, rbox.x + rbox.w / 2, rbox.y + 3)).toBeGreaterThan(200)
    // ...and the BOTTOM corners are square, because the radii said so.
    expect(alphaAt(rc, rbox.x + 3, rbox.y + rbox.h - 4)).toBeGreaterThan(200)
    expect(alphaAt(rc, rbox.x + rbox.w - 4, rbox.y + rbox.h - 4)).toBeGreaterThan(200)
    rounded.unmount()
  })

  it('a radius larger than the bar clamps instead of overflowing it', async () => {
    const { container, unmount } = mountInBrowser(
      <PlotChart<Row> {...chartProps({ marks: [bars((d: Row) => d.v, { color: RED, borderRadius: 999 })] })} />,
    )
    await flush()
    const c = query(container, 'canvas')
    const box = barBox(c)
    // A fully-clamped rect is a stadium: its horizontal mid-line still spans
    // the whole width, and its centre is painted.
    expect(box.w).toBeGreaterThan(20)
    expect(alphaAt(c, box.x + box.w / 2, box.y + box.h / 2)).toBeGreaterThan(200)
    expect(alphaAt(c, box.x + 1, box.y + box.h / 2)).toBeGreaterThan(120)
    unmount()
  })
})
