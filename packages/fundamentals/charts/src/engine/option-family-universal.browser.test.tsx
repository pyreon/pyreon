/**
 * A family series' `universalTransition` through `<OptionChart>`: the host
 * morphs an update that changes the slice count instead of snapping.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { OptionChart } from './OptionChart'
import type { EChartsOption } from './option'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const snapshot = (c: HTMLCanvasElement): Uint8ClampedArray => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.slice()
const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i])

const run = async (universal: boolean): Promise<boolean> => {
  const values = signal([1, 2])
  const option = (): EChartsOption => ({
    animationDuration: 0,
    animationDurationUpdate: 300,
    series: [{ type: 'pie', ...(universal ? { universalTransition: true } : {}), data: values().map((v, i) => ({ name: 's' + String(i), value: v })) }],
  })
  const { container } = mountInBrowser(h(OptionChart, { option, width: 300, height: 300 }))
  await flush()
  await wait(100)
  const c = query<HTMLCanvasElement>(container, 'canvas')
  values.set([1, 2, 3, 4])
  await flush()
  const first = snapshot(c)
  await wait(600)
  return sameBytes(first, snapshot(c))
}

describe('<OptionChart> family universalTransition (real browser)', () => {
  it('a slice-count change morphs when the series asks: the first frame is not the settled one', async () => {
    expect(await run(true)).toBe(false)
  })
  it('without it, the same change snaps straight to the settled frame', async () => {
    expect(await run(false)).toBe(true)
  })
})
