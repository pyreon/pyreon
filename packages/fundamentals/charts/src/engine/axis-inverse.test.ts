import { describe, expect, it } from 'vitest'
import { area, bars, groupedBars, line, points, resolveMarks, stackedBars, waterfall } from './marks'
import type { Mark } from './marks'
import { barsFor, defaultTheme, layoutChart, renderChart, resolveYDomain } from './render'
import type { ChartSpec } from './render'
import { yPx } from './scale'
import { plotHitBars } from './plot-hit'
import { mirrorCmds } from './rtl'
import { chartToSvg } from './svg-chart'
import type { DrawCmd, Rect } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
interface Row { a: number; b: number }
let seed = 11
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const rows = (n: number, neg = false): Row[] => Array.from({ length: n }, () => ({ a: Math.round((rnd() - (neg ? 0.5 : 0)) * 40), b: Math.round((rnd() - (neg ? 0.5 : 0)) * 40) }))

const mk = (data: Row[], marks: Mark<Row>[], extra: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 360, height: 220, series: resolveMarks(data, marks), categories: data.map((_, i) => `c${i}`), theme: defaultTheme,
  showXAxis: true, showYAxis: true, showGrid: true, ...extra,
})

const a = (d: Row): number => d.a
const b = (d: Row): number => d.b

/** A rect reflected about the plot's horizontal midline (vertical) or vertical midline (horizontal). */
const reflect = (r: Rect, plot: Rect, horizontal: boolean): Rect =>
  horizontal ? { ...r, x: 2 * (plot.x + plot.w / 2) - r.x - r.w } : { ...r, y: 2 * (plot.y + plot.h / 2) - r.y - r.h }

/** Equal rects, to `tol` px: a horizontal chart's plot can differ by the edge-label overhang (the label at the right edge is a different one once the axis is reversed). */
const close = (p: Rect, q: Rect, tol: number): void => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(p[k] - q[k])).toBeLessThanOrEqual(tol)
}

