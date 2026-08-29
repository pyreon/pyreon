import { describe, expect, it } from 'vitest'
import { computeLayout, hitBar, hitNearestX, layoutBars, layoutSeriesPoints } from './layout'
import { extent, formatTick, makeTicks, niceDomain, niceStep, scaleLinear } from './scale'
import { defaultTheme, layoutChart, renderChart, resolveYDomain, seriesMaxLength } from './render'
import { bars as barsMark, resolveCategories, resolveMarks } from './marks'
import { compact, currency } from './format'
import type { ChartSpec, Series } from './render'
import type { MeasureText, Double } from './types'

/** Deterministic stand-in for a platform's font metrics. */
const measure: MeasureText = (text, size) => text.length * size * 0.6

const bars = (values: Double[]): Series => ({
  kind: 'bars', values, color: '#0f766e', width: 1.0, radius: 2.0, label: 'S',
})
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400.0, height: 200.0, series: [bars([10, 20, 30])], categories: [],
  theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})

describe('scaleLinear', () => {
  it('maps the domain onto the range', () => {
    expect(scaleLinear({ min: 0, max: 10 }, 0, 100, 5)).toBe(50)
    expect(scaleLinear({ min: 0, max: 10 }, 0, 100, 0)).toBe(0)
    expect(scaleLinear({ min: 0, max: 10 }, 0, 100, 10)).toBe(100)
  })

  it('inverts when the range is inverted — screen y grows downward', () => {
    expect(scaleLinear({ min: 0, max: 10 }, 100, 0, 10)).toBe(0)
    expect(scaleLinear({ min: 0, max: 10 }, 100, 0, 0)).toBe(100)
  })

  /**
   * A flat series is real data, not an error. Dividing by a zero span would
   * return NaN and poison every coordinate downstream — the chart would vanish
   * with nothing to trace it by.
   */
  it('maps a degenerate domain to the range midpoint, never NaN', () => {
    const v = scaleLinear({ min: 5, max: 5 }, 0, 100, 5)
    expect(Number.isNaN(v)).toBe(false)
    expect(v).toBe(50)
  })
})

describe('niceStep', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceStep(0.8)).toBe(1)
    expect(niceStep(1.5)).toBe(2)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(7)).toBe(10)
    expect(niceStep(12)).toBe(20)
  })

  it('never returns zero or negative, whatever it is handed', () => {
    expect(niceStep(0)).toBeGreaterThan(0)
    expect(niceStep(-5)).toBeGreaterThan(0)
  })
})

describe('makeTicks', () => {
  it('lands on round values inside the domain', () => {
    const t = makeTicks({ min: 0, max: 100 }, 0, 200, 5)
    expect(t.map((x) => x.value)).toEqual([0, 20, 40, 60, 80, 100])
    expect(t[0]!.pos).toBe(0)
    expect(t[t.length - 1]!.pos).toBe(200)
  })

  it('is bounded — a huge domain cannot spin', () => {
    const t = makeTicks({ min: 0, max: 1e300 }, 0, 100, 5)
    expect(t.length).toBeLessThanOrEqual(1000)
  })

  it('yields one tick for a degenerate domain', () => {
    expect(makeTicks({ min: 5, max: 5 }, 0, 100, 5)).toHaveLength(1)
  })

  it('returns nothing when no ticks were asked for', () => {
    expect(makeTicks({ min: 0, max: 10 }, 0, 100, 0)).toHaveLength(0)
  })
})

describe('formatTick', () => {
  /** `0.1 + 0.2` arithmetic must not reach a label. */
  it('trims float noise', () => {
    expect(formatTick(0.30000000000000004)).toBe('0.3')
    expect(formatTick(3)).toBe('3')
    expect(formatTick(2.5)).toBe('2.5')
  })
})

describe('extent', () => {
  it('finds min and max', () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual({ min: 1, max: 5 })
  })
  it('gives an empty series a unit domain rather than Infinity', () => {
    expect(extent([])).toEqual({ min: 0, max: 1 })
  })
})

describe('niceDomain', () => {
  it('extends outward to round boundaries', () => {
    const d = niceDomain({ min: 3, max: 47 }, 5)
    expect(d.min).toBeLessThanOrEqual(3)
    expect(d.max).toBeGreaterThanOrEqual(47)
  })
  it('gives a flat domain room to breathe', () => {
    const d = niceDomain({ min: 5, max: 5 }, 5)
    expect(d.max).toBeGreaterThan(d.min)
  })
})

