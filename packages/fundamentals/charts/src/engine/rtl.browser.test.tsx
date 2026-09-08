// RTL through the LIVE host, in real Chromium.
//
// The unit test proves the mirror; this proves the two seams that use it are
// consistent with each other. A chart that PAINTS mirrored but REPORTS the
// unmirrored index is worse than no RTL at all — every click would name the
// wrong bar, silently, and only in one locale.

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { bars } from './marks'

const ROWS = [3, 9, 5, 7]
const W = 400
const H = 200

function paintedColumns(canvas: HTMLCanvasElement): number[] {
  // Column indices (in backing-store pixels) that have any painted pixel
  // below the axis line — i.e. where the bars are.
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const cols: number[] = []
  for (let x = 0; x < canvas.width; x++) {
    let hit = false
    for (let y = 0; y < canvas.height; y++) {
      if (data[(y * canvas.width + x) * 4 + 3] !== 0) { hit = true; break }
    }
    if (hit) cols.push(x)
  }
  return cols
}

function clickAt(canvas: HTMLCanvasElement, x: number, y: number): void {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('RTL through the canvas host', () => {
  const mount = async (rtl: boolean, onSelect?: (i: number) => void) => {
    const { container } = mountInBrowser(
      h(PlotChart, {
        data: ROWS,
        x: (_d: number, i: number) => `c${i}`,
        marks: [bars((d: number) => d)],
        width: W,
        height: H,
        animate: false,
        rtl,
        ...(onSelect === undefined ? {} : { onSelect }),
      }),
    )
    await flush()
    return container.querySelector('canvas') as HTMLCanvasElement
  }

  it('paints the mirror: the value gutter swaps sides', async () => {
    // The gutter is the visible consequence of mirroring about the CANVAS
    // centreline rather than the plot's. In LTR the leftmost painted column
    // is a value label near x=0 and the right edge is padding; RTL reverses
    // which side carries the wide gutter.
    const ltr = paintedColumns(await mount(false))
    const rtl = paintedColumns(await mount(true))
    expect(ltr.length).toBeGreaterThan(0)
    expect(rtl.length).toBeGreaterThan(0)
    const dpr = (await mount(false)).width / W
    const gapLtrRight = (W * dpr) - ltr[ltr.length - 1]!
    const gapRtlLeft = rtl[0]!
    // The slim padding side moves from the right to the left.
    expect(gapRtlLeft, 'RTL should leave the slim padding on the LEFT').toBeGreaterThan(0)
    expect(Math.abs(gapRtlLeft - gapLtrRight), 'the two paddings should match — it is the same padding, mirrored').toBeLessThan(3 * dpr)
  })

  it('reports the SAME index for the same bar — the pointer seam mirrors back', async () => {
    // Click the first category's bar in each direction. In LTR it is the
    // leftmost band; in RTL it is the rightmost. Both must report 0.
    const ltrPicks: number[] = []
    const rtlPicks: number[] = []
    const ltrCanvas = await mount(false, (i) => ltrPicks.push(i))
    const rtlCanvas = await mount(true, (i) => rtlPicks.push(i))

    // A point inside the first band, well below the top of a bar of value 3.
    const bandProbe = (fromRight: boolean): number => {
      // Bands span the plot; the gutter is on the axis side. Probe a fifth of
      // the way in from the data edge, which lands inside the first band for
      // four categories whichever way the chart reads.
      const inset = W * 0.12
      return fromRight ? W - inset : inset
    }
    clickAt(ltrCanvas, bandProbe(false), H * 0.8)
    clickAt(rtlCanvas, bandProbe(true), H * 0.8)

    expect(ltrPicks, 'LTR: the leftmost bar is category 0').toEqual([0])
    expect(rtlPicks, 'RTL: the RIGHTMOST bar is category 0 — if this reports 3, the paint mirrored and the hit test did not').toEqual([0])
  })

  it('an unmirrored pointer would report the opposite end', async () => {
    // The counterpart of the assertion above, stated so the pair pins the
    // DIRECTION and not just "some index came back": clicking the LEFT edge
    // of an RTL chart is the LAST category, not the first.
    const picks: number[] = []
    const canvas = await mount(true, (i) => picks.push(i))
    clickAt(canvas, W * 0.12, H * 0.8)
    expect(picks).toEqual([ROWS.length - 1])
  })
})