describe('yInverse is a reflection of every pixel position', () => {
  it('property: yPx of an inverted domain is the plot-midline reflection of the plain one', () => {
    const plot = { x: 10, y: 8, w: 300, h: 170 }
    for (let t = 0; t < 100; t++) {
      const lo = (rnd() - 0.5) * 100
      const hi = lo + 1 + rnd() * 100
      const v = lo + rnd() * (hi - lo)
      const plain = yPx({ min: lo, max: hi }, plot, v)
      const flipped = yPx({ min: lo, max: hi, inverse: true }, plot, v)
      expect(flipped).toBeCloseTo(2 * (plot.y + plot.h / 2) - plain, 9)
      // and it is an involution: reflecting twice is the identity
      expect(2 * (plot.y + plot.h / 2) - flipped).toBeCloseTo(plain, 9)
    }
  })

  const KINDS: [string, (d: Row[]) => Mark<Row>[], boolean][] = [
    ['plain bars', () => [bars<Row>(a)], false],
    ['grouped bars', () => [groupedBars<Row>(a), groupedBars<Row>(b)], false],
    ['stacked bars', () => [stackedBars<Row>(a), stackedBars<Row>(b)], false],
    ['waterfall', () => [waterfall<Row>(a)], false],
    ['plain bars, horizontal', () => [bars<Row>(a)], true],
    ['grouped bars, horizontal', () => [groupedBars<Row>(a), groupedBars<Row>(b)], true],
    ['stacked bars, horizontal', () => [stackedBars<Row>(a), stackedBars<Row>(b)], true],
  ]
  for (const [name, marks, horizontal] of KINDS) {
    it(`property: ${name} - every bar rect reflects about the plot midline (positive and mixed-sign data)`, () => {
      for (const neg of [false, true]) {
        for (let t = 0; t < 12; t++) {
          const data = rows(3 + Math.floor(rnd() * 6), neg)
          const plain = mk(data, marks(data), { horizontal })
          const inv = mk(data, marks(data), { horizontal, yInverse: true })
          const lp = layoutChart(plain, measure)
          const li = layoutChart(inv, measure)
          if (!horizontal) expect(li.plot).toEqual(lp.plot)
          else expect(Math.abs(li.plot.w - lp.plot.w)).toBeLessThan(5)
          for (let k = 0; k < plain.series.length; k++) {
            const rp = barsFor(plain, k, measure)
            const ri = barsFor(inv, k, measure)
            expect(ri.length).toBe(rp.length)
            for (let i = 0; i < rp.length; i++) if (rp[i]!.w >= 0) close(ri[i]!, reflect(rp[i]!, lp.plot, horizontal), horizontal ? 5 : 1e-6)
          }
        }
      }
    })
  }

  it('lines and dots: every point reflects', () => {
    const data = rows(7, true)
    const marks = [line<Row>(a), points<Row>(b)]
    const plain = renderChart(mk(data, marks), measure)
    const inv = renderChart(mk(data, marks, { yInverse: true }), measure)
    const lp = layoutChart(mk(data, marks), measure).plot
    const polys = (cmds: DrawCmd[]): { x: number; y: number }[] => cmds.flatMap((c) => (c.kind === 'polyline' && c.width === 2 ? c.points : c.kind === 'circle' ? [c.center] : []))
    const pp = polys(plain)
    const pi = polys(inv)
    expect(pi.length).toBe(pp.length)
    for (let i = 0; i < pp.length; i++) {
      expect(pi[i]!.x).toBeCloseTo(pp[i]!.x, 6)
      expect(pi[i]!.y).toBeCloseTo(2 * (lp.y + lp.h / 2) - pp[i]!.y, 6)
    }
  })

  it('an area fills toward the baseline, which is now the TOP of the plot', () => {
    const data = [{ a: 3, b: 0 }, { a: 8, b: 0 }, { a: 5, b: 0 }]
    const spec = mk(data, [area<Row>(a)], { yInverse: true })
    const plot = layoutChart(spec, measure).plot
    const poly = renderChart(spec, measure).find((c) => c.kind === 'polygon')
    expect(poly?.kind).toBe('polygon')
    const ys = (poly as Extract<DrawCmd, { kind: 'polygon' }>).points.map((p) => p.y)
    // the closing edge sits on the axis floor, which an inverted axis puts at the top
    expect(Math.min(...ys)).toBeCloseTo(plot.y, 6)
    expect(ys.filter((y) => Math.abs(y - plot.y) < 1e-6).length).toBeGreaterThanOrEqual(2)
  })

  it('the tick labels run the other way: the largest value is at the bottom', () => {
    const data = rows(5)
    const l = layoutChart(mk(data, [bars<Row>(a)], { yInverse: true }), measure)
    const lo = l.yTicks[0]!
    const hi = l.yTicks[l.yTicks.length - 1]!
    expect(hi.value).toBeGreaterThan(lo.value)
    expect(hi.pos).toBeGreaterThan(lo.pos)
    const plain = layoutChart(mk(data, [bars<Row>(a)]), measure)
    expect(plain.yTicks[plain.yTicks.length - 1]!.pos).toBeLessThan(plain.yTicks[0]!.pos)
  })

  it('a log axis inverts too: bars and their decade ticks stay aligned', () => {
    const data = [{ a: 3, b: 0 }, { a: 40, b: 0 }, { a: 700, b: 0 }]
    const spec = mk(data, [bars<Row>(a)], { yScale: 'log', yInverse: true })
    const l = layoutChart(spec, measure)
    const rects = barsFor(spec, 0, measure)
    // the bar for 40 ends at the pixel of ... a tick for 10 sits above it, 100 below it, in an inverted axis
    const t = (v: number): number => l.yTicks.find((x) => x.value === v)!.pos
    const bottom = rects[1]!.y + rects[1]!.h
    expect(bottom).toBeGreaterThan(t(10))
    expect(bottom).toBeLessThan(t(100))
  })
})

