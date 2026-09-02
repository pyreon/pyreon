import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { ParallelChart } from './ParallelChart'
import { layoutParallel } from './parallel'
import type { ParallelLine } from './parallel'
import { parallelRows } from './parallel-web'
import type { ParallelRow } from './parallel-web'

const AXES = [{ name: 'a' }, { name: 'b' }]
const ROWS: ParallelRow[] = [[1, 10], [2, 20], [3, 30]]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('ParallelChart (real browser)', () => {
  it('paints, selects the line under the click, repaints reactively', async () => {
    const rows = signal(ROWS)
    const picked: (ParallelLine | null)[] = []
    const { container } = mountInBrowser(() =>
      ParallelChart({ axes: AXES, rows: () => rows(), width: 400, height: 300, title: 'P', onSelect: (l) => picked.push(l) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    const line = layoutParallel(AXES, parallelRows(AXES, ROWS), { x: 40, y: 8, w: 320, h: 284 }).lines[1]!
    const a = line.points[0]!
    const b = line.points[1]!
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + (a.x + b.x) / 2, clientY: r.top + (a.y + b.y) / 2, bubbles: true }))
    expect(picked).toHaveLength(1)
    expect(picked[0]!.index).toBe(1)
    rows.set([[1, 10]])
    await flush()
    expect(inked(c)).not.toBe(before)
  })
})
