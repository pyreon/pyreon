import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { bars } from './marks'
import { PlotChart } from './Chart'

interface Row { v: number }
const DATA: Row[] = [{ v: 3 }, { v: 9 }, { v: 6 }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const click = (c: HTMLCanvasElement, x: number, y: number) => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('toolbox (real browser)', () => {
  it('saveAsImage hands the current frame to onSaveImage as an SVG', async () => {
    const got: string[] = []
    const { container } = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, title: 'T', toolbox: { saveAsImage: true }, onSaveImage: (s) => got.push(s) }))
    await flush()
    const c = container.querySelector('canvas')!
    click(c, 392, 9)
    await flush()
    expect(got).toHaveLength(1)
    expect(got[0]).toContain('<svg')
    expect(got[0]).toContain('<rect')
  })

  it('magicType line switches bars to a line and restore brings the bars back', async () => {
    const { container } = mountInBrowser(() => PlotChart<Row>({ data: DATA, marks: [bars((d) => d.v)], width: 400, height: 200, animate: false, toolbox: { magicType: ['line'], restore: true } }))
    await flush()
    const c = container.querySelector('canvas')!
    const barsInk = inked(c)
    click(c, 392 - 25, 9)
    await flush()
    const lineInk = inked(c)
    expect(lineInk).toBeLessThan(barsInk)
    click(c, 392, 9)
    await flush()
    expect(inked(c)).toBe(barsInk)
  })
})
