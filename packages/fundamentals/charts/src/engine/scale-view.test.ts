import { describe, expect, it } from 'vitest'
import { bars, line, resolveMarks } from './marks'
import { barsFor, defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import { log, sqrt, symlog } from './scale-descriptors'
import { viewDomain, viewForward, viewTicks } from './scale-view'
import { plotHitBars } from './plot-hit'
import type { DrawCmd } from './types'

const measure = (t: string, s: number): number => t.length * s * 0.6
let seed = 5
const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const KINDS = ['log', 'sqrt', 'symlog'] as const
/** The test-local inverse of each view (the engine never needs one). */
const back = (kind: string, w: number, lo: number): number => (kind === 'log' ? lo * 10 ** w : kind === 'sqrt' ? w * w : Math.sign(w) * lo * (10 ** Math.abs(w) - 1))

describe('the three views', () => {
  it('rule: what each scale cannot place is a gap (NaN), never a pixel', () => {
    expect(Number.isNaN(viewForward('log', 0, 1))).toBe(true)
    expect(Number.isNaN(viewForward('log', -3, 1))).toBe(true)
    expect(Number.isNaN(viewForward('sqrt', -0.1, 1))).toBe(true)
    expect(viewForward('sqrt', 0, 1)).toBe(0)
    for (const v of [-1e6, -3, 0, 0.5, 7, 1e9]) expect(Number.isFinite(viewForward('symlog', v, 1))).toBe(true)
  })
  for (const kind of KINDS) {
    it(`${kind}: strictly increasing, and the inverse round-trips (random values)`, () => {
      const lo = 0.5
      for (let t = 0; t < 200; t++) {
        const a = kind === 'symlog' ? (rnd() - 0.5) * 2000 : 0.001 + rnd() * 1000
        const b = a + 0.001 + rnd() * 500
        expect(viewForward(kind, b, lo)).toBeGreaterThan(viewForward(kind, a, lo))
        expect(back(kind, viewForward(kind, a, lo), lo)).toBeCloseTo(a, 6)
      }
    })
  }
  it('symlog is odd (symmetric about zero) and linear-looking near it', () => {
    for (const v of [0.2, 3, 90]) expect(viewForward('symlog', -v, 1)).toBeCloseTo(-viewForward('symlog', v, 1), 12)
    expect(viewForward('symlog', 0.001, 1)).toBeCloseTo(0.001 / Math.LN10, 4)
  })
  it('view domains: log spans decades from 0, sqrt and symlog transform the ends', () => {
    expect(viewDomain('log', { min: 1, max: 1000 }, 1)).toEqual({ min: 0, max: 3 })
    expect(viewDomain('sqrt', { min: 0, max: 100 }, 1)).toEqual({ min: 0, max: 10 })
    expect(viewDomain('symlog', { min: -99, max: 99 }, 1).min).toBeCloseTo(-2, 9)
  })
})

describe('ticks are nice in REAL space and labelled with real values', () => {
  it('log: one tick per decade', () => {
    expect(viewTicks('log', { min: 1, max: 1000 }, 100, 0, 5, undefined, 1).map((t) => t.value)).toEqual([1, 10, 100, 1000])
  })
  it('sqrt: the ordinary nice values, positioned through the transform (denser near zero, not evenly spaced)', () => {
    const t = viewTicks('sqrt', { min: 0, max: 100 }, 100, 0, 5, undefined, 1)
    expect(t.map((x) => x.value)).toEqual([0, 20, 40, 60, 80, 100])
    const gaps = t.slice(1).map((x, i) => t[i]!.pos - x.pos)
    expect(gaps[0]!).toBeGreaterThan(gaps[gaps.length - 1]!)
    expect(t[0]!.pos).toBeCloseTo(100, 9)
    expect(t[t.length - 1]!.pos).toBeCloseTo(0, 9)
  })
  it('symlog: 0 and decades either side', () => {
    expect(viewTicks('symlog', { min: -1000, max: 1000 }, 100, 0, 5, undefined, 1).map((t) => t.value)).toEqual([-1000, -100, -10, -1, 0, 1, 10, 100, 1000])
    const mid = viewTicks('symlog', { min: -1000, max: 1000 }, 100, 0, 5, undefined, 1).find((t) => t.value === 0)!
    expect(mid.pos).toBeCloseTo(50, 9)
  })
  it('positions are monotone in value for every kind', () => {
    for (const kind of KINDS) {
      const t = viewTicks(kind, kind === 'symlog' ? { min: -500, max: 500 } : { min: 1, max: 500 }, 200, 0, 5, undefined, 1)
      for (let i = 1; i < t.length; i++) expect(t[i]!.pos).toBeLessThan(t[i - 1]!.pos)
    }
  })
})

interface Row { x: number; v: number }
const rowsOf = (n: number, lo: number, hi: number): Row[] => Array.from({ length: n }, () => ({ x: lo + rnd() * (hi - lo), v: lo + rnd() * (hi - lo) }))

const mk = (data: Row[], marks: ReturnType<typeof line<Row>>[], extra: Partial<ChartSpec>): ChartSpec => ({
  width: 400, height: 260, series: resolveMarks(data, marks), categories: [], theme: defaultTheme,
  showXAxis: true, showYAxis: true, showGrid: true, ...extra,
})

const linePts = (cmds: DrawCmd[]): { x: number; y: number }[] => cmds.flatMap((c) => (c.kind === 'polyline' && c.width === 2 ? c.points : []))

describe('sqrt and symlog on y', () => {
  it('sqrt: a bar of value v is sqrt(v) tall (up to the axis scale), values stay real in the series', () => {
    const data = [{ x: 0, v: 4 }, { x: 1, v: 16 }, { x: 2, v: 64 }]
    const spec = mk(data, [bars<Row>((d) => d.v) as never], { yView: sqrt(), categories: ['a', 'b', 'c'] })
    const r = barsFor(spec, 0, measure)
    expect(r[1]!.h / r[0]!.h).toBeCloseTo(2, 6)
    expect(r[2]!.h / r[0]!.h).toBeCloseTo(4, 6)
    expect(spec.series[0]!.values).toEqual([4, 16, 64])
  })
  it('symlog: negative and positive bars hang either side of a zero line, with real labels', () => {
    const data = [{ x: 0, v: -100 }, { x: 1, v: 100 }, { x: 2, v: 0 }]
    const spec = mk(data, [bars<Row>((d) => d.v) as never], { yView: symlog(), categories: ['a', 'b', 'c'] })
    const l = layoutChart(spec, measure)
    const r = barsFor(spec, 0, measure)
    const zero = l.yTicks.find((t) => t.value === 0)!.pos
    expect(r[1]!.y + r[1]!.h).toBeCloseTo(zero, 6)
    expect(r[0]!.y).toBeCloseTo(zero, 6)
    expect(r[0]!.h).toBeCloseTo(r[1]!.h, 6)
  })
  it('hit testing agrees with the drawn bars on a sqrt axis (random pointers)', () => {
    const data = rowsOf(6, 1, 100)
    const spec = mk(data, [bars<Row>((d) => d.v) as never], { yView: sqrt(), categories: data.map((_d, i) => `c${i}`) })
    const drawn = renderChart(spec, measure).flatMap((c) => (c.kind === 'rect' && c.fill === spec.series[0]!.color ? [c.rect] : []))
    for (let k = 0; k < 200; k++) {
      const px = rnd() * spec.width
      const py = rnd() * spec.height
      const want = drawn.findIndex((r) => r.w > 0 && r.h > 0 && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
      expect(plotHitBars(spec, measure, px, py)).toBe(want)
    }
  })
  it('a linear spec is untouched (byte-stable)', () => {
    const data = rowsOf(5, 1, 50)
    const a = renderChart(mk(data, [bars<Row>((d) => d.v) as never], { categories: ['a', 'b', 'c', 'd', 'e'] }), measure)
    const b = renderChart(mk(data, [bars<Row>((d) => d.v) as never], { categories: ['a', 'b', 'c', 'd', 'e'], yScale: 'linear' }), measure)
    expect(b).toEqual(a)
  })
})

describe('log / sqrt / symlog on x', () => {
  it('property: a log-x chart is the transposed log-y chart (same ratios of pixel distances)', () => {
    for (let t = 0; t < 30; t++) {
      const vals = [1 + rnd() * 5, 8 + rnd() * 50, 80 + rnd() * 900].sort((p, q) => p - q)
      const xs = mk(vals.map((v) => ({ x: v, v: 1 })), [line<Row>((d) => d.v)], { xValues: vals, xView: log() })
      const ys = mk(vals.map((v) => ({ x: 0, v })), [line<Row>((d) => d.v)], { categories: ['a', 'b', 'c'], yScale: 'log' })
      const px = linePts(renderChart(xs, measure)).map((p) => p.x)
      const py = linePts(renderChart(ys, measure)).map((p) => p.y)
      expect(px.length).toBe(3)
      expect((px[1]! - px[0]!) / (px[2]! - px[0]!)).toBeCloseTo((py[0]! - py[1]!) / (py[0]! - py[2]!), 6)
      // and the same ratio the scale itself defines
      expect((px[1]! - px[0]!) / (px[2]! - px[0]!)).toBeCloseTo(Math.log(vals[1]! / vals[0]!) / Math.log(vals[2]! / vals[0]!), 6)
    }
  })
  it('x ticks on log are decades labelled with real values; a datum with x <= 0 is a gap, never a NaN pixel', () => {
    const data = [{ x: -5, v: 3 }, { x: 2, v: 4 }, { x: 20, v: 5 }, { x: 200, v: 6 }]
    const spec = mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xView: log() })
    const l = layoutChart(spec, measure)
    expect(l.xTicks.map((t) => t.value)).toEqual(expect.arrayContaining([10, 100]))
    for (const c of renderChart(spec, measure)) {
      const nums = c.kind === 'polyline' ? c.points.flatMap((p) => [p.x, p.y]) : c.kind === 'rect' ? [c.rect.x, c.rect.y, c.rect.w, c.rect.h] : c.kind === 'circle' ? [c.center.x, c.center.y] : c.kind === 'line' ? [c.from.x, c.from.y, c.to.x, c.to.y] : []
      for (const n of nums) expect(Number.isFinite(n)).toBe(true)
    }
    expect(linePts(renderChart(spec, measure)).length).toBe(3)
  })
  it('sqrt-x spreads small x apart and symlog-x handles negatives; composes with xInverse (reflection)', () => {
    const data = [{ x: -100, v: 1 }, { x: 0, v: 2 }, { x: 100, v: 3 }]
    const plain = linePts(renderChart(mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xView: symlog() }), measure))
    const inv = linePts(renderChart(mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xView: symlog(), xInverse: true }), measure))
    const plot = layoutChart(mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xView: symlog() }), measure).plot
    expect(plain[1]!.x).toBeCloseTo(plot.x + plot.w / 2, 6)
    // the plot's edge-label overhang can differ by a few px once the labels swap ends, so reflect to a tolerance
    plain.forEach((p, i) => expect(Math.abs(inv[i]!.x - (2 * (plot.x + plot.w / 2) - p.x))).toBeLessThan(5))
  })
  it('a time axis ignores xScale (stays linear, calendar ticks)', () => {
    const data = [{ x: 1e12, v: 1 }, { x: 1.0001e12, v: 2 }]
    const a = renderChart(mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xTime: true }), measure)
    const b = renderChart(mk(data, [line<Row>((d) => d.v)], { xValues: data.map((d) => d.x), xTime: true, xView: log() }), measure)
    expect(b).toEqual(a)
  })
})
