/**
 * A single family chart sits where ECharts places it in the whole chart: a
 * pie at its `center` with a 75% radius by default, a funnel inside its
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
  it('a pie takes a 75% radius at the centre by default', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: pie(), width: 400, height: 200 }))
    await flush()
    const [a, b] = inkedSpan(query(container, 'canvas'), 100)
    // 75% of half the shorter side (100) is 75: the pie spans 125..275.
    expect(a).toBeGreaterThan(120)
    expect(a).toBeLessThan(130)
    expect(b).toBeGreaterThan(270)
    expect(b).toBeLessThan(280)
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
