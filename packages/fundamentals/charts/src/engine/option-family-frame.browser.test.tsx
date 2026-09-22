/**
 * A single family chart sits where ECharts places it in the whole chart: a
 * pie at its `center` with a 50% radius by default, a funnel inside its
 * margins. Before, the family host filled the box.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

/** The inked columns of a canvas row, in CSS pixels: [first, last]. */
const inkedSpan = (c: HTMLCanvasElement, y: number): [number, number] => {
  const dpr = c.width / c.getBoundingClientRect().width
  const d = c.getContext('2d')!.getImageData(0, Math.round(y * dpr), c.width, 1).data
  let first = -1
  let last = -1
  for (let x = 0; x < c.width; x++) {
    if (d[x * 4 + 3]! > 0 && (d[x * 4]! < 240 || d[x * 4 + 1]! < 240 || d[x * 4 + 2]! < 240)) {
      if (first < 0) first = x
      last = x
    }
  }
  return [first / dpr, last / dpr]
}
const pie = (extra: Record<string, unknown> = {}): EChartsOption => ({ animation: false, series: [{ type: 'pie', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }], ...extra }] })

describe('<OptionChart> single family placement (real browser)', () => {
  it('a pie takes a 50% radius at the centre by default', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: pie(), width: 400, height: 200 }))
    await flush()
    const [a, b] = inkedSpan(query(container, 'canvas'), 100)
    // ECharts' radius [0, '50%']: half of half the shorter side (100) is 50, so the pie spans 150..250.
    expect(a).toBeGreaterThan(145)
    expect(a).toBeLessThan(155)
    expect(b).toBeGreaterThan(245)
    expect(b).toBeLessThan(255)
  })
  it('names each slice outside, on a guide line, as ECharts does', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: pie(), width: 400, height: 200 }))
    await flush()
    const c = query(container, 'canvas')
    // Slice a's label row (its middle points up-right): ink runs past the pie's right edge, out to the text.
    const [, right] = inkedSpan(c, 100 - 0.5 * 65)
    expect(right).toBeGreaterThan(290)
    // Slice b's (down-left): ink runs out past the pie's left edge.
    const [left] = inkedSpan(c, 100 + 0.5 * 65)
    expect(left).toBeLessThan(120)
  })
  it('center and radius move and size it', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: pie({ center: ['25%', '50%'], radius: 40 }), width: 400, height: 200 }))
    await flush()
    const [a, b] = inkedSpan(query(container, 'canvas'), 100)
    expect(a).toBeGreaterThan(55)
    expect(a).toBeLessThan(65)
    expect(b).toBeGreaterThan(135)
    expect(b).toBeLessThan(145)
  })
})
