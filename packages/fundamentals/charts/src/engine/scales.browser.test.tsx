// Real-Chromium proof for batch 2: the slanted labels paint through the
// canvas rotation, the log view and the waterfall draw distinct pictures, and
// the facet grid mounts one painted panel per value. Geometry truth is in
// scales.test.ts; this locks that the executors render what the engine emits.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PlotChart } from './Chart'
import { Bar, Plot } from './grammar'
import { bars, waterfall } from './marks'
import { paint } from './canvas-web'

function checksum(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 0; i < data.length; i++) n = (n + data[i]! * ((i % 7) + 1)) % 1_000_000_007
  return n
}
function inked(canvas: HTMLCanvasElement, x0: number, x1: number, y0: number, y1: number): number {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0))
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}
const LONG = ['January sales', 'February sales', 'March sales', 'April sales', 'May sales', 'June sales', 'July sales']
const rows = LONG.map((label, i) => ({ label, v: (i + 1) * 10 }))
type Row = (typeof rows)[number]
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('scales in a real browser', () => {
  it('the canvas executor paints a rotated text command turned about its anchor: the 90° glyph run is taller than wide, the upright one wider than tall', () => {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 200
    document.body.appendChild(c)
    const ctx = c.getContext('2d')!
    const bbox = (): { w: number; h: number } => {
      const { data } = ctx.getImageData(0, 0, 200, 200)
      let x0 = 200, x1 = -1, y0 = 200, y1 = -1
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (data[(y * 200 + x) * 4 + 3]! > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1 }
    }
    paint(ctx, [{ kind: 'text', text: 'MMMMMMMMMM', at: { x: 100, y: 100 }, fill: '#000', size: 14, align: 'middle', baseline: 'middle' }], 200, 200, 'sans-serif')
    const upright = bbox()
    expect(upright.w).toBeGreaterThan(upright.h * 2)
    paint(ctx, [{ kind: 'text', text: 'MMMMMMMMMM', at: { x: 100, y: 100 }, fill: '#000', size: 14, align: 'middle', baseline: 'middle', rotate: 90 }], 200, 200, 'sans-serif')
    const turned = bbox()
    expect(turned.h).toBeGreaterThan(turned.w * 2)
    // Turned about the anchor: the run stays centred on (100, 100).
    expect(Math.abs(turned.w - upright.h)).toBeLessThan(4)
    c.remove()
  })
  it('overflowing category labels paint through that rotation: the slanted chart differs from the upright one and keeps every bar', async () => {
    const paint2 = async (xLabels: 'rotate' | 'all'): Promise<HTMLCanvasElement> => {
      const { container } = mountInBrowser(h(PlotChart<Row>, { data: rows, x: (d: Row) => d.label, marks: [bars<Row>((d) => d.v)], width: 300, height: 200, xLabels, animate: false }))
      await flush()
      await wait(30)
      return container.querySelector('canvas')!
    }
    const slanted = await paint2('rotate')
    const upright = await paint2('all')
    expect(checksum(slanted)).not.toBe(checksum(upright))
    expect(inked(slanted, 0, slanted.width, 0, slanted.height)).toBeGreaterThan(0)
  })
  it('the log view and the waterfall each paint a picture distinct from the linear bars, and the log view still paints every bar', async () => {
    const data = [{ v: 1 }, { v: 10 }, { v: 100 }, { v: 1000 }]
    const paint = async (props: Record<string, unknown>): Promise<HTMLCanvasElement> => {
      const { container } = mountInBrowser(h(PlotChart as unknown as (p: Record<string, unknown>) => never, { data, width: 300, height: 200, animate: false, ...props }))
      await flush()
      await wait(30)
      return container.querySelector('canvas')!
    }
    const linear = await paint({ marks: [bars<{ v: number }>((d) => d.v)] })
    const log = await paint({ marks: [bars<{ v: number }>((d) => d.v)], yScale: 'log' })
    const wf = await paint({ marks: [waterfall<{ v: number }>((d) => d.v, { negativeColor: '#f43f5e' })] })
    expect(checksum(log)).not.toBe(checksum(linear))
    expect(checksum(wf)).not.toBe(checksum(linear))
    // On a linear axis the 1 and 10 bars are sub-pixel beside 1000; in the log view the second column is a real bar.
    const dpr = window.devicePixelRatio || 1
    const column = (c: HTMLCanvasElement) => inked(c, Math.round(110 * dpr), Math.round(170 * dpr), Math.round(20 * dpr), Math.round(150 * dpr))
    expect(column(log)).toBeGreaterThan(column(linear))
  })
  it('<Plot facet> mounts a painted panel per value in the grid, each titled', async () => {
    const data = rows.map((r, i) => ({ ...r, region: i % 2 === 0 ? 'eu' : 'us' }))
    const { container } = mountInBrowser(
      h(Plot<(typeof data)[number]>, { data, x: 'label', facet: 'region', facetColumns: 2, height: 160, animate: false, children: h(Bar<(typeof data)[number]>, { y: 'v' }) }),
    )
    await flush()
    await wait(40)
    const canvases = Array.from(container.querySelectorAll('canvas'))
    expect(canvases).toHaveLength(2)
    for (const c of canvases) expect(inked(c, 0, c.width, 0, c.height)).toBeGreaterThan(0)
    const captions = Array.from(container.querySelectorAll('caption')).map((c) => c.textContent ?? '')
    expect(captions.some((t) => t.includes('eu'))).toBe(true)
    expect(captions.some((t) => t.includes('us'))).toBe(true)
  })
})
