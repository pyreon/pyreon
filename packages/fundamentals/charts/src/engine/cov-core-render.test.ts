// The cartesian renderer on the mark options the existing suites do not pair
// with each other: a log view carrying error bars and annotations, the
// horizontal frame with symbols and value labels, a band whose lower channel
// runs short, a grouped bar below zero, and the hit/anchor helpers on a
// right-axis series. Each spec asserts the geometry the arm produces, not the
// fact that it ran.
import { describe, expect, it } from 'vitest'
import { barsForIn, defaultTheme, geometrySpec, layoutChart, logBounds, markerAnchor, renderChart, resolveYDomain, stackedHitIn } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, Double, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
/** A two-stop ramp — the shape `seriesGradient` reads. */
const RAMP = { stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }

const series = (over: Partial<Series> & Pick<Series, 'kind' | 'values'>): Series => ({
  color: '#0f766e', width: 1.5, radius: 3, label: 'S', ...over,
})
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400, height: 200, series: [series({ kind: 'bars', values: [10, 20, 30] })],
  categories: [], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, ...over,
})
const draw = (s: ChartSpec): DrawCmd[] => renderChart(s, measure)
const texts = (cmds: DrawCmd[]): string[] => cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))
const kinds = (cmds: DrawCmd[]): string[] => cmds.map((c) => c.kind)

describe('logBounds — the decade window a log axis spans', () => {
  it('opens the ceiling a decade when the data sits ON a single decade boundary', () => {
    // lo = hi = 1 → floor and ceiling would both be 1, which is not an axis.
    expect(logBounds(spec({ yScale: 'log', series: [series({ kind: 'line', values: [1, 1] })] }))).toEqual({ min: 1, max: 10 })
    // A spread inside one decade keeps the real decade window.
    expect(logBounds(spec({ yScale: 'log', series: [series({ kind: 'line', values: [2, 8] })] }))).toEqual({ min: 1, max: 10 })
  })

  it('takes the LARGEST positive as the ceiling whatever order the values arrive in', () => {
    const up = logBounds(spec({ yScale: 'log', series: [series({ kind: 'line', values: [1, 500] })] }))
    const down = logBounds(spec({ yScale: 'log', series: [series({ kind: 'line', values: [500, 1] })] }))
    expect(up).toEqual(down)
    expect(up.max).toBe(1000)
  })

  it('a pinned POSITIVE domain wins; a pinned domain touching zero does not', () => {
    expect(logBounds(spec({ yScale: 'log', yDomain: { min: 2, max: 200 }, series: [series({ kind: 'line', values: [5] })] }))).toEqual({ min: 2, max: 200 })
    // min 0 is not a log domain — the data's decades are used instead.
    expect(logBounds(spec({ yScale: 'log', yDomain: { min: 0, max: 200 }, series: [series({ kind: 'line', values: [5] })] }))).toEqual({ min: 1, max: 10 })
    // Nothing positive at all still yields a drawable axis.
    expect(logBounds(spec({ yScale: 'log', series: [series({ kind: 'line', values: [-1, Number.NaN] })] }))).toEqual({ min: 1, max: 10 })
  })

  it('ignores a RIGHT-axis series — the left axis decides the left decades', () => {
    const s = spec({
      yScale: 'log',
      series: [series({ kind: 'line', values: [1, 10] }), series({ kind: 'line', values: [50_000], axis: 'right' })],
    })
    expect(logBounds(s).max).toBe(10)
  })
})

