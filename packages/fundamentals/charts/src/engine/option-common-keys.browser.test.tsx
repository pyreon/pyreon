/**
 * ECharts' cross-cutting series keys on `<OptionChart>`, in real Chromium:
 * `cursor`, `silent`, a series' own `tooltip`, and per-datum colour.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const at = (c: HTMLCanvasElement, type: string, x: number, y: number): void => {
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 4 }))
}
const box = (container: HTMLElement): HTMLElement => query(container, '[data-pyreon-chart-tooltip]')
/** The centre of bar `i` of `n`: ECharts' default grid runs from 15% to 90% of the width. */
const barX = (c: HTMLCanvasElement, i: number, n: number): number => {
  const w = c.getBoundingClientRect().width
  return w * 0.15 + ((w * 0.75) / n) * (i + 0.5)
}
/** Low in the plot (ECharts' grid ends 80 above the bottom of a 260-high chart), on the bars. */
const LOW = 172

const bars = (extra: Record<string, unknown> = {}, option: Record<string, unknown> = {}): EChartsOption => ({
  animation: false,
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [{ type: 'bar', name: 'S', data: [8, 8, 8], ...extra }],
  ...option,
})

describe('<OptionChart> common series keys (real browser)', () => {
  it('cursor: pointer over an item by default, the series\' own cursor when set, default off the items', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bars({ cursor: 'crosshair' }), width: 400, height: 260 }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', barX(c, 1, 3), LOW)
    expect(c.style.cursor).toBe('crosshair')
    at(c, 'pointermove', 5, 5)
    expect(c.style.cursor).toBe('')
    const plain = mountInBrowser(h(OptionChart, { option: bars(), width: 400, height: 260 }))
    await flush()
    const c2 = plain.container.querySelector('canvas')!
    at(c2, 'pointermove', barX(c2, 1, 3), LOW)
    expect(c2.style.cursor).toBe('pointer')
  })

  it('a silent series is never hit: no tooltip, no cursor', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bars({ silent: true }, { tooltip: {} }), width: 400, height: 260 }))
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', barX(c, 1, 3), LOW)
    await flush()
    expect(box(container).style.display).not.toBe('block')
    expect(c.style.cursor).toBe('')
  })

  it('a series\' own tooltip formatter wins over the global one for its items', async () => {
    const { container } = mountInBrowser(
      h(OptionChart, { option: bars({ tooltip: { formatter: 'own {b}={c}' } }, { tooltip: { formatter: 'global {b}' } }), width: 400, height: 260 }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    at(c, 'pointermove', barX(c, 2, 3), LOW)
    await flush()
    expect(box(container).textContent).toBe('own c=8')
  })

  it('a datum\'s own itemStyle.color paints that bar', async () => {
    const { container } = mountInBrowser(
      h(OptionChart, { option: bars({ data: [8, { value: 8, itemStyle: { color: '#ff0000' } }, 8], itemStyle: { color: '#0000ff' } }), width: 400, height: 260 }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const dpr = c.width / c.getBoundingClientRect().width
    const px = (i: number) => Array.from(c.getContext('2d')!.getImageData(Math.round(barX(c, i, 3) * dpr), Math.round(LOW * dpr), 1, 1).data.slice(0, 3))
    expect(px(1)).toEqual([255, 0, 0])
    expect(px(0)).toEqual([0, 0, 255])
  })
})
