/**
 * Several charts in one option on `<OptionChart>`, in real Chromium: each
 * family layer mounts its own interactive host where ECharts places it, over
 * the cartesian canvas, and stays mounted across an update.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const pie = (center: [string, string], radius: string, values: number[]) => ({
  type: 'pie',
  center,
  radius,
  data: values.map((v, i) => ({ name: `s${i}`, value: v })),
})

const layers = (container: HTMLElement): HTMLElement[] => Array.from(container.querySelectorAll('[data-pyreon-chart-layer]'))

describe('<OptionChart> layers (real browser)', () => {
  it('two pies mount two hosts, each where its center and radius put it', async () => {
    const { container } = mountInBrowser(
      h(OptionChart, { option: { animation: false, series: [pie(['25%', '50%'], '40%', [1, 2]), pie(['75%', '50%'], '40%', [3, 1])] } as EChartsOption, width: 400, height: 200 }),
    )
    await flush()
    const ls = layers(container)
    expect(ls).toHaveLength(2)
    expect(ls.map((l) => [l.style.left, l.style.top, l.style.width, l.style.height])).toEqual([
      ['60px', '60px', '80px', '80px'],
      ['260px', '60px', '80px', '80px'],
    ])
    // Each layer is a real host with its own canvas, painted.
    for (const l of ls) {
      const c = l.querySelector('canvas')!
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let inked = 0
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) inked++
      expect(inked).toBeGreaterThan(100)
    }
  })

  it('a pie over a line chart: the line keeps its canvas, the pie sits in its corner', async () => {
    const option: EChartsOption = {
      animation: false,
      xAxis: { type: 'category', data: ['a', 'b', 'c'] },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: [1, 3, 2] }, pie(['85%', '25%'], '15%', [1, 1])],
    }
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 300 }))
    await flush()
    const ls = layers(container)
    expect(ls).toHaveLength(1)
    // 15% of 150 = 22.5 px radius around (340, 75).
    expect([ls[0]!.style.left, ls[0]!.style.top, ls[0]!.style.width]).toEqual(['317.5px', '52.5px', '45px'])
    // The base canvas (the line chart) is the one outside any layer, and it is painted.
    const base = Array.from(container.querySelectorAll('canvas')).find((c) => c.closest('[data-pyreon-chart-layer]') === null)!
    const d = base.getContext('2d')!.getImageData(0, 0, base.width, base.height).data
    let inked = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) inked++
    expect(inked).toBeGreaterThan(200)
  })

  it('an update keeps each layer mounted (same host element) and repaints it', async () => {
    const right = signal([3, 1])
    const { container } = mountInBrowser(
      h(OptionChart, { option: () => ({ animation: false, series: [pie(['25%', '50%'], '40%', [1, 2]), pie(['75%', '50%'], '40%', right())] }) as EChartsOption, width: 400, height: 200 }),
    )
    await flush()
    const before = layers(container)[1]!.querySelector('canvas')!
    const snap = before.getContext('2d')!.getImageData(0, 0, before.width, before.height).data.slice()
    right.set([1, 5])
    await flush()
    await flush()
    const after = layers(container)[1]!.querySelector('canvas')!
    expect(after).toBe(before)
    const now = after.getContext('2d')!.getImageData(0, 0, after.width, after.height).data
    expect(now.every((v, i) => v === snap[i])).toBe(false)
  })

  it('candlesticks on one grid and volume bars on another: the candles mount their host in grid 0, the bars paint grid 1', async () => {
    const days = ['d1', 'd2', 'd3', 'd4']
    const option: EChartsOption = {
      animation: false,
      grid: [{ left: 40, right: 10, top: 10, height: 150 }, { left: 40, right: 10, top: 200, height: 80 }],
      xAxis: [{ type: 'category', data: days, gridIndex: 0 }, { type: 'category', data: days, gridIndex: 1 }],
      yAxis: [{ gridIndex: 0, scale: true }, { gridIndex: 1 }],
      series: [
        { type: 'candlestick', data: [[10, 12, 9, 13], [12, 11, 10, 14], [11, 15, 11, 16], [15, 14, 13, 17]] },
        { type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: [100, 80, 150, 90], itemStyle: { color: '#ff0000' } },
      ],
    }
    const { container } = mountInBrowser(h(OptionChart, { option, width: 400, height: 300 }))
    await flush()
    const ls = layers(container)
    expect(ls).toHaveLength(1)
    expect([ls[0]!.style.top, ls[0]!.style.height]).toEqual(['10px', '150px'])
    // Red volume bars on the base canvas, below the candle grid.
    const base = Array.from(container.querySelectorAll('canvas')).find((c) => c.closest('[data-pyreon-chart-layer]') === null)!
    const dpr = base.width / base.getBoundingClientRect().width
    const d = base.getContext('2d')!.getImageData(0, Math.round(200 * dpr), base.width, Math.round(80 * dpr)).data
    let red = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 200 && d[i + 1]! < 60 && d[i + 2]! < 60) red++
    expect(red).toBeGreaterThan(100)
  })
})

