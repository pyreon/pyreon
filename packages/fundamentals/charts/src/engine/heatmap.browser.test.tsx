import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { HeatmapChart } from './HeatmapChart'

interface Obs {
  day: string
  hour: string
  n: number
}

const DATA: Obs[] = [
  { day: 'Mon', hour: '09', n: 1 },
  { day: 'Mon', hour: '10', n: 50 },
  { day: 'Tue', hour: '09', n: 25 },
]

describe('HeatmapChart', () => {
  it('paints hotter cells differently from colder ones, in a real browser', async () => {
    const { container } = mountInBrowser(() =>
      HeatmapChart<Obs>({
        data: DATA,
        x: (d) => d.day,
        y: (d) => d.hour,
        value: (d) => d.n,
        width: 200,
        height: 120,
        colors: ['#000000', '#ffffff'],
        title: 'Traffic',
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('no ctx')
    // Collect the distinct opaque colors painted. Three cells with three
    // distinct values through a black→white ramp — plus label text — means at
    // least three distinct non-transparent colors, with pure black (min) and
    // pure white (max) among them.
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const colors = new Set<string>()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    }
    expect(colors.has('0,0,0'), 'the coldest cell is missing').toBe(true)
    expect(colors.has('255,255,255'), 'the hottest cell is missing').toBe(true)
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })

  it('describes itself to assistive tech from the data', async () => {
    const { container } = mountInBrowser(() =>
      HeatmapChart<Obs>({
        data: DATA,
        x: (d) => d.day,
        y: (d) => d.hour,
        value: (d) => d.n,
        width: 200,
        height: 120,
        title: 'Traffic',
      }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    expect(canvas.getAttribute('role')).toBe('img')
    expect(canvas.getAttribute('aria-label')).toBe(
      'Traffic: 2 columns by 2 rows, values 1 to 50.',
    )
  })
})