describe('layoutBars', () => {
  const plot = { x: 0, y: 0, w: 300, h: 100 }

  it('spaces bars evenly and keeps them inside the plot', () => {
    const r = layoutBars([10, 20, 30], plot, { min: 0, max: 30 }, 0.25)
    expect(r).toHaveLength(3)
    for (const b of r) {
      expect(b.x).toBeGreaterThanOrEqual(plot.x)
      expect(b.x + b.w).toBeLessThanOrEqual(plot.x + plot.w + 0.001)
      expect(b.y).toBeGreaterThanOrEqual(plot.y - 0.001)
    }
  })

  it('scales height by value — the tallest bar fills the plot', () => {
    const r = layoutBars([10, 20, 30], plot, { min: 0, max: 30 }, 0.25)
    expect(r[2]!.h).toBeCloseTo(100, 5)
    expect(r[0]!.h).toBeCloseTo(33.333, 2)
  })

  /** A negative value must hang below the zero line, not float above the floor. */
  it('measures from zero when the domain straddles it', () => {
    const r = layoutBars([-10, 10], plot, { min: -10, max: 10 }, 0.25)
    expect(r[0]!.y).toBeCloseTo(50, 5)
    expect(r[1]!.y + r[1]!.h).toBeCloseTo(50, 5)
  })

  it('clamps an absurd gap ratio instead of producing zero-width bars', () => {
    for (const g of [1, 5, -3]) {
      for (const b of layoutBars([1, 2], plot, { min: 0, max: 2 }, g)) {
        expect(b.w).toBeGreaterThan(0)
      }
    }
  })

  it('handles an empty series', () => {
    expect(layoutBars([], plot, { min: 0, max: 1 }, 0.25)).toHaveLength(0)
  })
})

describe('layoutSeriesPoints', () => {
  const plot = { x: 0, y: 0, w: 100, h: 100 }

  it('spans the plot edge to edge', () => {
    const p = layoutSeriesPoints([0, 5, 10], plot, { min: 0, max: 10 })
    expect(p[0]!.x).toBe(0)
    expect(p[2]!.x).toBe(100)
    expect(p[0]!.y).toBe(100)
    expect(p[2]!.y).toBe(0)
  })

  /** One point has no span to divide by — it must not produce NaN. */
  it('centres a single point', () => {
    const p = layoutSeriesPoints([5], plot, { min: 0, max: 10 })
    expect(p).toHaveLength(1)
    expect(p[0]!.x).toBe(50)
    expect(Number.isNaN(p[0]!.y)).toBe(false)
  })
})

describe('hit testing', () => {
  const plot = { x: 0, y: 0, w: 300, h: 100 }
  const rects = layoutBars([10, 20, 30], plot, { min: 0, max: 30 }, 0.25)

  it('finds the bar under a point', () => {
    const b = rects[1]!
    expect(hitBar(rects, b.x + b.w / 2, b.y + b.h / 2)).toBe(1)
  })
  it('returns -1 outside every bar', () => {
    expect(hitBar(rects, 1000, 1000)).toBe(-1)
  })
  it('finds the nearest point by x', () => {
    const p = layoutSeriesPoints([0, 5, 10], plot, { min: 0, max: 10 })
    expect(hitNearestX(p, 0)).toBe(0)
    expect(hitNearestX(p, 299)).toBe(2)
  })
  it('returns -1 for an empty series', () => {
    expect(hitNearestX([], 5)).toBe(-1)
  })
})

describe('computeLayout', () => {
  const base = {
    width: 400, height: 200, xDomain: { min: 0, max: 2 }, yDomain: { min: 0, max: 100 },
    categories: [] as string[], fontSize: 11, xTickCount: 5, yTickCount: 5,
    showXAxis: true, showYAxis: true,
  }

  /**
   * The gutter must follow the LABELS. A fixed guess clips wide ones and wastes
   * space on narrow ones, and only measurement can tell them apart.
   */
  it('widens the left gutter for wider y labels', () => {
    const narrow = computeLayout(base, measure)
    const wide = computeLayout({ ...base, yDomain: { min: 0, max: 1000000 } }, measure)
    expect(wide.plot.x).toBeGreaterThan(narrow.plot.x)
  })

  it('reclaims the gutters when the axes are hidden', () => {
    const off = computeLayout({ ...base, showXAxis: false, showYAxis: false }, measure)
    expect(off.plot.x).toBe(0)
    expect(off.plot.h).toBeGreaterThan(computeLayout(base, measure).plot.h)
  })

  it('never produces a negative plot, however cramped', () => {
    const tiny = computeLayout({ ...base, width: 10, height: 10 }, measure)
    expect(tiny.plot.w).toBeGreaterThanOrEqual(0)
    expect(tiny.plot.h).toBeGreaterThanOrEqual(0)
  })

  it('centres a band tick per category', () => {
    const l = computeLayout({ ...base, categories: ['a', 'b', 'c'] }, measure)
    expect(l.xTicks.map((t) => t.label)).toEqual(['a', 'b', 'c'])
    expect(l.xTicks[0]!.pos).toBeLessThan(l.xTicks[1]!.pos)
  })
})

