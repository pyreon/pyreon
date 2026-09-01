// Finance-family selection in a real browser: candle onSelect + OHLC tooltip,
// heat-cell onSelect + cell tooltip.

import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { CandlestickChart } from './CandlestickChart'
import { HeatmapChart } from './HeatmapChart'

interface Bar {
  day: string
  o: number
  h: number
  l: number
  c: number
}
const BARS: Bar[] = [
  { day: 'Mon', o: 10, h: 20, l: 5, c: 15 },
  { day: 'Tue', o: 15, h: 25, l: 12, c: 13 },
  { day: 'Wed', o: 13, h: 30, l: 11, c: 28 },
]

interface Obs {
  day: string
  hour: string
  n: number
}
const OBS: Obs[] = [
  { day: 'Mon', hour: '09', n: 5 },
  { day: 'Tue', hour: '10', n: 9 },
]

const at = (el: HTMLElement, type: string, x: number, y: number): void => {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent(type, { clientX: r.left + x, clientY: r.top + y, bubbles: true }))
}

describe('CandlestickChart selection', () => {
  const mountCandles = (over: Record<string, unknown> = {}) =>
    mountInBrowser(() =>
      CandlestickChart<Bar>({
        data: BARS,
        open: (d) => d.o,
        high: (d) => d.h,
        low: (d) => d.l,
        close: (d) => d.c,
        x: (d) => d.day,
        width: 320,
        height: 200,
        ...over,
      }),
    )

  it('onSelect fires with the candle index for a mid-plot tap, -1 off-plot', async () => {
    const picks: number[] = []
    const { container } = mountCandles({ onSelect: (i: number) => picks.push(i) })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    // The plot starts after the measured y gutter; mid-canvas lands in band 1.
    at(canvas, 'click', 170, 100)
    at(canvas, 'click', 2, 2)
    await flush()
    expect(picks).toHaveLength(2)
    expect(picks[0]).toBe(1)
    expect(picks[1]).toBe(-1)
  })

  it('hover shows the OHLC tooltip and leave hides it', async () => {
    const { container } = mountCandles({ tooltip: true })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const tip = query<HTMLDivElement>(container, '[data-pyreon-chart-tooltip]')
    expect(tip.style.display).toBe('none')
    at(canvas, 'mousemove', 170, 100)
    await flush()
    expect(tip.style.display).toBe('block')
    expect(tip.textContent).toContain('Tue')
    expect(tip.textContent).toContain('O 15')
    expect(tip.textContent).toContain('C 13')
    canvas.dispatchEvent(new MouseEvent('mouseleave'))
    await flush()
    expect(tip.style.display).toBe('none')
  })
})

describe('HeatmapChart selection', () => {
  const mountHeat = (over: Record<string, unknown> = {}) =>
    mountInBrowser(() =>
      HeatmapChart<Obs>({
        data: OBS,
        x: (d) => d.day,
        y: (d) => d.hour,
        value: (d) => d.n,
        width: 300,
        height: 160,
        ...over,
      }),
    )

  it('onSelect fires with the CELL for a drawn cell, null for an empty position', async () => {
    const picks: ({ x: string; y: string; value: number } | null)[] = []
    const { container } = mountHeat({ onSelect: (c: { x: string; y: string; value: number } | null) => picks.push(c) })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    // Grid spans from the row-label gutter to the right edge; quadrant
    // centres: top-left = (Mon, 09) drawn, top-right = (Tue, 09) EMPTY.
    at(canvas, 'click', 100, 40)
    at(canvas, 'click', 250, 40)
    await flush()
    expect(picks).toHaveLength(2)
    expect(picks[0]).toMatchObject({ x: 'Mon', y: '09', value: 5 })
    expect(picks[1]).toBeNull()
  })

  it('hover shows the cell tooltip with row, column and value', async () => {
    const { container } = mountHeat({ tooltip: true })
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const tip = query<HTMLDivElement>(container, '[data-pyreon-chart-tooltip]')
    at(canvas, 'mousemove', 100, 40)
    await flush()
    expect(tip.style.display).toBe('block')
    expect(tip.textContent).toContain('09')
    expect(tip.textContent).toContain('Mon')
    expect(tip.textContent).toContain('5')
    at(canvas, 'mousemove', 250, 40)
    await flush()
    // Sweeping onto an EMPTY position hides the tooltip rather than lying.
    expect(tip.style.display).toBe('none')
  })
})