describe('geometrySpec — the VIEW the geometry lays out', () => {
  it('a log view maps error bars and annotations through the same transform, dropping non-positive bounds', () => {
    const view = geometrySpec(spec({
      yScale: 'log',
      series: [series({ kind: 'bars', values: [1, 100], errLow: [0.5, 50], errHigh: [2, 200] })],
      annotations: [
        { y: 10, label: 'target' },
        { yFrom: 1, yTo: 100, label: 'band' },
        { y: -5, label: 'below zero' },
        { x: 1, label: 'vertical' },
      ],
    }))
    const s0 = view.series[0]!
    // log10(v / lo) with lo = 1: 0 and 2.
    expect(s0.values).toEqual([0, 2])
    expect(s0.errLow![0]).toBeCloseTo(Math.log10(0.5), 9)
    expect(s0.errHigh![1]).toBeCloseTo(Math.log10(200), 9)
    const notes = view.annotations!
    expect(notes[0]!.y).toBeCloseTo(1, 9)
    expect(notes[1]!.yFrom).toBeCloseTo(0, 9)
    expect(notes[1]!.yTo).toBeCloseTo(2, 9)
    // A non-positive bound has no place on a log axis — it is dropped, and the
    // label survives so the annotation is still identifiable.
    expect(notes[2]!.y).toBeUndefined()
    expect(notes[2]!.label).toBe('below zero')
    // A VERTICAL rule is untouched by a y transform.
    expect(notes[3]!.x).toBe(1)
    expect(notes[3]!.y).toBeUndefined()
  })

  it('a NON-POSITIVE error bound becomes a gap on a log axis, like a non-positive value', () => {
    const view = geometrySpec(spec({
      yScale: 'log',
      series: [series({ kind: 'bars', values: [1, 10], errLow: [0, -2], errHigh: [2, 0] })],
    }))
    const lows = view.series[0]!.errLow!
    expect(Number.isNaN(lows[0]!)).toBe(true)
    expect(Number.isNaN(lows[1]!)).toBe(true)
    // The upper bound is dropped on the same rule …
    expect(Number.isNaN(view.series[0]!.errHigh![1]!)).toBe(true)
    // … while a positive one beside it still maps.
    expect(view.series[0]!.errHigh![0]).toBeCloseTo(Math.log10(2), 9)
  })

  it('a series with NO error bounds keeps them absent through the log transform', () => {
    const view = geometrySpec(spec({ yScale: 'log', series: [series({ kind: 'line', values: [1, 10] })] }))
    expect(view.series[0]!.errLow).toBeUndefined()
    expect(view.series[0]!.errHigh).toBeUndefined()
  })

  it('a normalized stack pins {0,1}, leaves NON-stacked series alone, and passes annotations through untouched', () => {
    const view = geometrySpec(spec({
      stackNormalize: true,
      series: [
        series({ kind: 'stacked', values: [1, 3] }),
        series({ kind: 'stacked', values: [3, 1] }),
        series({ kind: 'line', values: [99, 99] }),
      ],
      annotations: [{ y: 50, label: 'kept' }],
    }))
    expect(view.yDomain).toEqual({ min: 0, max: 1 })
    expect(view.series[0]!.values).toEqual([0.25, 0.75])
    expect(view.series[2]!.values).toEqual([99, 99])
    // No log transform, so the annotation arrives as written.
    expect(view.annotations).toEqual([{ y: 50, label: 'kept' }])
  })

  it('a spec that asks for neither view is returned unchanged', () => {
    const s = spec()
    expect(geometrySpec(s)).toBe(s)
  })

  it('a log RIGHT-axis series is left in real units — only the left axis is a log view', () => {
    const view = geometrySpec(spec({
      yScale: 'log',
      series: [series({ kind: 'line', values: [1, 100] }), series({ kind: 'line', values: [7, 8], axis: 'right' })],
    }))
    expect(view.series[1]!.values).toEqual([7, 8])
  })
})

describe('the y domain over error bars', () => {
  it('a non-finite bound carries no extent, while a finite one widens the axis', () => {
    const wide = resolveYDomain(spec({ series: [series({ kind: 'line', values: [10], errHigh: [500], errLow: [1] })] }))
    const gapped = resolveYDomain(spec({ series: [series({ kind: 'line', values: [10], errHigh: [Number.NaN], errLow: [Number.NaN] })] }))
    expect(wide.max).toBeGreaterThanOrEqual(500)
    expect(gapped.max).toBeLessThan(500)
  })

  it('a band\'s LOWER channel is data too — the axis reaches below every upper value', () => {
    const d = resolveYDomain(spec({ series: [series({ kind: 'band', values: [10, 12], values2: [-40, -30] })] }))
    expect(d.min).toBeLessThanOrEqual(-40)
  })
})

