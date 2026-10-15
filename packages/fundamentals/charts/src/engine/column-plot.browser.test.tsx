// Real-Chromium specs for column marks on <PlotChart> with no `data`.
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { bars, line } from './marks'
import { PlotChart } from './Chart'

const inked = (canvas: HTMLCanvasElement): number => {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return 0
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('<PlotChart> column marks (real browser)', () => {
  it('draws columns with no `data`, one row per index of the longest column', async () => {
    const { container } = mountInBrowser(() =>
      PlotChart({
        marks: [bars(new Float64Array([3, 180, 7])), line([1, 2, 3, 4])],
        title: 'Columns',
        seriesLabels: ['A', 'B'],
        width: 400,
        height: 200,
      }),
    )
    await flush()
    const table = container.querySelector('table')!
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(table.textContent).toContain('180')
    expect(inked(container.querySelector('canvas')!)).toBeGreaterThan(0)
  })

  // A thinned frame resolves a SUBSET of rows with global indices; a column
  // read with the frame's local index would draw the wrong points. The
  // accessor form is the oracle: both must paint the same pixels.
  it('a decimated column paints exactly what the equivalent accessor paints', async () => {
    const n = 5_000
    const col = new Float64Array(n)
    for (let i = 0; i < n; i++) col[i] = (i % 97) * Math.sin(i / 40) + i / 50
    const rows = Array.from(col, (v) => ({ v }))
    const pixels = (c: HTMLElement): Uint8ClampedArray => {
      const canvas = c.querySelector('canvas')!
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const a = mountInBrowser(() =>
      PlotChart({ data: rows, marks: [line((d: { v: number }) => d.v)], maxPoints: 200, animate: false, width: 500, height: 200 }),
    )
    const b = mountInBrowser(() => PlotChart({ marks: [line(col)], maxPoints: 200, animate: false, width: 500, height: 200 }))
    await flush()
    const pa = pixels(a.container)
    const pb = pixels(b.container)
    expect(inked(a.container.querySelector('canvas')!)).toBeGreaterThan(0)
    let diff = 0
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diff++
    expect(diff).toBe(0)
  })

  it('mounts a 100k-point column through decimation', async () => {
    const col = new Float64Array(100_000)
    for (let i = 0; i < col.length; i++) col[i] = Math.sin(i / 500) * 100
    const { container } = mountInBrowser(() => PlotChart({ marks: [line(col)], width: 600, height: 240 }))
    await flush()
    expect(inked(container.querySelector('canvas')!)).toBeGreaterThan(0)
  })
})
