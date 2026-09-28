// A keyed sliding window: each surviving bar starts its tween from ITS OWN
// previous value, so mid-tween it already stands at its final height; matched
// by position it would start from its left neighbour's value.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { PlotChart } from './Chart'
import { bars } from './marks'

interface Row { id: string; v: number }

/** Height in px of the painted bar in column `col` of `n` (non-background pixels). */
function barHeight(c: HTMLCanvasElement, col: number, n: number): number {
  const ctx = c.getContext('2d')!
  const x = Math.floor(((col + 0.5) / n) * c.width * 0.8 + c.width * 0.15)
  const { data } = ctx.getImageData(x, 0, 1, c.height)
  let h = 0
  for (let y = 0; y < c.height; y++) {
    const i = y * 4
    if (data[i + 2]! > 150 && data[i]! < 120) h++ // the blue bar fill
  }
  return h
}

async function midTweenVsSettled(by: boolean): Promise<[number, number]> {
  const rows = signal<Row[]>([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }])
  const { container, unmount } = mountInBrowser(
    h(PlotChart<Row>, {
      data: () => rows(),
      x: (d: Row) => d.id,
      ...(by ? { by: (d: Row) => d.id } : {}),
      marks: [bars((d: Row) => d.v, { color: '#2060ff' })],
      yDomain: { min: 0, max: 10 },
      width: 300,
      height: 200,
      animate: false,
      showGrid: false,
      updateDuration: 60_000,
    }),
  )
  await flush()
  const c = container.querySelector('canvas')!
  rows.set([{ id: 'b', v: 2 }, { id: 'c', v: 3 }, { id: 'd', v: 10 }])
  await flush()
  const mid = barHeight(c, 0, 3)
  unmount()
  // The settled frame of the same data, drawn without animation.
  const { container: c2, unmount: u2 } = mountInBrowser(
    h(PlotChart<Row>, { data: rows(), x: (d: Row) => d.id, marks: [bars((d: Row) => d.v, { color: '#2060ff' })], yDomain: { min: 0, max: 10 }, width: 300, height: 200, animate: false, showGrid: false }),
  )
  await flush()
  const settled = barHeight(c2.querySelector('canvas')!, 0, 3)
  u2()
  return [mid, settled]
}

describe('<PlotChart by>', () => {
  it('keyed: the surviving first bar is already at its own height mid-tween', async () => {
    const [mid, settled] = await midTweenVsSettled(true)
    expect(settled).toBeGreaterThan(0)
    expect(Math.abs(mid - settled)).toBeLessThanOrEqual(1)
  })
  it('unkeyed (control): the same bar starts from its neighbour\'s value, visibly shorter', async () => {
    const [mid, settled] = await midTweenVsSettled(false)
    expect(settled - mid).toBeGreaterThan(5)
  })
})