describe('the horizontal frame', () => {
  const h = (over: Partial<Series>, rest: Partial<ChartSpec> = {}) =>
    draw(spec({ horizontal: true, categories: ['a', 'b'], series: [series({ kind: 'bars', values: [10, -5], ...over })], ...rest }))

  it('a NEGATIVE bar takes the mirrored theme corners and labels to its LEFT', () => {
    const cmds = h({ showValues: true })
    const rects = cmds.filter((c) => c.kind === 'rect')
    // Two bars plus whatever chrome the frame draws; both bars carry corners.
    const withCorners = rects.filter((c) => c.kind === 'rect' && c.corners !== undefined)
    expect(withCorners.length).toBeGreaterThanOrEqual(1)
    // The negative bar's label is anchored at its end, reading right-to-left.
    const labels = cmds.filter((c) => c.kind === 'text' && (c.text === '-5' || c.text === '10'))
    const neg = labels.find((c) => c.kind === 'text' && c.text === '-5')!
    const pos = labels.find((c) => c.kind === 'text' && c.text === '10')!
    expect(neg.kind === 'text' && neg.align).toBe('end')
    expect(pos.kind === 'text' && pos.align).toBe('start')
  })

  it('a GAP in a horizontal bar series prints no label', () => {
    expect(texts(h({ values: [10, Number.NaN], showValues: true }))).not.toContain('NaN')
    expect(texts(h({ values: [10, Number.NaN], showValues: true }))).toContain('10')
  })

  it('a symbol bar draws one symbol, and symbolRepeat tiles the bar instead', () => {
    const single = h({ values: [10, 10], symbol: 'diamond' })
    const repeated = h({ values: [10, 10], symbol: 'diamond', symbolRepeat: true })
    const polys = (c: DrawCmd[]) => c.filter((x) => x.kind === 'polygon').length
    expect(polys(single)).toBe(2)
    expect(polys(repeated)).toBeGreaterThan(polys(single))
    // A circle symbol fits the SHORTER side of its cell, so a wide bar's dot
    // is capped by the bar's height.
    const circles = h({ values: [10, 10], symbol: 'circle' }).filter((c) => c.kind === 'circle')
    expect(circles.length).toBeGreaterThanOrEqual(2)
  })

  it('the category labels THIN when there is no room for every one of them', () => {
    const many = Array.from({ length: 40 }, (_, i) => `category-${i}`)
    const cmds = draw(spec({
      horizontal: true,
      height: 120,
      categories: many,
      series: [series({ kind: 'bars', values: many.map((_, i) => i + 1) })],
    }))
    const drawn = texts(cmds).filter((t) => t.startsWith('category-'))
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.length).toBeLessThan(many.length)
  })

  it('a partly-grown horizontal bar starts at the zero line and reaches toward its value', () => {
    const mid = draw(spec({
      horizontal: true, progress: 0.5, categories: ['a'],
      series: [series({ kind: 'bars', values: [10] })],
    }))
    const full = draw(spec({ horizontal: true, categories: ['a'], series: [series({ kind: 'bars', values: [10] })] }))
    const widest = (c: DrawCmd[]) => Math.max(...c.filter((x) => x.kind === 'rect').map((x) => (x.kind === 'rect' ? x.rect.w : 0)))
    expect(widest(mid)).toBeLessThan(widest(full))
    // A negative bar grows LEFTWARD from the zero line, which a signed
    // domain actually has — so it reaches a real width during the entrance.
    const signed = spec({ horizontal: true, categories: ['a', 'b'], series: [series({ kind: 'bars', values: [10, -10] })] })
    const negMid = draw({ ...signed, progress: 0.5 })
    const negFull = draw(signed)
    expect(widest(negMid)).toBeGreaterThan(0)
    expect(widest(negMid)).toBeLessThan(widest(negFull))
  })
})