describe('resolveYDomain', () => {
  /** A bar chart that does not include zero misrepresents proportion. */
  it('includes zero for bars even when the data sits far above it', () => {
    expect(resolveYDomain(spec({ series: [bars([100, 110, 120])] })).min).toBe(0)
  })

  /** Forcing zero onto a line of temperatures flattens everything that matters. */
  it('does NOT force zero for a line series', () => {
    const s = spec({
      series: [{ kind: 'line', values: [300, 310, 305], color: '#000', width: 2, radius: 2, label: 'S' }],
    })
    expect(resolveYDomain(s).min).toBeGreaterThan(0)
  })

  it('honours an explicit domain verbatim', () => {
    expect(resolveYDomain(spec({ yDomain: { min: -5, max: 5 } }))).toEqual({ min: -5, max: 5 })
  })
})

describe('renderChart', () => {
  it('emits the grid, both axes, a rect per bar, and every label', () => {
    const cmds = renderChart(spec(), measure)
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(3)
    expect(cmds.filter((c) => c.kind === 'text').length).toBeGreaterThan(0)
    expect(cmds.filter((c) => c.kind === 'line').length).toBeGreaterThan(2)
  })

  /** Painter's order: a bar must never be bisected by a gridline drawn over it. */
  it('draws series after the grid and labels last', () => {
    const cmds = renderChart(spec(), measure)
    const lastLine = cmds.map((c) => c.kind).lastIndexOf('line')
    const firstRect = cmds.findIndex((c) => c.kind === 'rect')
    const firstText = cmds.findIndex((c) => c.kind === 'text')
    expect(firstRect).toBeGreaterThan(lastLine)
    expect(firstText).toBeGreaterThan(firstRect)
  })

  it('renders each mark kind as its own primitive', () => {
    const mk = (kind: Series['kind']): Series => ({
      kind, values: [1, 2, 3], color: '#000', width: 2, radius: 3, label: 'S',
    })
    expect(renderChart(spec({ series: [mk('line')] }), measure).some((c) => c.kind === 'polyline')).toBe(true)
    expect(renderChart(spec({ series: [mk('area')] }), measure).some((c) => c.kind === 'polygon')).toBe(true)
    expect(renderChart(spec({ series: [mk('points')] }), measure).some((c) => c.kind === 'circle')).toBe(true)
  })

  it('closes an area down to the baseline, not between endpoints', () => {
    const s = spec({
      series: [{ kind: 'area', values: [5, 8, 6], color: '#000', width: 2, radius: 2, label: 'S' }],
    })
    const poly = renderChart(s, measure).find((c) => c.kind === 'polygon')
    expect(poly).toBeDefined()
    if (poly?.kind === 'polygon') expect(poly.points.length).toBe(5)
  })

  it('survives an empty chart without throwing', () => {
    expect(() => renderChart(spec({ series: [] }), measure)).not.toThrow()
    expect(() => renderChart(spec({ series: [bars([])] }), measure)).not.toThrow()
  })

  it('emits no NaN coordinate for any input, including flat and single-point', () => {
    for (const values of [[5, 5, 5], [7], [], [-3, 0, 3]]) {
      for (const c of renderChart(spec({ series: [bars(values)] }), measure)) {
        const nums =
          c.kind === 'rect' ? [c.rect.x, c.rect.y, c.rect.w, c.rect.h]
          : c.kind === 'line' ? [c.from.x, c.from.y, c.to.x, c.to.y]
          : c.kind === 'circle' ? [c.center.x, c.center.y, c.radius]
          : c.kind === 'text' ? [c.at.x, c.at.y]
          : c.points.flatMap((p) => [p.x, p.y])
        for (const n of nums) expect(Number.isFinite(n)).toBe(true)
      }
    }
  })

  it('hides what it is told to hide', () => {
    const bare = renderChart(
      spec({ showGrid: false, showXAxis: false, showYAxis: false }), measure,
    )
    expect(bare.filter((c) => c.kind === 'line')).toHaveLength(0)
    expect(bare.filter((c) => c.kind === 'text')).toHaveLength(0)
    expect(bare.filter((c) => c.kind === 'rect')).toHaveLength(3)
  })
})

describe('seriesMaxLength', () => {
  it('takes the longest series', () => {
    expect(seriesMaxLength([bars([1, 2]), bars([1, 2, 3, 4])])).toBe(4)
    expect(seriesMaxLength([])).toBe(0)
  })
})
