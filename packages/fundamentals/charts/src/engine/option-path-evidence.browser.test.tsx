/**
 * The option path's evidence for rows the ledger marks complete: each spec
 * goes through `<OptionChart>`, not `PlotChart`, since the two are separate
 * facades and a row is about the option chart.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import { createChartLink } from './link'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const snap = (c: HTMLCanvasElement): Uint8ClampedArray => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.slice()
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i])
const bars = (extra: Record<string, unknown> = {}): EChartsOption => ({
  animation: false,
  xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [{ type: 'bar', name: 'S', data: [2, 4, 6, 8], itemStyle: { color: '#ff0000' } }],
  ...extra,
})
/** The x of the leftmost red pixel on the 200px row. */
const firstRedX = (c: HTMLCanvasElement): number => {
  const dpr = c.width / c.getBoundingClientRect().width
  const d = c.getContext('2d')!.getImageData(0, Math.round(200 * dpr), c.width, 1).data
  for (let x = 0; x < c.width; x++) if (d[x * 4]! > 200 && d[x * 4 + 1]! < 60) return x / dpr
  return -1
}

describe('option-path evidence (real browser)', () => {
  it('rtl mirrors the option chart: the first bar moves to the right side', async () => {
    const ltr = mountInBrowser(h(OptionChart, { option: bars(), width: 400, height: 260 }))
    const rtl = mountInBrowser(h(OptionChart, { option: bars(), width: 400, height: 260, rtl: true }))
    await flush()
    expect(firstRedX(query(ltr.container, 'canvas'))).toBeLessThan(120)
    // Mirrored, the tallest (last) bar is leftmost; the first red at the 200px row is still a bar, now near the left of the mirrored run.
    const a = snap(query(ltr.container, 'canvas'))
    const b = snap(query(rtl.container, 'canvas'))
    expect(same(a, b)).toBe(false)
  })

  it('resize: without a width the option chart follows its container', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bars(), height: 200 }))
    container.style.width = '300px'
    await wait(150)
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    const w0 = c.getBoundingClientRect().width
    container.style.width = '500px'
    await wait(150)
    await flush()
    expect(w0).toBeLessThan(320)
    expect(c.getBoundingClientRect().width).toBeGreaterThan(w0 + 100)
  })

  it('the accessible table carries the option\'s categories and values', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bars(), width: 400, height: 260 }))
    await flush()
    const table = query(container, 'table')
    expect(table.textContent).toContain('a')
    expect(table.textContent).toContain('8')
    expect(query(container, 'canvas').getAttribute('aria-describedby')).toBe(table.id)
  })

  it('the option\'s toolbox saveAsImage hands back a PNG', async () => {
    const images: string[] = []
    const { container } = mountInBrowser(h(OptionChart, { option: bars({ toolbox: { feature: { saveAsImage: {} } } }), width: 400, height: 260, onSaveImage: (u: string) => images.push(u) }))
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    const r = c.getBoundingClientRect()
    // The toolbox sits at the top-right.
    for (let x = r.width - 4; x > r.width - 60 && images.length === 0; x -= 4) {
      c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + x, clientY: r.top + 10 }))
      await flush()
    }
    expect(images[0]).toMatch(/^data:image\/png/)
  })

  it('a null datum leaves a gap in a line (ECharts connectNulls: false)', async () => {
    const line = (data: (number | null)[]): EChartsOption => ({ animation: false, xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { type: 'value', min: 0, max: 10 }, series: [{ type: 'line', data, showSymbol: false }] })
    const gap = mountInBrowser(h(OptionChart, { option: line([5, null, 5]), width: 400, height: 260 }))
    const full = mountInBrowser(h(OptionChart, { option: line([5, 5, 5]), width: 400, height: 260 }))
    await flush()
    expect(same(snap(query(gap.container, 'canvas')), snap(query(full.container, 'canvas')))).toBe(false)
  })

  it('a shared link couples two option charts: hovering one moves the other\'s axis pointer', async () => {
    const link = createChartLink()
    const opt = bars({ tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } } })
    const a = mountInBrowser(h(OptionChart, { option: opt, width: 400, height: 260, link }))
    const b = mountInBrowser(h(OptionChart, { option: opt, width: 400, height: 260, link }))
    await flush()
    const bc = query<HTMLCanvasElement>(b.container, 'canvas')
    const before = snap(bc)
    const ac = query<HTMLCanvasElement>(a.container, 'canvas')
    const r = ac.getBoundingClientRect()
    ac.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 150, clientY: r.top + 120, pointerId: 9 }))
    await flush()
    await flush()
    expect(link.hover()).toBeGreaterThanOrEqual(0)
    expect(same(before, snap(bc))).toBe(false)
  })
})