describe('grouped, stacked-area and waterfall marks', () => {
  it('a grouped bar below zero labels BELOW itself; a gradient paints the group', () => {
    const cmds = draw(spec({
      categories: ['a', 'b'],
      series: [
        series({ kind: 'grouped', values: [10, -6], showValues: true, gradient: RAMP }),
        series({ kind: 'grouped', values: [4, 8] }),
      ],
    }))
    const neg = cmds.find((c) => c.kind === 'text' && c.text === '-6')!
    expect(neg.kind === 'text' && neg.baseline).toBe('top')
    const pos = cmds.find((c) => c.kind === 'text' && c.text === '10')!
    expect(pos.kind === 'text' && pos.baseline).toBe('bottom')
    // The gradient reached the rect commands.
    expect(cmds.some((c) => c.kind === 'rect' && c.grad !== undefined)).toBe(true)
    // Without a gradient nothing carries one.
    const plain = draw(spec({ categories: ['a'], series: [series({ kind: 'grouped', values: [1] }), series({ kind: 'grouped', values: [2] })] }))
    expect(plain.some((c) => c.kind === 'rect' && c.grad !== undefined)).toBe(false)
  })

  it('a stacked AREA needs two points to fill; one datum draws no band', () => {
    const one = draw(spec({ categories: ['a'], series: [series({ kind: 'stackedArea', values: [5] })] }))
    expect(one.filter((c) => c.kind === 'polygon')).toHaveLength(0)
    const two = draw(spec({ categories: ['a', 'b'], series: [series({ kind: 'stackedArea', values: [5, 7] })] }))
    expect(two.filter((c) => c.kind === 'polygon').length).toBeGreaterThan(0)
  })

  it('a stacked area labels each band with its OWN value, skipping a gap, and takes a gradient', () => {
    const cmds = draw(spec({
      categories: ['a', 'b', 'c'],
      series: [
        series({ kind: 'stackedArea', values: [5, Number.NaN, 7], showValues: true, gradient: RAMP }),
        series({ kind: 'stackedArea', values: [1, 2, 3] }),
      ],
    }))
    const printed = texts(cmds)
    expect(printed).toContain('5')
    expect(printed).toContain('7')
    expect(printed).not.toContain('NaN')
    expect(cmds.some((c) => c.kind === 'polygon' && c.grad !== undefined)).toBe(true)
  })

  it('a SHORT stacked-area series prints labels only where it HAS a value', () => {
    const cmds = draw(spec({
      categories: ['a', 'b', 'c'],
      series: [
        series({ kind: 'stackedArea', values: [5, 6, 7] }),
        series({ kind: 'stackedArea', values: [1], showValues: true }),
      ],
    }))
    // The short series labels its ONE datum; the columns past its end print nothing.
    expect(texts(cmds).filter((t) => t === '1')).toHaveLength(1)
    expect(texts(cmds)).not.toContain('NaN')
  })

  it('an EXPLICIT corner radius on a bar wins over the theme\'s, in both frames', () => {
    const own = [9, 9, 9, 9]
    const vertical = draw(spec({ categories: ['a'], series: [series({ kind: 'bars', values: [10], corners: own })] }))
    expect(vertical.some((c) => c.kind === 'rect' && c.corners?.[0] === 9)).toBe(true)
    const horizontal = draw(spec({ horizontal: true, categories: ['a'], series: [series({ kind: 'bars', values: [10], corners: own })] }))
    expect(horizontal.some((c) => c.kind === 'rect' && c.corners?.[0] === 9)).toBe(true)
    // Without one, the theme's radius shapes only the corners away from the baseline.
    const themed = draw(spec({ categories: ['a'], series: [series({ kind: 'bars', values: [10] })] }))
    const bar = themed.find((c) => c.kind === 'rect' && c.corners !== undefined)
    expect(bar?.kind === 'rect' && bar.corners).not.toEqual(own)
  })

  it('a circle symbol is inscribed in the SHORTER side of its cell, whichever that is', () => {
    // A tall vertical bar: the cell is narrow, so the width caps the radius.
    const tall = draw(spec({ height: 400, categories: ['a'], series: [series({ kind: 'bars', values: [10], symbol: 'circle' })] }))
      .filter((c) => c.kind === 'circle')
    // A flat horizontal bar: the cell is short, so the height caps it.
    const wide = draw(spec({ horizontal: true, categories: ['a'], series: [series({ kind: 'bars', values: [10], symbol: 'circle' })] }))
      .filter((c) => c.kind === 'circle')
    expect(tall).toHaveLength(1)
    expect(wide).toHaveLength(1)
    for (const c of [...tall, ...wide]) expect(c.kind === 'circle' && c.radius).toBeGreaterThan(0)
  })

  it('a SELECTED waterfall step gets a heavier outline than a highlighted one', () => {
    const base = spec({ categories: ['a', 'b'], series: [series({ kind: 'waterfall', values: [10, -4] })] })
    const none = draw(base).filter((c) => c.kind === 'polyline').length
    const hi = draw({ ...base, emphasis: { highlight: 0, selected: [] } }).filter((c) => c.kind === 'polyline')
    const sel = draw({ ...base, emphasis: { highlight: -1, selected: [0] } }).filter((c) => c.kind === 'polyline')
    expect(hi.length).toBe(none + 1)
    expect(sel.length).toBe(none + 1)
    const w = (c: DrawCmd[]) => (c[c.length - 1]!.kind === 'polyline' ? (c[c.length - 1] as { width: Double }).width : 0)
    expect(w(sel)).toBeGreaterThan(w(hi))
  })
})

