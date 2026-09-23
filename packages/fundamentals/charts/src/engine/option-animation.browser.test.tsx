/**
 * ECharts' animation semantics on `<OptionChart>`, in real Chromium: the
 * option's `animation*` keys decide the entrance and the update tween, and a
 * family chart keeps ONE host alive across updates so it tweens rather than
 * remounting.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const snapshot = (c: HTMLCanvasElement): Uint8ClampedArray => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.slice()
const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i])

const bar = (data: number[], extra: Record<string, unknown> = {}): EChartsOption => ({
  xAxis: { type: 'category', data: data.map((_, i) => `c${i}`) },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [{ type: 'bar', data, itemStyle: { color: '#ff0000' } }],
  ...extra,
})

describe('<OptionChart> animation (real browser)', () => {
  it('plays an entrance by default, as ECharts does: the first frame is not the settled one', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bar([4, 8, 6], { animationDuration: 300 }), width: 400, height: 240 }))
    await flush()
    const c = container.querySelector('canvas')!
    const early = snapshot(c)
    await wait(600)
    expect(sameBytes(early, snapshot(c))).toBe(false)
  })

  it('`animation: false` draws the settled chart on the first frame', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bar([4, 8, 6], { animation: false }), width: 400, height: 240 }))
    await flush()
    const c = container.querySelector('canvas')!
    const early = snapshot(c)
    await wait(400)
    expect(sameBytes(early, snapshot(c))).toBe(true)
  })

  it('a series longer than `animationThreshold` is drawn without animation', async () => {
    const { container } = mountInBrowser(h(OptionChart, { option: bar([4, 8, 6], { animationThreshold: 2, animationDuration: 300 }), width: 400, height: 240 }))
    await flush()
    const c = container.querySelector('canvas')!
    const early = snapshot(c)
    await wait(600)
    expect(sameBytes(early, snapshot(c))).toBe(true)
  })

  it('tweens an option update over `animationDurationUpdate`', async () => {
    const data = signal([4, 8, 6])
    const { container } = mountInBrowser(h(OptionChart, { option: () => bar(data(), { animationDuration: 0, animationDurationUpdate: 300 }), width: 400, height: 240 }))
    await flush()
    await wait(100)
    const c = container.querySelector('canvas')!
    data.set([9, 2, 7])
    await flush()
    const midway = snapshot(c)
    await wait(600)
    expect(sameBytes(midway, snapshot(c))).toBe(false)
  })

  it('snaps an update when `animationDurationUpdate` is 0', async () => {
    const data = signal([4, 8, 6])
    const { container } = mountInBrowser(h(OptionChart, { option: () => bar(data(), { animationDuration: 0, animationDurationUpdate: 0 }), width: 400, height: 240 }))
    await flush()
    await wait(100)
    const c = container.querySelector('canvas')!
    data.set([9, 2, 7])
    await flush()
    const immediate = snapshot(c)
    await wait(400)
    expect(sameBytes(immediate, snapshot(c))).toBe(true)
  })

  it('a family option keeps its host mounted across an update (one canvas, never remounted)', async () => {
    const values = signal([5, 3, 2])
    const { container } = mountInBrowser(h(OptionChart, {
        option: () => ({ animation: false, series: [{ type: 'funnel', data: values().map((v, i) => ({ name: `s${i}`, value: v })) }] }),
        width: 400,
        height: 240,
      }),
    )
    await flush()
    const before = container.querySelector('canvas')!
    const first = snapshot(before)
    values.set([9, 4, 1])
    await flush()
    await wait(50)
    const after = container.querySelector('canvas')!
    expect(after).toBe(before)
    expect(sameBytes(first, snapshot(after))).toBe(false)
  })
})
