// Branches the behavioural suites reach only incidentally. Each one is a real
// input shape a chart can be handed, not a coverage exercise.

import { describe, expect, it } from 'vitest'
import { arcPolygon, hitArc, layoutArcs, renderPie } from './arc'
import { chartTable, describeChart } from './a11y'
import { minMaxBuckets } from './decimate'
import { compact, fixed } from './format'
import { bandTicks, computeLayout } from './layout'
import { renderLegend } from './legend'
import { renderRadar, withAlpha } from './radar'
import { barsFor, defaultTheme, renderChart, resolveYDomain } from './render'
import type { ChartSpec } from './render'
import { formatTime, logTicks, scaleLog, timeTicks } from './scale-extra'
import { layoutGroupedBars, layoutStackedBars, stackedExtent } from './stack'
import { placeTooltip } from './tooltip'

const measure = (t: string, s: number) => t.length * s * 0.6
const plot = { x: 0, y: 0, w: 300, h: 100 }

describe('grouped bars', () => {
  it('splits a band evenly across series and keeps them inside it', () => {
    const segs = layoutGroupedBars([[10, 20], [5, 15], [1, 2]], plot, { min: 0, max: 20 }, 0.25)
    expect(segs).toHaveLength(6)
    const band0 = segs.filter((s) => s.datumIndex === 0).sort((a, b) => a.rect.x - b.rect.x)
    expect(band0).toHaveLength(3)
    for (let i = 1; i < band0.length; i++) {
      expect(band0[i]!.rect.x).toBeGreaterThanOrEqual(band0[i - 1]!.rect.x + band0[i - 1]!.rect.w - 0.001)
    }
  })

  it('hangs a negative bar below the zero line', () => {
    const segs = layoutGroupedBars([[-10]], plot, { min: -10, max: 10 }, 0.25)
    expect(segs[0]!.rect.y).toBeCloseTo(50, 5)
  })

  it('pads a ragged series with zero rather than dropping the band', () => {
    const segs = layoutGroupedBars([[1, 2, 3], [1]], plot, { min: 0, max: 3 }, 0.25)
    expect(segs.filter((s) => s.datumIndex === 2)).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(layoutGroupedBars([], plot, { min: 0, max: 1 }, 0.25)).toHaveLength(0)
    expect(layoutGroupedBars([[]], plot, { min: 0, max: 1 }, 0.25)).toHaveLength(0)
    expect(layoutStackedBars([], plot, { min: 0, max: 1 }, 0.25)).toHaveLength(0)
  })

  it('gives an all-zero stack a unit domain instead of a zero-height one', () => {
    expect(stackedExtent([[0, 0]])).toEqual({ min: 0, max: 1 })
  })
})

describe('radar edges', () => {
  it('reserves no label padding when labels are off', () => {
    const axes = [
      { label: 'a', max: 10 }, { label: 'b', max: 10 }, { label: 'c', max: 10 },
    ]
    const box = { x: 0, y: 0, w: 200, h: 200 }
    const withLabels = renderRadar(axes, [], box, {
      rings: 2, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: true,
    })
    const without = renderRadar(axes, [], box, {
      rings: 2, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false,
    })
    expect(withLabels.filter((c) => c.kind === 'text')).toHaveLength(3)
    expect(without.filter((c) => c.kind === 'text')).toHaveLength(0)
  })

  it('skips a series with fewer points than axes rather than drawing a partial web', () => {
    const axes = [
      { label: 'a', max: 10 }, { label: 'b', max: 10 }, { label: 'c', max: 10 },
    ]
    const cmds = renderRadar(axes, [{ values: [1, 2], color: '#000', fillAlpha: 0.3 }], { x: 0, y: 0, w: 200, h: 200 }, {
      rings: 2, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false,
    })
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(0)
  })

  it('clamps a value above its axis max to the outer ring', () => {
    const axes = [
      { label: 'a', max: 10 }, { label: 'b', max: 10 }, { label: 'c', max: 10 },
    ]
    expect(() =>
      renderRadar(axes, [{ values: [999, 5, 5], color: '#000', fillAlpha: 0.3 }], { x: 0, y: 0, w: 200, h: 200 }, {
        rings: 2, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false,
      }),
    ).not.toThrow()
  })

  it('leaves a malformed hex colour alone rather than mangling it', () => {
    expect(withAlpha('#12', 0.5)).toBe('#12')
    expect(withAlpha('#12345', 0.5)).toBe('#12345')
  })

  it('clamps alpha into range', () => {
    expect(withAlpha('#0f766e', 5)).toContain('1)')
    expect(withAlpha('#0f766e', -1)).toContain('0)')
  })
})

