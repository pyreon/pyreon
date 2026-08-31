import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { CandlestickChart } from './CandlestickChart'

interface Bar {
  day: string
  o: number
  h: number
  l: number
  c: number
}

const BARS: Bar[] = [
  { day: 'Mon', o: 10, h: 20, l: 5, c: 15 },
  { day: 'Tue', o: 15, h: 18, l: 8, c: 9 },
]

describe('CandlestickChart', () => {
  it('paints up and down candles in their two colors', async () => {
    const { container } = mountInBrowser(() =>
      CandlestickChart<Bar>({
        data: BARS,
        open: (d) => d.o,
        high: (d) => d.h,
        low: (d) => d.l,
        close: (d) => d.c,
        x: (d) => d.day,
        width: 300,
        height: 160,
        candle: { upColor: '#00ff00', downColor: '#ff0000' },
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no ctx')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let green = 0
    let red = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) continue
      if (data[i] === 0 && data[i + 1] === 255 && data[i + 2] === 0) green++
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) red++
    }
    expect(green, 'the up candle never painted').toBeGreaterThan(50)
    expect(red, 'the down candle never painted').toBeGreaterThan(50)
  })

  it('describes range and last close to assistive tech', async () => {
    const { container } = mountInBrowser(() =>
      CandlestickChart<Bar>({
        data: BARS,
        open: (d) => d.o,
        high: (d) => d.h,
        low: (d) => d.l,
        close: (d) => d.c,
        width: 300,
        height: 160,
        title: 'ACME',
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(canvas.getAttribute('aria-label')).toBe(
      'ACME: 2 periods, range 5 to 20, last close 9.',
    )
  })
})