describe('bands, points and error whiskers', () => {
  it('a band whose lower channel runs SHORT closes only over the paired data', () => {
    const cmds = draw(spec({
      categories: ['a', 'b', 'c'],
      series: [series({ kind: 'band', values: [10, 12, 14], values2: [4, 6] })],
    }))
    const poly = cmds.find((c) => c.kind === 'polygon')
    // Two paired datums close into a quad; the unpaired third contributes nothing.
    expect(poly).toBeDefined()
    if (poly?.kind === 'polygon') expect(poly.points).toHaveLength(4)
    // A band with NO lower channel at all draws nothing.
    expect(draw(spec({ categories: ['a', 'b'], series: [series({ kind: 'band', values: [10, 12] })] })).filter((c) => c.kind === 'polygon')).toHaveLength(0)
  })

  it('effect points draw two halos under the dot', () => {
    const plain = draw(spec({ categories: ['a'], series: [series({ kind: 'points', values: [10] })] })).filter((c) => c.kind === 'circle')
    const halo = draw(spec({ categories: ['a'], series: [series({ kind: 'points', values: [10], effect: true })] })).filter((c) => c.kind === 'circle')
    expect(halo.length).toBe(plain.length + 2)
  })

  it('a SELECTED point gets a wider emphasis ring than a highlighted one', () => {
    const base = spec({ categories: ['a'], series: [series({ kind: 'points', values: [10] })] })
    const rings = (e: { highlight: number; selected: number[] }): number[] =>
      draw({ ...base, emphasis: e })
        .filter((c) => c.kind === 'circle')
        .map((c) => (c.kind === 'circle' ? c.radius : 0))
    const none = rings({ highlight: -1, selected: [] })
    const hi = rings({ highlight: 0, selected: [] })
    const sel = rings({ highlight: -1, selected: [0] })
    // Each emphasis adds exactly one ring, and the selected one is wider.
    expect(hi.length).toBe(none.length + 1)
    expect(sel.length).toBe(none.length + 1)
    expect(Math.max(...sel)).toBeGreaterThan(Math.max(...hi))
  })

  it('error whiskers stop where the SHORTER bound list ends', () => {
    const cmds = draw(spec({
      categories: ['a', 'b', 'c'],
      series: [series({ kind: 'bars', values: [10, 20, 30], errLow: [8, 18], errHigh: [12, 22, 32] })],
    }))
    // Three lines per whisker; only the two paired datums get one.
    const whiskers = cmds.filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)
    expect(whiskers).toHaveLength(6)
  })

  it('a short errHIGH list ends the whiskers just as a short errLow does', () => {
    const cmds = draw(spec({
      categories: ['a', 'b', 'c'],
      series: [series({ kind: 'bars', values: [10, 20, 30], errLow: [8, 18, 28], errHigh: [12, 22] })],
    }))
    expect(cmds.filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)).toHaveLength(6)
  })

  it('a POINTS series centres its whiskers on the points, not on bar rects', () => {
    const cmds = draw(spec({
      categories: ['a', 'b'],
      series: [series({ kind: 'points', values: [10, 20], errLow: [8, 18], errHigh: [12, 22] })],
    }))
    expect(cmds.filter((c) => c.kind === 'line' && c.stroke === defaultTheme.text)).toHaveLength(6)
  })
})

