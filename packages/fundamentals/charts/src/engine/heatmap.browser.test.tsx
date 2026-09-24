import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { HeatmapChart } from './HeatmapChart'
import { visualMap } from './visual-map'

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
      HeatmapChart<Obs>({ animate: false,
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
      HeatmapChart<Obs>({ animate: false,
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

  it('a calculable visualMap: dragging a handle greys the cells it leaves out, and reports the range', async () => {
    const rows = [
      { day: 'Mon', hour: '09', n: 10 },
      { day: 'Tue', hour: '09', n: 90 },
    ]
    const spec = visualMap({ domain: [0, 100], calculable: true, stops: ['#000000', '#0000ff'] })
    const ranges: [number, number][] = []
    const { container } = mountInBrowser(() =>
      HeatmapChart({ animate: false, data: rows, x: (d) => d.day, y: (d) => d.hour, value: (d) => d.n, width: 300, height: 220, visualMap: spec, onVisualMapChange: (s) => ranges.push(s.range) }),
    )
    await flush()
    const canvas = query<HTMLCanvasElement>(container, 'canvas')
    const grey = (): number => {
      const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] === 204 && d[i + 1] === 204 && d[i + 2] === 204) n++
      return n
    }
    expect(grey()).toBe(0)
    const r = canvas.getBoundingClientRect()
    // The high handle starts at the top of the bar; find it by probing the canvas.
    const fire = (type: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1 }))
    let grabbed = false
    for (let y = 0; y < 220 && !grabbed; y += 2) {
      for (let x = 200; x < 300 && !grabbed; x += 2) {
        fire('pointerdown', x, y)
        fire('pointermove', x, y + 80)
        fire('pointerup', x, y + 80)
        if (ranges.length > 0) grabbed = true
      }
    }
    await flush()
    expect(grabbed).toBe(true)
    expect(ranges[ranges.length - 1]![1]).toBeLessThan(90)
    // The 90 cell is out of range now: a large grey block appears.
    expect(grey()).toBeGreaterThan(500)
  })
})

