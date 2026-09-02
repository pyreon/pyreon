import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { BoxplotChart } from './BoxplotChart'

interface Row { group: string; obs: number[] }
const DATA: Row[] = [
  { group: 'A', obs: [1, 2, 3, 4, 5] },
  { group: 'B', obs: [3, 5, 7, 9, 40] },
]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('BoxplotChart (real browser)', () => {
  it('paints, repaints reactively, hit-tests bands, and exposes the summary table', async () => {
    const rows = signal(DATA)
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      BoxplotChart<Row>({ data: () => rows(), values: (d) => d.obs, x: (d) => d.group, width: 400, height: 240, title: 'Spread', onSelect: (i) => picked.push(i) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 300, clientY: r.top + 120, bubbles: true }))
    expect(picked).toEqual([1])
    rows.set([{ group: 'A', obs: [1, 2, 3, 4, 5] }])
    await flush()
    expect(inked(c)).not.toBe(before)
    expect(container.querySelector('table')!.textContent).toContain('Median')
  })
})