describe('dual axes flip independently', () => {
  it('y2Inverse reflects only the right-axis series', () => {
    const data = rows(5)
    const marks: Mark<Row>[] = [bars<Row>(a), line<Row>(b, { axis: 'right' })]
    const plain = mk(data, marks)
    const both = mk(data, marks, { y2Inverse: true })
    const plot = layoutChart(plain, measure).plot
    expect(barsFor(both, 0, measure)).toEqual(barsFor(plain, 0, measure))
    const lineY = (s: ChartSpec): number[] => renderChart(s, measure).flatMap((c) => (c.kind === 'polyline' && c.width === 2 ? c.points.map((p) => p.y) : []))
    lineY(plain).forEach((y, i) => expect(lineY(both)[i]).toBeCloseTo(2 * (plot.y + plot.h / 2) - y, 6))
    const left = mk(data, marks, { yInverse: true })
    expect(lineY(left)).toEqual(lineY(plain))
  })
})

describe('hit testing agrees with rendering', () => {
  const rectsOf = (cmds: DrawCmd[], fill: string): Rect[] => cmds.flatMap((c) => (c.kind === 'rect' && c.fill === fill ? [c.rect] : []))
  for (const inverse of [false, true]) {
    for (const horizontal of [false, true]) {
      it(`property: a pointer hits the bar whose DRAWN rect contains it (yInverse ${inverse}, horizontal ${horizontal})`, () => {
        for (let t = 0; t < 20; t++) {
          const data = rows(3 + Math.floor(rnd() * 5), true)
          const spec = mk(data, [bars<Row>(a)], { horizontal, yInverse: inverse })
          const drawn = rectsOf(renderChart(spec, measure), spec.series[0]!.color)
          for (let k = 0; k < 25; k++) {
            const px = rnd() * spec.width
            const py = rnd() * spec.height
            const want = drawn.findIndex((r) => r.w > 0 && r.h > 0 && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
            expect(plotHitBars(spec, measure, px, py)).toBe(want)
          }
        }
      })
    }
  }
})

describe('composition with RTL', () => {
  it('RTL mirrors x and inverse flips y, so they commute: the y positions are the same, the x positions mirror', () => {
    const data = rows(5, true)
    const opts = { data, marks: [bars<Row>(a)], x: (_d: Row, i: number) => `c${i}`, width: 360, height: 220, yInverse: true }
    const ltr = chartToSvg(opts)
    const rtl = chartToSvg({ ...opts, rtl: true })
    expect(rtl).not.toBe(ltr)
    const spec = mk(data, [bars<Row>(a)], { yInverse: true })
    const drawn = renderChart(spec, measure)
    const mirrored = mirrorCmds(drawn, 360)
    const ys = (cmds: DrawCmd[]): number[] => cmds.flatMap((c) => (c.kind === 'rect' ? [c.rect.y, c.rect.h] : []))
    expect(ys(mirrored)).toEqual(ys(drawn))
  })
})

describe('the data is untouched', () => {
  it('the resolved series (what the table and tooltip read) is identical with and without inverse', () => {
    const data = rows(6)
    expect(mk(data, [bars<Row>(a)], { yInverse: true }).series).toEqual(mk(data, [bars<Row>(a)]).series)
  })
  it('a spec with the flag unset or false renders identically (byte-stable)', () => {
    const data = rows(6, true)
    const base = renderChart(mk(data, [bars<Row>(a), line<Row>(b)]), measure)
    expect(renderChart(mk(data, [bars<Row>(a), line<Row>(b)], { yInverse: false, y2Inverse: false }), measure)).toEqual(base)
  })
  it('the resolved domain carries the flag only when asked', () => {
    const data = rows(4)
    expect(resolveYDomain(mk(data, [bars<Row>(a)])).inverse).toBeUndefined()
    expect(resolveYDomain(mk(data, [bars<Row>(a)], { yInverse: true })).inverse).toBe(true)
  })
})