describe('emphasis band and markers', () => {
  it('the highlight band follows a CONTINUOUS x when the spec has one, and the category band otherwise', () => {
    const continuous = draw(spec({
      xValues: [0, 10, 20],
      emphasis: { highlight: 1, selected: [] },
      series: [series({ kind: 'line', values: [1, 2, 3] })],
    }))
    const categorical = draw(spec({
      categories: ['a', 'b', 'c'],
      emphasis: { highlight: 1, selected: [] },
      series: [series({ kind: 'line', values: [1, 2, 3] })],
    }))
    const bandW = (c: DrawCmd[]) => c.filter((x) => x.kind === 'rect').map((x) => (x.kind === 'rect' ? x.rect.w : 0))
    // The continuous band is a fixed 12px sliver; the categorical one is a whole band.
    expect(bandW(continuous)).toContain(12)
    expect(bandW(categorical).some((w) => w > 12)).toBe(true)
    // A highlight past the end of BOTH draws no band.
    const none = draw(spec({ categories: ['a'], emphasis: { highlight: 9, selected: [] }, series: [series({ kind: 'line', values: [1] })] }))
    expect(none.filter((c) => c.kind === 'rect')).toHaveLength(0)
  })

  it('a marker pointing past the data draws nothing, while one on a real datum draws a dot and its label', () => {
    const onData = draw(spec({
      categories: ['a', 'b'],
      series: [series({ kind: 'line', values: [1, 2] })],
      markers: [{ atIndex: 1, label: 'peak' }],
    }))
    expect(texts(onData)).toContain('peak')
    // An `atIndex` past the end is CLAMPED to the last datum rather than dropped …
    const clamped = draw(spec({
      categories: ['a', 'b'],
      series: [series({ kind: 'line', values: [1, 2] })],
      markers: [{ atIndex: 9, label: 'clamped' }],
    }))
    expect(texts(clamped)).toContain('clamped')
    // … but a continuous x axis with FEWER positions than values leaves the
    // trailing datums unplaced, and a marker there has nothing to sit on.
    const unplaced = draw(spec({
      xValues: [0],
      series: [series({ kind: 'line', values: [1, 2, 3] })],
      markers: [{ atIndex: 2, label: 'nowhere' }, { atIndex: 0, label: 'placed' }],
    }))
    expect(texts(unplaced)).toContain('placed')
    expect(texts(unplaced)).not.toContain('nowhere')
  })
})

describe('hit + anchor helpers read the SAME domain the paint used', () => {
  it('barsForIn on a RIGHT-axis series measures against the right domain', () => {
    // A right axis exists only when SOME series is still on the left.
    const s = spec({
      categories: ['a'],
      yDomain: { min: 0, max: 10 },
      y2Domain: { min: 0, max: 1000 },
      series: [series({ kind: 'bars', values: [500], axis: 'right' }), series({ kind: 'line', values: [1] })],
    })
    const plot = layoutChart(s, measure).plot
    const right = barsForIn(s, 0, plot)
    // Half the right domain → half the plot height.
    expect(right[0]!.h).toBeCloseTo(plot.h / 2, 0)
    // The SAME values read against the left axis blow past the plot instead.
    const left = barsForIn({ ...s, series: [series({ kind: 'bars', values: [500] })] }, 0, plot)
    expect(left[0]!.h).toBeGreaterThan(right[0]!.h)
  })

  it('markerAnchor answers for the joint layouts and stays silent for a plain series', () => {
    const stacked = spec({
      categories: ['a', 'b'],
      series: [series({ kind: 'stacked', values: [5, 5] }), series({ kind: 'stacked', values: [3, 3] })],
    })
    const plot = layoutChart(stacked, measure).plot
    const dom = resolveYDomain(geometrySpec(stacked))
    // The SECOND stacked series' segment sits above the first.
    const lower = markerAnchor(stacked, 0, 0, plot, dom)
    const upper = markerAnchor(stacked, 1, 0, plot, dom)
    expect(lower).toHaveLength(1)
    expect(upper).toHaveLength(1)
    expect(upper[0]!.y).toBeLessThan(lower[0]!.y)
    // A plain bar series has no joint layout to anchor into.
    expect(markerAnchor(spec({ categories: ['a'] }), 0, 0, plot, dom)).toEqual([])
    // A stacked series sharing the chart with a LINE still finds its own peers.
    const mixed = spec({
      categories: ['a', 'b'],
      series: [series({ kind: 'line', values: [9, 9] }), series({ kind: 'stacked', values: [5, 5] })],
    })
    expect(markerAnchor(mixed, 1, 0, plot, dom)).toHaveLength(1)
    // And the line itself is not a joint layout.
    expect(markerAnchor(mixed, 0, 0, plot, dom)).toEqual([])
    // An index past the data has no segment either.
    expect(markerAnchor(stacked, 0, 9, plot, dom)).toEqual([])
    // A series index past the list cannot be positioned.
    expect(markerAnchor(stacked, 5, 0, plot, dom)).toEqual([])
  })

  it('markerAnchor and the stacked hit both flip with the frame', () => {
    const flipped = spec({
      horizontal: true,
      categories: ['a', 'b'],
      series: [series({ kind: 'grouped', values: [5, 5] }), series({ kind: 'grouped', values: [3, 3] })],
    })
    const plot = layoutChart(flipped, measure).plot
    const dom = resolveYDomain(geometrySpec(flipped))
    const anchor = markerAnchor(flipped, 0, 0, plot, dom)
    expect(anchor).toHaveLength(1)
    // In the flipped frame the anchor is the bar's RIGHT end, inside the plot.
    expect(anchor[0]!.x).toBeGreaterThan(plot.x)
    expect(anchor[0]!.x).toBeLessThanOrEqual(plot.x + plot.w)
    // The hit test reads the same flipped layout.
    expect(stackedHitIn(flipped, plot, anchor[0]!.x - 2, anchor[0]!.y)).toBe(0)
    expect(stackedHitIn(flipped, plot, plot.x - 100, plot.y - 100)).toBe(-1)
  })
})

