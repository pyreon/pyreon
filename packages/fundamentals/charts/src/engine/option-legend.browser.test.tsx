/** The option legend on `<OptionChart>`, in real Chromium: a click toggles the series, `legend.selected` starts it off. */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const option = (legend: Record<string, unknown>): EChartsOption => ({
  animation: false,
  // Pinned to the left so the first entry is at a known point.
  legend: { left: 'left', top: 'top', ...legend },
  xAxis: { type: 'category', data: ['a'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [
    { type: 'bar', name: 'Red', data: [8], itemStyle: { color: '#ff0000' } },
    { type: 'bar', name: 'Blue', data: [8], itemStyle: { color: '#0000ff' } },
  ],
})
const count = (c: HTMLCanvasElement, rgb: [number, number, number]): number => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let n = 0
  // Legend swatches are small; count only a sizeable fill so bars dominate.
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - rgb[0]) < 8 && Math.abs(d[i + 1]! - rgb[1]) < 8 && Math.abs(d[i + 2]! - rgb[2]) < 8) n++
  return n
}
/** Click the first legend entry: the legend's first row sits at the top-left, inside its 5px padding. */
const clickFirstEntry = (c: HTMLCanvasElement): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }))
}

describe('<OptionChart> legend (real browser)', () => {
  it('a click on an entry hides its series, reports the change, and a second click shows it again', async () => {
    const changes: Record<string, boolean>[] = []
    const { container } = mountInBrowser(h(OptionChart, { option: option({}), width: 400, height: 260, onLegendSelectChange: (s: Record<string, boolean>) => changes.push(s) }))
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    const before = count(c, [255, 0, 0])
    expect(before).toBeGreaterThan(500)
    clickFirstEntry(c)
    await flush()
    expect(count(c, [255, 0, 0])).toBeLessThan(before / 4)
    expect(changes).toEqual([{ Red: false, Blue: true }])
    clickFirstEntry(c)
    await flush()
    expect(count(c, [255, 0, 0])).toBe(before)
  })

  it('legend.selected starts a series off', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: option({ selected: { Red: false } }), width: 400, height: 260 }))
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    expect(count(c, [255, 0, 0])).toBeLessThan(200)
    expect(count(c, [0, 0, 255])).toBeGreaterThan(500)
  })

  it('selectedMode false: a click changes nothing', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: option({ selectedMode: false }), width: 400, height: 260 }))
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    const before = count(c, [255, 0, 0])
    clickFirstEntry(c)
    await flush()
    expect(count(c, [255, 0, 0])).toBe(before)
  })
})
