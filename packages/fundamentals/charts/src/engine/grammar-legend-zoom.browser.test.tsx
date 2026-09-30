// `<Cell visualMap>` and `<Zoom>` beside `<Candle>`: the grammar reaches the
// family hosts' legend and zoom, in real Chromium.
import { h } from '@pyreon/core'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'
import { Candle, Cell, Chart, Zoom } from './grammar'

const pixels = (canvas: HTMLCanvasElement): Uint8ClampedArray => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data

describe('<Cell visualMap>', () => {
  interface Obs { d: string; h: string; n: number }
  const ROWS: Obs[] = [{ d: 'Mon', h: '09', n: 10 }, { d: 'Tue', h: '09', n: 90 }, { d: 'Mon', h: '10', n: 40 }, { d: 'Tue', h: '10', n: 60 }]
  const mount = (legend: boolean) =>
    mountInBrowser(() => h(Chart<Obs>, { data: ROWS, width: 320, height: 220, animate: false, theme: { ramp: ['#fff7ed', '#f97316', '#7c2d12'] } }, h(Cell<Obs>, { x: 'd', y: 'h', value: 'n', ...(legend ? { visualMap: true as const } : {}) })))

  // A custom ramp: the default theme's ramp happens to equal the heat ramp, so
  // only a themed chart shows whether the legend uses the cells' own colours.
  it('`visualMap` alone draws a legend strip without recolouring the cells', async () => {
    const plain = mount(false)
    const withLegend = mount(true)
    await flush()
    const a = pixels(query<HTMLCanvasElement>(plain.container, 'canvas'))
    const b = pixels(query<HTMLCanvasElement>(withLegend.container, 'canvas'))
    let changed = 0
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++
    // The strip takes room and paints; the image differs.
    expect(changed).toBeGreaterThan(200)
    // The four cells are the four largest blocks of one colour: with the
    // legend on they keep exactly the colours they had without it.
    const fills = (d: Uint8ClampedArray): string[] => {
      const count = new Map<string, number>()
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] !== 255) continue
        const k = `${d[i]},${d[i + 1]},${d[i + 2]}`
        count.set(k, (count.get(k) ?? 0) + 1)
      }
      return [...count].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k]) => k).sort()
    }
    expect(fills(b)).toEqual(fills(a))
  })
})

describe('<Zoom> beside <Candle>', () => {
  interface Bar { t: string; o: number; hi: number; lo: number; c: number }
  const BARS: Bar[] = Array.from({ length: 100 }, (_, i) => ({ t: `D${i + 1}`, o: 100 + i, c: 101 + i, lo: 99 + i, hi: 102 + i }))

  const pickAt = async (zoom: Record<string, unknown> | null): Promise<number> => {
    const picks: number[] = []
    const { container } = mountInBrowser(() =>
      h(Chart<Bar>, { data: BARS, x: 't', width: 600, height: 300, animate: false, onSelect: (i: number) => picks.push(i) },
        h(Candle<Bar>, { open: 'o', high: 'hi', low: 'lo', close: 'c' }),
        ...(zoom === null ? [] : [h(Zoom, zoom)]),
      ),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 80, clientY: r.top + 120 }))
    await flush()
    return picks.at(-1) ?? -1
  }

  it('opens on `window` — a click near the left lands in the second half of the data', async () => {
    expect(await pickAt(null)).toBeLessThan(20)
    expect(await pickAt({ window: { start: 0.5, end: 1 } })).toBeGreaterThanOrEqual(50)
  })
})
