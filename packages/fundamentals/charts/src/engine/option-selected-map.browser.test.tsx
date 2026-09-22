/** ECharts' `selectedMap` on `<OptionChart>`: the named items start selected, painted in their `select` style. */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const option = (extra: Record<string, unknown>): EChartsOption => ({
  animation: false,
  xAxis: { type: 'category', data: ['a', 'b', 'c'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [{ type: 'bar', data: [8, 8, 8], itemStyle: { color: '#0000ff' }, selectedMode: 'multiple', select: { itemStyle: { color: '#ff0000' } }, ...extra }],
})
const pixel = (c: HTMLCanvasElement, i: number): number[] => {
  const w = c.getBoundingClientRect().width
  const dpr = c.width / w
  // ECharts' default grid: the plot runs from 15% to 90% of the width and ends 80 above the bottom.
  const x = w * 0.15 + ((w * 0.75) / 3) * (i + 0.5)
  return Array.from(c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(172 * dpr), 1, 1).data.slice(0, 3))
}

describe('<OptionChart> selectedMap (real browser)', () => {
  it('the named item starts selected; the others keep their colour', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: option({ selectedMap: { b: true } }), width: 400, height: 260 }))
    await flush()
    const c = query<HTMLCanvasElement>(container, 'canvas')
    expect(pixel(c, 1)).toEqual([255, 0, 0])
    expect(pixel(c, 0)).toEqual([0, 0, 255])
  })
  it('without selectedMap nothing starts selected', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: option({}), width: 400, height: 260 }))
    await flush()
    expect(pixel(query<HTMLCanvasElement>(container, 'canvas'), 1)).toEqual([0, 0, 255])
  })
})
