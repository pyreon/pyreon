import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Band, Chart } from '../index'
import { band } from './marks'
import { chartToSvg } from './svg-chart'

describe('gapped bands on canvas and SVG', () => {
  it('leaves the missing interval blank and repaints when it recovers', async (ctx) => {
    const initial = [5, 6, NaN, 7, 8].map((hi, i) => ({ label: String(i), hi, lo: i + 1 }))
    const rows = signal(initial)
    const mounted = mountInBrowser(
      h(Chart<(typeof initial)[number]>, {
        data: rows,
        x: 'label',
        width: 400,
        height: 240,
        animate: false,
        updateAnimation: false,
        yDomain: { min: 0, max: 10 },
        showXAxis: false,
        showYAxis: false,
        showGrid: false,
        children: h(Band<(typeof initial)[number]>, { low: 'lo', high: 'hi', color: '#ff0000' }),
      }),
    )
    ctx.onTestFinished(mounted.unmount)
    await flush()
    const canvas = mounted.container.querySelector('canvas')!
    const painted = (x: number, y: number): boolean => {
      const dpr = canvas.width / 400
      const [r, g] = canvas
        .getContext('2d')!
        .getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return r! > g! + 50
    }
    // Axes hidden: plot = (0, 8, 388, 232). At the gap centre, y=4.5 is
    // crossed only by the malformed second polygon's diagonal back to run 1.
    expect(painted(194, 135)).toBe(false)
    expect(painted(310, 112)).toBe(true)
    rows.set(initial.map((r, i) => (i === 2 ? { ...r, hi: 7 } : r)))
    await flush()
    expect(painted(194, 135)).toBe(true)
    rows.set(initial)
    await flush()
    expect(painted(194, 135)).toBe(false)
  })

  it('the public SVG export closes each region within its own x interval', () => {
    const data = [5, 6, NaN, 7, 8].map((hi, i) => ({ hi, lo: i + 1 }))
    const svg = chartToSvg({
      data,
      marks: [
        band<(typeof data)[number]>(
          (d) => d.lo,
          (d) => d.hi,
        ),
      ],
      width: 400,
      height: 240,
      showXAxis: false,
      showYAxis: false,
      showGrid: false,
    })
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const polygons = Array.from(doc.querySelectorAll('polygon'))
    expect(polygons).toHaveLength(2)
    for (const [i, polygon] of polygons.entries()) {
      const xs = polygon
        .getAttribute('points')!
        .split(' ')
        .map((p) => Number(p.split(',')[0]))
      expect(Math.min(...xs)).toBeCloseTo(i === 0 ? 38.8 : 271.6)
      expect(Math.max(...xs)).toBeCloseTo(i === 0 ? 116.4 : 349.2)
    }
  })
})
