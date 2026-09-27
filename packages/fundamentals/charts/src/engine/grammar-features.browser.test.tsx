// `<Chart>` hands its plot host only the interaction features its children
// ask for (`plot-features.ts`). These specs prove the features still WORK
// through the grammar when asked for, and are absent when not: the other
// half of the tree-shaking lock in `plot-treeshake.test.ts`.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Bar, Chart, Line, Toolbox, Zoom } from '../index'

interface Row { m: string; v: number }
const DATA: Row[] = Array.from({ length: 12 }, (_, i) => ({ m: `m${i}`, v: (i % 5) + 2 }))

const click = (c: HTMLCanvasElement, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}
/** Inked pixels in the bottom `frac` of the canvas — where a navigator strip is drawn. */
const bottomInk = (c: HTMLCanvasElement, frac: number): number => {
  const ctx = c.getContext('2d')!
  const y0 = Math.floor(c.height * (1 - frac))
  const { data } = ctx.getImageData(0, y0, c.width, c.height - y0)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('<Chart> interaction features come from its children', () => {
  it('<Toolbox saveAsImage> saves the frame as an SVG through the grammar', async () => {
    const got: string[] = []
    const { container, unmount } = mountInBrowser(
      h(Chart<Row>, { data: DATA, x: 'm', width: 400, height: 200, animate: false, title: 'T', onSaveImage: (s: string) => got.push(s) }, h(Bar<Row>, { y: 'v' }), h(Toolbox, { saveAsImage: true })),
    )
    await flush()
    click(container.querySelector('canvas')!, 392, 9)
    await flush()
    expect(got).toHaveLength(1)
    expect(got[0]).toContain('<svg')
    unmount()
  })

  it('without <Toolbox>, the same click draws nothing and saves nothing', async () => {
    const got: string[] = []
    const { container, unmount } = mountInBrowser(
      h(Chart<Row>, { data: DATA, x: 'm', width: 400, height: 200, animate: false, title: 'T', onSaveImage: (s: string) => got.push(s) }, h(Bar<Row>, { y: 'v' })),
    )
    await flush()
    click(container.querySelector('canvas')!, 392, 9)
    await flush()
    expect(got).toHaveLength(0)
    unmount()
  })

  it('<Zoom navigator> draws the navigator strip under the plot through the grammar', async () => {
    const plain = mountInBrowser(h(Chart<Row>, { data: DATA, x: 'm', width: 400, height: 220, animate: false, showGrid: false }, h(Line<Row>, { y: 'v' })))
    await flush()
    const withNav = mountInBrowser(h(Chart<Row>, { data: DATA, x: 'm', width: 400, height: 220, animate: false, showGrid: false }, h(Line<Row>, { y: 'v' }), h(Zoom, { navigator: true })))
    await flush()
    const a = plain.container.querySelector('canvas')!
    const b = withNav.container.querySelector('canvas')!
    // The navigator is a filled strip BELOW the plot (36px of 220): with it
    // the bottom band is mostly ink; without the feature the space is not
    // even reserved, and the band holds only axis labels.
    const frac = 36 / 220
    expect(bottomInk(b, frac)).toBeGreaterThan(bottomInk(a, frac) * 3)
    plain.unmount()
    withNav.unmount()
  })
})
