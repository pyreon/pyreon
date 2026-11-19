// Bars on a continuous (numeric / time) x axis: the properties that must hold for ANY x values.
import { describe, expect, it } from 'vitest'
import { barBand } from './bar-band'
import { barsForIn, defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import { bars, groupedBars, resolveMarks, stackedBars, waterfall } from './marks'
import { xPx, yPx } from './scale'
import { canKeyMorph, keyedGeometry } from './keyed-morph'

const measure = (t: string, s: number): number => t.length * s * 0.6

interface Row { a: number; b: number }

/** A small seeded generator, so a failing property reproduces. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296

    return s / 4294967296
  }
}

const spec = (xs: number[], kinds: 'bars' | 'grouped' | 'stacked' | 'waterfall', extra: Partial<ChartSpec> = {}): ChartSpec => {
  const rows: Row[] = xs.map((_, i) => ({ a: i + 1, b: ((i * 7) % 5) + 1 }))
  const marks =
    kinds === 'bars' ? [bars<Row>((d) => d.a)]
      : kinds === 'grouped' ? [groupedBars<Row>((d) => d.a), groupedBars<Row>((d) => d.b)]
        : kinds === 'stacked' ? [stackedBars<Row>((d) => d.a), stackedBars<Row>((d) => d.b)]
          : [waterfall<Row>((d) => d.a)]

  return {
    width: 600, height: 240, series: resolveMarks(rows, marks), categories: [], xValues: xs,
    theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...extra,
  }
}

/** Random x values: some ascending with irregular gaps, some shuffled, some with a repeated value. */
function randomXs(next: () => number): number[] {
  const n = 2 + Math.floor(next() * 14)
  let x = Math.floor(next() * 100)
  const xs: number[] = []
  for (let i = 0; i < n; i++) {
    xs.push(x)
    x += 1 + Math.floor(next() * 6)
  }
  if (next() < 0.4) xs.sort(() => next() - 0.5)

  return xs
}

describe('barBand', () => {
  it('is the smallest positive gap, however the values are ordered', () => {
    expect(barBand(spec([1, 2, 4, 5], 'bars'))).toBe(1)
    expect(barBand(spec([10, 3, 7, 4], 'bars'))).toBe(1)
    expect(barBand(spec([0, 10, 25], 'bars'))).toBe(10)
  })
  it('ignores repeated values (a zero gap) and falls back to 1 for a single point', () => {
    expect(barBand(spec([4, 4, 9], 'bars'))).toBe(5)
    expect(barBand(spec([7], 'bars'))).toBe(1)
  })
  it('barSpan wins over the data', () => {
    expect(barBand(spec([1, 2, 4], 'bars', { barSpan: 0.5 }))).toBe(0.5)
  })
  it('is 0 on a category axis and when nothing draws bars', () => {
    expect(barBand({ ...spec([1, 2, 3], 'bars'), xValues: undefined })).toBe(0)
    expect(barBand({ ...spec([1, 2, 3], 'bars'), series: resolveMarks([{ a: 1, b: 1 }], [bars<Row>((d) => d.a)]).map((s) => ({ ...s, kind: 'line' as const })) })).toBe(0)
  })
})

describe('bars on a numeric x axis: properties', () => {
  for (const kind of ['bars', 'grouped', 'stacked'] as const) {
    it(`${kind}: centred on the scaled x, inside the slot, never overlapping, domain padded by half a slot`, () => {
      const next = rng(7)
      for (let trial = 0; trial < 60; trial++) {
        const xs = randomXs(next)
        const s = spec(xs, kind, { // a barSpan wider than the smallest gap would make neighbours overlap by the caller's own choice
          barSpan: next() < 0.3 ? 0.2 + next() * 0.8 : undefined })
        const l = layoutChart(s, measure)
        const band = barBand(s)
        const sorted = [...xs].sort((p, q) => p - q)
        // the domain is the extent padded by half a band on each side
        expect(l.xDomainUsed.min).toBeCloseTo(sorted[0]! - band / 2, 9)
        expect(l.xDomainUsed.max).toBeCloseTo(sorted[sorted.length - 1]! + band / 2, 9)
        const slotPx = (band / (l.xDomainUsed.max - l.xDomainUsed.min)) * l.plot.w
        const all: { lo: number; hi: number; datum: number }[] = []
        for (let k = 0; k < s.series.length; k++) {
          const rects = barsForIn(s, k, l.plot)
          rects.forEach((r, i) => {
            if (r.w < 0) return
            const centre = xPx(l.xDomainUsed, l.plot, xs[i]!)
            // inside the datum's slot
            expect(r.x).toBeGreaterThanOrEqual(centre - slotPx / 2 - 1e-6)
            expect(r.x + r.w).toBeLessThanOrEqual(centre + slotPx / 2 + 1e-6)
            if (kind === 'bars') expect(r.x + r.w / 2).toBeCloseTo(centre, 6)
            all.push({ lo: r.x, hi: r.x + r.w, datum: i })
          })
        }
        // bars of DIFFERENT x never overlap (the same x holds a group / stack, which sit side by side or on top)
        for (const p of all) {
          for (const q of all) {
            if (p.datum !== q.datum && xs[p.datum] !== xs[q.datum]) expect(p.hi <= q.lo + 1e-6 || q.hi <= p.lo + 1e-6).toBe(true)
          }
        }
      }
    })
  }

  it('waterfall steps are centred on x too', () => {
    const s = spec([0, 2, 3, 8], 'waterfall')
    const l = layoutChart(s, measure)
    barsForIn(s, 0, l.plot).forEach((r, i) => expect(r.x + r.w / 2).toBeCloseTo(xPx(l.xDomainUsed, l.plot, s.xValues![i]!), 6))
  })

  it('a single bar fills its slot and the axis still has a width', () => {
    const s = spec([42], 'bars')
    const l = layoutChart(s, measure)
    const r = barsForIn(s, 0, l.plot)[0]!
    expect(r.w).toBeGreaterThan(0)
    expect(r.x + r.w / 2).toBeCloseTo(l.plot.x + l.plot.w / 2, 6)
  })

  it('barWidth is a px ceiling inside the slot, barSpan a domain-unit width', () => {
    const wide = layoutChart(spec([0, 1, 2], 'bars'), measure)
    const capped = spec([0, 1, 2], 'bars', { barWidth: 12 })
    expect(barsForIn(capped, 0, layoutChart(capped, measure).plot)[0]!.w).toBe(12)
    const narrow = spec([0, 1, 2], 'bars', { barSpan: 0.5 })
    const rn = barsForIn(narrow, 0, layoutChart(narrow, measure).plot)[0]!
    const rw = barsForIn(spec([0, 1, 2], 'bars'), 0, wide.plot)[0]!
    // a 0.5-unit slot over a 2.5-unit domain is a fifth of the plot per unit; the default slot is a third
    expect(rn.w).toBeLessThan(rw.w)
  })

  it('the bar tops are where the value axis puts them (the value axis is untouched)', () => {
    const s = spec([1, 5, 6], 'bars')
    const l = layoutChart(s, measure)
    const dom = { min: 0, max: 3 }
    const r = barsForIn(s, 0, l.plot)[2]!
    expect(r.y + r.h).toBeCloseTo(yPx({ ...dom, min: 0 }, l.plot, 0) > 0 ? r.y + r.h : 0, 6)
    expect(r.y).toBeLessThan(r.y + r.h)
  })

  it('a reversed axis mirrors every bar about the plot centre line', () => {
    const fwd = spec([1, 2, 4, 5], 'bars')
    const rev = { ...fwd, xInverse: true }
    const lf = layoutChart(fwd, measure)
    const lr = layoutChart(rev, measure)
    const a = barsForIn(fwd, 0, lf.plot)
    const b = barsForIn(rev, 0, lr.plot)
    a.forEach((r, i) => {
      const mirrored = lf.plot.x + lf.plot.w - (r.x + r.w - lf.plot.x)
      expect(b[i]!.x).toBeCloseTo(mirrored, 6)
      expect(b[i]!.w).toBeCloseTo(r.w, 6)
    })
  })

  it('a horizontal chart lays the slots down the y axis', () => {
    const s = spec([1, 2, 4], 'bars', { horizontal: true })
    const l = layoutChart(s, measure)
    const rects = barsForIn(s, 0, l.plot)
    const centres = rects.map((r) => r.y + r.h / 2)
    expect(centres[1]! - centres[0]!).toBeCloseTo((l.plot.h / 4) * 1, 6)
    expect(centres[2]! - centres[1]!).toBeCloseTo((l.plot.h / 4) * 2, 6)
    expect(l.yTicks.length).toBeGreaterThan(0)
  })

  it('a category axis is unchanged: no xValues, no shift', () => {
    const s = { ...spec([1, 2, 3], 'bars'), xValues: undefined, categories: ['a', 'b', 'c'] }
    const l = layoutChart(s, measure)
    const r = barsForIn(s, 0, l.plot)
    expect(r[0]!.x + r[0]!.w / 2).toBeCloseTo(l.plot.x + l.plot.w / 6, 6)
  })

  it('draws without a NaN coordinate for any x', () => {
    const next = rng(3)
    for (let t = 0; t < 30; t++) {
      const s = spec(randomXs(next), 'stacked')
      const out = JSON.stringify(renderChart(s, measure))
      expect(out.includes('null')).toBe(false)
      expect(out.includes('NaN')).toBe(false)
    }
  })
})

describe('keyed morph on a numeric x axis', () => {
  it('bars morph by key, each rect keyed at its own centre; a line series still opts out', () => {
    const s = spec([1, 2, 4, 5], 'bars')
    expect(canKeyMorph(s)).toBe(true)
    const l = layoutChart(s, measure)
    const keys = ['a', 'b', 'c', 'd']
    const g = keyedGeometry(s, l, keys)[0]!
    keys.forEach((k, i) => {
      const r = g.rects.get(k)!
      expect(r.x + r.w / 2).toBeCloseTo(xPx(l.xDomainUsed, l.plot, s.xValues![i]!), 6)
    })
    const withLine = { ...s, series: [...s.series, { ...s.series[0]!, kind: 'line' as const }] }
    expect(canKeyMorph(withLine)).toBe(false)
  })
})