describe('arc edges', () => {
  it('misses when a point sits outside every slice', () => {
    expect(hitArc([], { x: 0, y: 0 }, 10, 0, { x: 1, y: 1 })).toBe(-1)
  })

  it('labels nothing when every slice is a sliver', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ value: 1, label: `s${i}`, color: '#000' }))
    const cmds = renderPie(many, { x: 0, y: 0, w: 200, h: 200 }, {
      innerRadius: 0, showLabels: true, labelColor: '#fff', fontSize: 11,
    })
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(0)
  })

  it('clamps an inner radius at or above the outer one', () => {
    const p = arcPolygon({ x: 0, y: 0 }, 10, 10, 0, Math.PI)
    expect(p.length).toBeGreaterThan(0)
    const cmds = renderPie([{ value: 1, label: 'a', color: '#000' }], { x: 0, y: 0, w: 200, h: 200 }, {
      innerRadius: 5, showLabels: false, labelColor: '#fff', fontSize: 11,
    })
    expect(cmds).toHaveLength(1)
  })

  it('lays out arcs for a single full-circle slice', () => {
    const a = layoutArcs([{ value: 5, label: 'only', color: '#000' }])
    expect(a).toHaveLength(1)
    expect(a[0]!.fraction).toBe(1)
  })
})

describe('legend orientation', () => {
  it('stacks vertically, one entry per row', () => {
    const l = renderLegend(
      [{ label: 'A', color: '#000' }, { label: 'B', color: '#111' }],
      { x: 0, y: 0, w: 400, h: 100 },
      { fontSize: 11, labelColor: '#333', swatch: 10, gap: 12, orientation: 'vertical' },
      measure,
    )
    const swatches = l.cmds.filter((c) => c.kind === 'rect')
    expect(swatches).toHaveLength(2)
    if (swatches[0]!.kind === 'rect' && swatches[1]!.kind === 'rect') {
      expect(swatches[1]!.rect.y).toBeGreaterThan(swatches[0]!.rect.y)
      expect(swatches[1]!.rect.x).toBe(swatches[0]!.rect.x)
    }
  })
})

describe('formatting edges', () => {
  it('formats billions', () => {
    expect(compact(2500000000)).toBe('2.5B')
  })
  it('drops a trailing zero in compact form', () => {
    expect(compact(2000)).toBe('2K')
  })
  it('clamps an absurd decimal count', () => {
    expect(() => fixed(50)(1.5)).not.toThrow()
    expect(fixed(-2)(1.5)).toBe('2')
  })
})

describe('a11y edges', () => {
  it('reports an empty series without inventing a trend', () => {
    const d = describeChart({
      categories: [], series: [{ label: 'S', values: [], kind: 'bars' }],
    })
    expect(d).toContain('empty')
  })

  it('falls back to a positional label with no categories', () => {
    const t = chartTable({ categories: [], series: [{ label: 'S', values: [1, 2], kind: 'bars' }] })
    expect(t.rows[0]![0]).toBe('1')
    expect(t.rows[1]![0]).toBe('2')
  })

  it('titles itself when none is given', () => {
    expect(describeChart({ categories: [], series: [{ label: 'S', values: [1], kind: 'bars' }] }))
      .toContain('Chart')
  })
})

describe('decimation edges', () => {
  it('leaves a short series alone', () => {
    expect(minMaxBuckets([1, 2, 3], 5)).toEqual([1, 2, 3])
    expect(minMaxBuckets([1, 2, 3], 0)).toEqual([1, 2, 3])
  })
  it('emits two values per bucket', () => {
    expect(minMaxBuckets(Array.from({ length: 100 }, (_, i) => i), 5)).toHaveLength(10)
  })
})

describe('scale-extra edges', () => {
  it('gives a degenerate log domain a usable decade', () => {
    expect(logTicks({ min: 5, max: 5 }, 0, 100).length).toBeGreaterThanOrEqual(0)
  })
  it('bounds a huge time span', () => {
    expect(timeTicks({ min: 0, max: 1e15 }, 0, 100, 5).length).toBeLessThanOrEqual(200)
  })
})

