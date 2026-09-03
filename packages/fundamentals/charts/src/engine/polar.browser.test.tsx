import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { PolarChart } from './PolarChart'
import { layoutPolar } from './polar'
import type { PolarSeries } from './polar'
import type { PolarHit } from './polar-hit'

const AXES = { categories: ['a', 'b', 'c'] }
const SERIES: PolarSeries[] = [{ name: 'x', kind: 'bar', values: [1, 2, 3] }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('PolarChart (real browser)', () => {
  it('paints, selects the sector under the click, repaints reactively', async () => {
    const series = signal(SERIES)
    const picked: PolarHit[] = []
    const { container } = mountInBrowser(() =>
      PolarChart({ axes: AXES, series: () => series(), width: 300, height: 300, title: 'P', onSelect: (h) => picked.push(h) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const l = layoutPolar(AXES, SERIES, { x: 0, y: 0, w: 300, h: 300 })
    const s = l.sectors[2]!
    const mid = (s.start + s.end) / 2
    const r = (s.innerR + s.outerR) / 2
    const rect = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: rect.left + l.center.x + Math.cos(mid) * r, clientY: rect.top + l.center.y + Math.sin(mid) * r, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]?.kind).toBe('sector')
    series.set([{ name: 'x', kind: 'bar', values: [3, 3, 3] }])
    await flush()
    expect(inked(c)).not.toBe(before)
  })
})