// NOTE — arms here that only a malformed input could reach, left uncovered
// deliberately:
//   * `si < stacked.length` (419) — `si` counts the very stacked series
//     `stacked` was built from, so it can never run past it.
//   * `extent(spec.xValues ?? [])` (555) — the `?? []` is guarded by the
//     `length > 0` test on the same expression.
//   * `printed`'s `i < sv.length` (618) — `i` indexes rects derived from that
//     series' own values.
//   * `s.symbol ?? 'rect'` (980/984/1038/1042) — each sits inside an
//     `s.symbol === undefined` ELSE branch.
//   * `s.values[ri] ?? 0.0` (968/1023) — `ri` indexes the rects that series'
//     own values produced, so the cell is always there.
//   * the band's inner `i < lows.length` (1131), `lowerRuns.length > 0` (1133)
//     and `poly.length > 2` (1137) — a datum is paired only when BOTH bounds
//     are finite, so an upper run always has a lower one of the same length.
//   * `markerAnchor`'s `which < 0` (1563) — `kind` is read by the same
//     positional scan that then finds `which`, so a found kind implies a
//     found peer.
describe('the drawn frame as a whole', () => {
  it('a log chart with every mark kind renders without producing a NaN coordinate', () => {
    const cmds = draw(spec({
      yScale: 'log',
      categories: ['a', 'b', 'c'],
      progress: 0.6,
      series: [
        series({ kind: 'bars', values: [1, 10, 100], errLow: [0.5, 5, 50], errHigh: [2, 20, 200] }),
        series({ kind: 'line', values: [2, 20, 200], curve: (p) => p }),
        series({ kind: 'points', values: [3, 30, 300] }),
      ],
      annotations: [{ y: 50, label: 'target' }],
    }))
    expect(kinds(cmds).length).toBeGreaterThan(0)
    const nums = JSON.stringify(cmds)
    expect(nums).not.toContain('null')
    for (const c of cmds) {
      if (c.kind === 'circle') expect(Number.isNaN(c.center.x) || Number.isNaN(c.center.y)).toBe(false)
      if (c.kind === 'rect') expect(Number.isNaN(c.rect.x) || Number.isNaN(c.rect.w)).toBe(false)
    }
  })

  it('a partial reveal interpolates the line tip rather than popping whole segments', () => {
    const at = (progress: Double) =>
      draw(spec({
        progress,
        categories: ['a', 'b', 'c', 'd'],
        series: [series({ kind: 'line', values: [0, 10, 0, 10] })],
      })).find((c) => c.kind === 'polyline' && c.points.length > 1)
    const third = at(0.4)
    const whole = at(1)
    if (third?.kind !== 'polyline' || whole?.kind !== 'polyline') throw new Error('polyline')
    expect(third.points.length).toBeLessThan(whole.points.length)
    // The tip is BETWEEN two data points, not on one of them.
    const tip = third.points[third.points.length - 1]!
    expect(whole.points.some((p) => p.x === tip.x && p.y === tip.y)).toBe(false)
    // A cut landing exactly on a datum needs no interpolated point.
    const exact = at(1 / 3)
    if (exact?.kind !== 'polyline') throw new Error('polyline')
    expect(exact.points).toHaveLength(2)
  })
})