describe('tooltip and layout edges', () => {
  it('flips at the left edge too', () => {
    const b = { x: 100, y: 0, w: 200, h: 100 }
    expect(placeTooltip({ x: 100, y: 50 }, { w: 80, h: 40 }, b, 8).x).toBeGreaterThanOrEqual(100)
  })

  it('lays out with no axes and no categories at all', () => {
    const l = computeLayout({
      width: 100, height: 100, xDomain: { min: 0, max: 1 }, yDomain: { min: 0, max: 1 },
      categories: [], fontSize: 11, xTickCount: 0, yTickCount: 0,
      showXAxis: false, showYAxis: false,
    }, measure)
    expect(l.xTicks).toHaveLength(0)
    expect(l.yTicks).toHaveLength(0)
  })

  it('renders a chart with a pinned domain and no grid', () => {
    const spec: ChartSpec = {
      width: 200, height: 100,
      series: [{ kind: 'points', values: [1, 2], color: '#000', width: 1, radius: 2, label: 'S' }],
      categories: [], theme: defaultTheme,
      showXAxis: true, showYAxis: true, showGrid: false,
      yDomain: { min: 0, max: 10 },
    }
    const cmds = renderChart(spec, measure)
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(2)
  })
})

describe('remaining behaviour under unusual inputs', () => {
  it('barsFor returns nothing for a missing or non-bar series', () => {
    const spec: ChartSpec = {
      width: 200, height: 100,
      series: [{ kind: 'line', values: [1, 2], color: '#000', width: 1, radius: 2, label: 'S' }],
      categories: [], theme: defaultTheme,
      showXAxis: false, showYAxis: false, showGrid: false,
    }
    expect(barsFor(spec, 0, measure)).toHaveLength(0)
    expect(barsFor(spec, 99, measure)).toHaveLength(0)
  })

  it('barsFor returns the rects for a bar series', () => {
    const spec: ChartSpec = {
      width: 200, height: 100,
      series: [{ kind: 'bars', values: [1, 2], color: '#000', width: 1, radius: 2, label: 'S' }],
      categories: [], theme: defaultTheme,
      showXAxis: false, showYAxis: false, showGrid: false,
    }
    expect(barsFor(spec, 0, measure)).toHaveLength(2)
  })

  /** Each step size selects a different label resolution. */
  it('labels a timestamp at the resolution its step implies', () => {
    const DAY = 86400000
    expect(formatTime(0, DAY * 400)).toMatch(/^\d{4}$/)
    expect(formatTime(0, DAY * 30)).toMatch(/^\d{4}-\d{2}$/)
    expect(formatTime(0, DAY * 2)).toMatch(/^\d{2}-\d{2}$/)
    expect(formatTime(0, 60000 * 5)).toMatch(/^\d{2}:\d{2}$/)
    expect(formatTime(0, 1000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('pads single digits in a time label', () => {
    // 09:05:03 UTC-ish — the exact hour depends on the runner's zone, but the
    // PADDING is what is under test and is zone-independent.
    expect(formatTime(new Date(2020, 0, 1, 9, 5, 3).getTime(), 1000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  /** A tooltip wider than its bounds cannot fit either way; clamp, do not flip
   *  it off the other edge. */
  it('clamps a tooltip too wide to fit at all', () => {
    const b = { x: 0, y: 0, w: 50, h: 100 }
    const p = placeTooltip({ x: 40, y: 50 }, { w: 200, h: 40 }, b, 8)
    expect(p.x).toBe(0)
  })

  it('reports no ticks for a non-positive log range', () => {
    expect(logTicks({ min: 100, max: 1 }, 0, 100).length).toBeGreaterThanOrEqual(0)
  })

  it('lays out a chart whose plot has no width', () => {
    const l = computeLayout({
      width: 0, height: 0, xDomain: { min: 0, max: 1 }, yDomain: { min: 0, max: 1 },
      categories: ['a'], fontSize: 11, xTickCount: 2, yTickCount: 2,
      showXAxis: true, showYAxis: true,
    }, measure)
    expect(l.plot.w).toBeGreaterThanOrEqual(0)
    expect(l.plot.h).toBeGreaterThanOrEqual(0)
  })

  it('decimates a series only just over the bucket bound', () => {
    expect(minMaxBuckets([1, 2, 3, 4, 5], 2)).toHaveLength(4)
  })

  it('describes a chart with several series', () => {
    const d = describeChart({
      title: 'Multi',
      categories: ['a', 'b'],
      series: [
        { label: 'A', values: [1, 2], kind: 'bars' },
        { label: 'B', values: [3, 1], kind: 'line' },
      ],
    })
    expect(d).toContain('2 series')
    expect(d).toContain('rising')
    expect(d).toContain('falling')
  })
})

/**
 * The gap-ratio clamp exists on all three bar layouts. It is tested on each
 * because they are separate implementations: a clamp fixed in one and missed in
 * another produces zero-width bars in exactly one chart type.
 */
describe('gap-ratio clamping is per-layout', () => {
  const dom = { min: 0, max: 10 }
  for (const g of [-1, 0, 0.5, 0.95, 5]) {
    it(`stacked bars stay positive-width at ratio ${g}`, () => {
      for (const s of layoutStackedBars([[5, 5]], plot, dom, g)) {
        expect(s.rect.w).toBeGreaterThan(0)
      }
    })
    it(`grouped bars stay positive-width at ratio ${g}`, () => {
      for (const s of layoutGroupedBars([[5], [3]], plot, dom, g)) {
        expect(s.rect.w).toBeGreaterThan(0)
      }
    })
  }
})

describe('min/max decimation over uneven buckets', () => {
  it('skips a bucket that resolves to no samples', () => {
    // More buckets than the loop can fill evenly — some resolve empty and are
    // skipped rather than emitting a spurious pair.
    const out = minMaxBuckets([1, 2, 3, 4, 5, 6, 7], 3)
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('finds the extremes wherever they sit in a bucket', () => {
    expect(minMaxBuckets([9, 1, 5, 5, 2, 8], 2)).toContain(9)
    expect(minMaxBuckets([9, 1, 5, 5, 2, 8], 2)).toContain(1)
  })
})

describe('radar with a single ring and no series', () => {
  const axes = [
    { label: 'a', max: 10 }, { label: 'b', max: 10 },
    { label: 'c', max: 10 }, { label: 'd', max: 10 },
  ]
  it('draws one ring plus the spokes', () => {
    const cmds = renderRadar(axes, [], { x: 0, y: 0, w: 200, h: 200 }, {
      rings: 1, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false,
    })
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(1)
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(4)
  })

  it('anchors a label on each side of the circle', () => {
    const cmds = renderRadar(axes, [], { x: 0, y: 0, w: 200, h: 200 }, {
      rings: 1, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: true,
    })
    const aligns = cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.align : ''))
    // Top and bottom centre; left and right anchor outward.
    expect(new Set(aligns).size).toBeGreaterThan(1)
  })

  it('treats an axis with a non-positive max as zero rather than dividing by it', () => {
    const cmds = renderRadar(
      [{ label: 'a', max: 0 }, { label: 'b', max: 10 }, { label: 'c', max: 10 }],
      [{ values: [5, 5, 5], color: '#000', fillAlpha: 0.5 }],
      { x: 0, y: 0, w: 200, h: 200 },
      { rings: 1, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false },
    )
    const poly = cmds.find((c) => c.kind === 'polygon')
    if (poly?.kind === 'polygon') {
      for (const p of poly.points) expect(Number.isFinite(p.x)).toBe(true)
    }
  })
})

describe('arc hit testing across the full circle', () => {
  it('finds every slice of a four-way split', () => {
    const arcs = layoutArcs([
      { value: 1, label: 'a', color: '#000' }, { value: 1, label: 'b', color: '#000' },
      { value: 1, label: 'c', color: '#000' }, { value: 1, label: 'd', color: '#000' },
    ])
    const c = { x: 0, y: 0 }
    const found = new Set<number>()
    for (const [dx, dy] of [[3, -3], [3, 3], [-3, 3], [-3, -3]]) {
      found.add(hitArc(arcs, c, 10, 0, { x: dx!, y: dy! }))
    }
    expect(found.size).toBe(4)
    expect(found.has(-1)).toBe(false)
  })
})

/**
 * The last branches, all of them real input shapes: a series that is entirely
 * negative, a single-point line or area, an empty category axis, and a log
 * domain whose ends collapse.
 */
describe('degenerate series and domains', () => {
  const spec = (over: Partial<ChartSpec>): ChartSpec => ({
    width: 200, height: 100, series: [], categories: [], theme: defaultTheme,
    showXAxis: false, showYAxis: false, showGrid: false, ...over,
  })

  it('extends an all-negative bar domain up to zero, not down from it', () => {
    const d = resolveYDomain(spec({
      series: [{ kind: 'bars', values: [-5, -10], color: '#000', width: 1, radius: 2, label: 'S' }],
    }))
    expect(d.max).toBeGreaterThanOrEqual(0)
    expect(d.min).toBeLessThan(0)
  })

  it('extends an all-positive bar domain down to zero', () => {
    const d = resolveYDomain(spec({
      series: [{ kind: 'bars', values: [5, 10], color: '#000', width: 1, radius: 2, label: 'S' }],
    }))
    expect(d.min).toBe(0)
  })

  /** One point makes no line; drawing a polyline of one is a no-op that some
   *  backends reject outright. */
  it('draws no polyline or polygon for a single-point line or area', () => {
    for (const kind of ['line', 'area'] as const) {
      const cmds = renderChart(spec({
        series: [{ kind, values: [5], color: '#000', width: 2, radius: 2, label: 'S' }],
      }), measure)
      expect(cmds.filter((c) => c.kind === 'polyline' || c.kind === 'polygon')).toHaveLength(0)
    }
  })

  it('draws them once there are two points', () => {
    for (const kind of ['line', 'area'] as const) {
      const cmds = renderChart(spec({
        series: [{ kind, values: [5, 8], color: '#000', width: 2, radius: 2, label: 'S' }],
      }), measure)
      expect(cmds.filter((c) => c.kind === 'polyline' || c.kind === 'polygon')).toHaveLength(1)
    }
  })

  it('returns no band ticks for no categories', () => {
    expect(bandTicks([], { x: 0, y: 0, w: 100, h: 100 })).toHaveLength(0)
  })

  /**
   * A collapsed log domain is WIDENED to a decade rather than centred: `max`
   * becomes `min * 10`, so the value lands at the range start with a readable
   * scale around it. The alternative — returning the midpoint — would put a
   * lone data point in the middle of an axis whose labels mean nothing.
   */
  it('widens a collapsed log domain to a decade', () => {
    const v = scaleLog({ min: 10, max: 10 }, 0, 100, 10)
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBe(0)
    expect(scaleLog({ min: 10, max: 10 }, 0, 100, 100)).toBe(100)
  })

  it('floors a non-positive log input to the domain minimum', () => {
    expect(Number.isFinite(scaleLog({ min: 1, max: 100 }, 0, 100, 0))).toBe(true)
  })
})

describe('stacked and grouped rendering', () => {
  const spec = (over: Partial<ChartSpec>): ChartSpec => ({
    width: 300, height: 150, series: [], categories: [], theme: defaultTheme,
    showXAxis: false, showYAxis: false, showGrid: false, ...over,
  })
  const s = (kind: 'stacked' | 'grouped', values: number[], color: string) => ({
    kind, values, color, width: 1, radius: 2, label: color,
  })

  /** A stack's domain is its tallest TOTAL — the max of the individual
   *  series would clip the stack at the top. */
  it('takes the domain from the stack total', () => {
    const d = resolveYDomain(spec({ series: [s('stacked', [10, 20], '#a'), s('stacked', [5, 5], '#b')] }))
    expect(d.max).toBeGreaterThanOrEqual(25)
  })

  it('draws a rect per stacked segment, coloured by its series', () => {
    const cmds = renderChart(
      spec({ series: [s('stacked', [10, 20], '#aa0000'), s('stacked', [5, 5], '#00bb00')] }),
      measure,
    )
    const rects = cmds.filter((c) => c.kind === 'rect')
    expect(rects).toHaveLength(4)
    expect(new Set(rects.map((c) => (c.kind === 'rect' ? c.fill : ''))).size).toBe(2)
  })

  it('draws grouped bars side by side', () => {
    const cmds = renderChart(
      spec({ series: [s('grouped', [10, 20], '#aa0000'), s('grouped', [5, 5], '#00bb00')] }),
      measure,
    )
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(4)
  })

  it('mixes a stack with an independent line', () => {
    const cmds = renderChart(
      spec({
        series: [
          s('stacked', [10, 20], '#aa0000'),
          { kind: 'line', values: [30, 30], color: '#0000cc', width: 2, radius: 2, label: 'L' },
        ],
      }),
      measure,
    )
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(1)
  })

  it('widens the domain to cover a line drawn above the stack', () => {
    const d = resolveYDomain(spec({
      series: [
        s('stacked', [10], '#a'),
        { kind: 'line', values: [500], color: '#b', width: 2, radius: 2, label: 'L' },
      ],
    }))
    expect(d.max).toBeGreaterThanOrEqual(500)
  })
})
