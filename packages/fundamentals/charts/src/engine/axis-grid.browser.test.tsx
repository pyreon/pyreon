// Per-axis grid in real Chromium: the extra vertical lines are PAINTED, and the
// value-axis lines can be switched off on their own.
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { query } from '@pyreon/test-utils'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { Axis, Bar, Chart } from './grammar'

interface Row { m: string; v: number }
const DATA: Row[] = [{ m: 'a', v: 10 }, { m: 'b', v: 40 }, { m: 'c', v: 25 }]

/** How many canvas pixels in one row are the grid colour or near it (any ink that is not white). */
async function inkOnRow(kids: unknown[], fy: number): Promise<number> {
  const { container, unmount } = mountInBrowser(h(Chart<Row>, { data: DATA, x: 'm', width: 360, height: 220, animate: false }, h(Bar<Row>, { y: 'v', color: '#ffffff' }), ...(kids as never[])))
  await flush()
  const c = query<HTMLCanvasElement>(container, 'canvas')
  const d = c.getContext('2d')!.getImageData(0, Math.round(c.height * fy), c.width, 1).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && !(d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255)) n++
  unmount()

  return n
}

describe('per-axis grid in real Chromium', () => {
  it('xGrid paints vertical lines: a row through the plot gains inked columns', async () => {
    const plain = await inkOnRow([], 0.5)
    const grid = await inkOnRow([h(Axis, { x: true, grid: true })], 0.5)
    expect(grid).toBeGreaterThan(plain)
  })
  it('yGrid false removes the horizontal lines: a row on a tick has less ink', async () => {
    let best = 0
    // sweep rows: with the lines on, at least one row is a full-width gridline
    for (let fy = 0.05; fy < 0.8; fy += 0.01) best = Math.max(best, await inkOnRow([], fy))
    expect(best).toBeGreaterThan(150)
    let bestOff = 0
    for (let fy = 0.05; fy < 0.8; fy += 0.01) bestOff = Math.max(bestOff, await inkOnRow([h(Axis, { y: true, grid: false })], fy))
    expect(bestOff).toBeLessThan(best - 100)
  })
})
