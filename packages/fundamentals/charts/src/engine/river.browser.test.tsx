import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { RiverChart } from './RiverChart'
import { layoutRiver } from './river'
import type { RiverLayer, RiverSeries } from './river'

const SERIES: RiverSeries[] = [{ name: 'a', values: [1, 3, 2] }, { name: 'b', values: [2, 1, 3] }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('RiverChart (real browser)', () => {
  it('paints, selects the layer under the click, repaints reactively', async () => {
    const series = signal(SERIES)
    const picked: (RiverLayer | null)[] = []
    const { container } = mountInBrowser(() =>
      RiverChart({ series: () => series(), width: 400, height: 200, title: 'R', river: { curve: 'linear' }, onSelect: (l) => picked.push(l) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const l = layoutRiver(SERIES, { x: 8, y: 8, w: 384, h: 184 }, { curve: 'linear' })
    const a = l.layers[0]!
    const x = a.top[1]!.x
    const y = (a.top[1]!.y + a.bottom[1]!.y) / 2
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.name).toBe('a')
    series.set([{ name: 'a', values: [5, 5, 5] }])
    await flush()
    expect(inked(c)).not.toBe(before)
  })
})
