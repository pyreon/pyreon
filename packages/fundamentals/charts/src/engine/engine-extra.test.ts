import { describe, expect, it } from 'vitest'
import { arcPolygon, fitCircle, hitArc, layoutArcs, renderGauge, renderPie } from './arc'
import { layoutGroupedBars, layoutScatter, layoutStackedBars, stackHasNegatives, stackedExtent } from './stack'
import { compact, currency, fixed, percent, plain } from './format'
import { radarAngles, radarPolygon, renderRadar, withAlpha } from './radar'
import { renderLegend } from './legend'
import { chartTable, describeChart } from './a11y'
import { lttb, minMaxBuckets } from './decimate'
import { logTicks, scaleLog, timeTicks } from './scale-extra'
import { placeTooltip, tooltipAt, tooltipLines } from './tooltip'
import type { Pt } from './types'

const box = { x: 0, y: 0, w: 200, h: 200 }
const slice = (value: number, label: string) => ({ value, label, color: '#0f766e' })

describe('layoutArcs', () => {
  it('divides the circle by share and closes a full turn', () => {
    const a = layoutArcs([slice(25, 'a'), slice(25, 'b'), slice(50, 'c')])
    expect(a).toHaveLength(3)
    expect(a[0]!.fraction).toBeCloseTo(0.25, 6)
    expect(a[2]!.fraction).toBeCloseTo(0.5, 6)
    expect(a[2]!.end - a[0]!.start).toBeCloseTo(Math.PI * 2, 6)
  })

  /** Reflecting a negative would draw a loss as though it were a gain. */
  it('drops non-positive values rather than reflecting them', () => {
    expect(layoutArcs([slice(10, 'a'), slice(-5, 'b'), slice(0, 'c')])).toHaveLength(1)
  })

  it('returns nothing when everything is zero, instead of dividing by it', () => {
    expect(layoutArcs([slice(0, 'a'), slice(0, 'b')])).toHaveLength(0)
  })

  it('starts at twelve o\'clock', () => {
    expect(layoutArcs([slice(1, 'a')])[0]!.start).toBeCloseTo(-Math.PI / 2, 6)
  })
})

describe('arcPolygon', () => {
  it('closes a donut band back along its inner edge', () => {
    const p = arcPolygon({ x: 0, y: 0 }, 10, 5, 0, Math.PI)
    expect(p.length).toBeGreaterThan(4)
    const radii = p.map((q) => Math.hypot(q.x, q.y))
    expect(Math.min(...radii)).toBeCloseTo(5, 3)
    expect(Math.max(...radii)).toBeCloseTo(10, 3)
  })

  it('closes a pie wedge through the centre', () => {
    const p = arcPolygon({ x: 0, y: 0 }, 10, 0, 0, Math.PI / 2)
    expect(p[p.length - 1]).toEqual({ x: 0, y: 0 })
  })

  it('scales segments with the sweep', () => {
    const small = arcPolygon({ x: 0, y: 0 }, 10, 0, 0, 0.05)
    const big = arcPolygon({ x: 0, y: 0 }, 10, 0, 0, Math.PI)
    expect(big.length).toBeGreaterThan(small.length)
  })
})

describe('renderPie', () => {
  it('emits a polygon per slice', () => {
    const cmds = renderPie([slice(1, 'a'), slice(2, 'b')], box, {
      innerRadius: 0, showLabels: false, labelColor: '#000', fontSize: 11,
    })
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(2)
  })

  /** A label on a 1% slice overlaps its neighbours and reads as noise. */
  it('labels only slices big enough to hold one', () => {
    const cmds = renderPie([slice(99, 'big'), slice(1, 'tiny')], box, {
      innerRadius: 0, showLabels: true, labelColor: '#000', fontSize: 11,
    })
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(1)
  })
})

describe('hitArc', () => {
  const arcs = layoutArcs([slice(1, 'a'), slice(1, 'b'), slice(1, 'c'), slice(1, 'd')])
  const c = { x: 0, y: 0 }

  it('finds the slice under a point', () => {
    expect(hitArc(arcs, c, 10, 0, { x: 3, y: -3 })).toBe(0)
    expect(hitArc(arcs, c, 10, 0, { x: 3, y: 3 })).toBe(1)
  })
  it('misses outside the radius and inside a donut hole', () => {
    expect(hitArc(arcs, c, 10, 0, { x: 50, y: 50 })).toBe(-1)
    expect(hitArc(arcs, c, 10, 5, { x: 1, y: 1 })).toBe(-1)
  })
  /** The first slice spans 12 o'clock, where atan2 wraps from PI to -PI. */
  it('handles the slice straddling the angle wrap', () => {
    expect(hitArc(arcs, c, 10, 0, { x: 0.1, y: -5 })).toBe(0)
  })
})

describe('renderGauge', () => {
  const opts = {
    min: 0, max: 100, sweep: Math.PI, thickness: 20,
    trackColor: '#eee', valueColor: '#0f766e',
  }
  it('draws a track and a value arc', () => {
    expect(renderGauge(50, box, opts)).toHaveLength(2)
  })
  /** Overshoot would wrap the arc and read as a LOW value — the worst failure. */
  it('clamps out-of-range values instead of wrapping', () => {
    const over = renderGauge(500, box, opts)[1]!
    const full = renderGauge(100, box, opts)[1]!
    if (over.kind === 'polygon' && full.kind === 'polygon') {
      expect(over.points.length).toBe(full.points.length)
    }
    expect(() => renderGauge(-50, box, opts)).not.toThrow()
  })
  it('survives a zero-width domain', () => {
    expect(() => renderGauge(5, box, { ...opts, min: 5, max: 5 })).not.toThrow()
  })
})

describe('stacked bars', () => {
  const plot = { x: 0, y: 0, w: 300, h: 100 }

  it('stacks segments without overlapping', () => {
    const segs = layoutStackedBars([[10, 20], [5, 5]], plot, { min: 0, max: 25 }, 0.25)
    expect(segs).toHaveLength(4)
    const band0 = segs.filter((s) => s.datumIndex === 0)
    expect(band0[0]!.rect.y).toBeGreaterThan(band0[1]!.rect.y)
  })

  it('takes the domain from the tallest TOTAL, not the tallest value', () => {
    expect(stackedExtent([[10, 20], [5, 5]]).max).toBe(25)
  })

  /** A mixed-sign stack has a height that is not its total; flag, do not guess. */
  it('reports negatives rather than silently dropping them unannounced', () => {
    expect(stackHasNegatives([[1, -2]])).toBe(true)
    expect(stackHasNegatives([[1, 2]])).toBe(false)
    expect(layoutStackedBars([[1, -2]], plot, { min: 0, max: 2 }, 0.25)).toHaveLength(1)
  })

  it('handles ragged series', () => {
    expect(() => layoutStackedBars([[1, 2, 3], [1]], plot, { min: 0, max: 5 }, 0.25)).not.toThrow()
  })
})

describe('grouped bars', () => {
  const plot = { x: 0, y: 0, w: 300, h: 100 }
  it('sits series side by side within a band', () => {
    const segs = layoutGroupedBars([[10, 20], [5, 5]], plot, { min: 0, max: 20 }, 0.25)
    expect(segs).toHaveLength(4)
    const band0 = segs.filter((s) => s.datumIndex === 0)
    expect(band0[0]!.rect.x).toBeLessThan(band0[1]!.rect.x)
    expect(band0[0]!.rect.x + band0[0]!.rect.w).toBeLessThanOrEqual(band0[1]!.rect.x + 0.001)
  })
})

describe('layoutScatter', () => {
  /** x carries meaning here; using the index would draw different data. */
  it('positions by the x VALUE, not the index', () => {
    const pts = layoutScatter([0, 100], [0, 0], { x: 0, y: 0, w: 100, h: 100 },
      { min: 0, max: 100 }, { min: 0, max: 1 })
    expect(pts[0]!.x).toBe(0)
    expect(pts[1]!.x).toBe(100)
  })
  it('stops at the shorter channel', () => {
    expect(layoutScatter([1, 2, 3], [1], { x: 0, y: 0, w: 10, h: 10 },
      { min: 0, max: 3 }, { min: 0, max: 1 })).toHaveLength(1)
  })
})

describe('formatters', () => {
  it('formats compactly', () => {
    expect(compact(1200)).toBe('1.2K')
    expect(compact(3400000)).toBe('3.4M')
    expect(compact(-1500)).toBe('-1.5K')
    expect(compact(999)).toBe('999')
  })
  it('pads fixed decimals', () => {
    expect(fixed(2)(3.1)).toBe('3.10')
    expect(fixed(2)(3)).toBe('3.00')
    expect(fixed(0)(3.6)).toBe('4')
  })
  it('formats currency and percent', () => {
    expect(currency('$', 2)(12.5)).toBe('$12.50')
    expect(currency('$')(-5)).toBe('-$5')
    expect(percent(1)(0.425)).toBe('42.5%')
  })
  it('trims float noise', () => {
    expect(plain(0.30000000000000004)).toBe('0.3')
  })
})

describe('radar', () => {
  const axes = [
    { label: 'a', max: 100 }, { label: 'b', max: 5 }, { label: 'c', max: 100 },
  ]
  it('spaces axes evenly from the top', () => {
    const a = radarAngles(4)
    expect(a[0]).toBeCloseTo(-Math.PI / 2, 6)
    expect(a[1]! - a[0]!).toBeCloseTo(Math.PI / 2, 6)
  })

  /** Per-axis normalisation is what lets units differ across axes. */
  it('normalises each axis by its OWN max', () => {
    const p = radarPolygon([100, 5, 50], axes, { x: 0, y: 0 }, 100)
    expect(Math.hypot(p[0]!.x, p[0]!.y)).toBeCloseTo(100, 3)
    expect(Math.hypot(p[1]!.x, p[1]!.y)).toBeCloseTo(100, 3)
    expect(Math.hypot(p[2]!.x, p[2]!.y)).toBeCloseTo(50, 3)
  })

  it('draws rings, spokes and a closed series outline', () => {
    const cmds = renderRadar(axes, [{ values: [50, 2, 80], color: '#0f766e', fillAlpha: 0.3 }], box, {
      rings: 3, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: true,
    })
    expect(cmds.filter((c) => c.kind === 'polyline').length).toBeGreaterThanOrEqual(4)
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(1)
    expect(cmds.filter((c) => c.kind === 'text')).toHaveLength(3)
  })

  it('refuses fewer than three axes, which enclose no area', () => {
    expect(renderRadar(axes.slice(0, 2), [], box, {
      rings: 3, gridColor: '#ccc', labelColor: '#333', fontSize: 11, showLabels: false,
    })).toHaveLength(0)
  })

  it('applies alpha to hex and passes other colour forms through unchanged', () => {
    expect(withAlpha('#0f766e', 0.5)).toBe('rgba(15, 118, 110, 0.5)')
    expect(withAlpha('#abc', 1)).toBe('rgba(170, 187, 204, 1)')
    expect(withAlpha('rebeccapurple', 0.5)).toBe('rebeccapurple')
  })
})

describe('legend', () => {
  const measure = (t: string, s: number) => t.length * s * 0.6
  const entries = [
    { label: 'Revenue', color: '#0f766e' },
    { label: 'Target', color: '#b45309' },
  ]
  const opts = {
    fontSize: 11, labelColor: '#333', swatch: 10, gap: 12,
    orientation: 'horizontal' as const,
  }

  it('emits a swatch and a label per entry', () => {
    const l = renderLegend(entries, { x: 0, y: 0, w: 400, h: 40 }, opts, measure)
    expect(l.cmds.filter((c) => c.kind === 'rect')).toHaveLength(2)
    expect(l.cmds.filter((c) => c.kind === 'text')).toHaveLength(2)
  })

  /** The height is returned because wrapping makes it unknowable in advance. */
  it('wraps in a narrow box and reports the taller height', () => {
    const wide = renderLegend(entries, { x: 0, y: 0, w: 400, h: 40 }, opts, measure)
    const narrow = renderLegend(entries, { x: 0, y: 0, w: 60, h: 40 }, opts, measure)
    expect(narrow.height).toBeGreaterThan(wide.height)
  })

  it('takes no space when there is nothing to show', () => {
    expect(renderLegend([], { x: 0, y: 0, w: 400, h: 40 }, opts, measure).height).toBe(0)
  })
})

describe('accessibility', () => {
  const input = {
    title: 'Revenue',
    categories: ['Jan', 'Feb', 'Mar'],
    series: [{ label: 'Revenue', values: [100, 180, 140], kind: 'bars' }],
  }

  it('states direction and range, not every datum', () => {
    const d = describeChart(input)
    expect(d).toContain('Revenue')
    expect(d).toContain('3 categories')
    expect(d).toContain('rising')
    expect(d).toContain('Jan')
    expect(d).toContain('180')
  })

  it('calls a falling series falling and a flat one flat', () => {
    expect(describeChart({ ...input, series: [{ label: 'S', values: [10, 5], kind: 'line' }] }))
      .toContain('falling')
    expect(describeChart({ ...input, series: [{ label: 'S', values: [5, 5], kind: 'line' }] }))
      .toContain('flat')
  })

  it('says so when there is no data', () => {
    expect(describeChart({ ...input, series: [] })).toContain('no data')
  })

  it('tabulates a column per series and a row per category', () => {
    const t = chartTable({
      ...input,
      series: [
        { label: 'A', values: [1, 2, 3], kind: 'bars' },
        { label: 'B', values: [4, 5, 6], kind: 'line' },
      ],
    })
    expect(t.headers).toEqual(['Category', 'A', 'B'])
    expect(t.rows).toHaveLength(3)
    expect(t.rows[0]).toEqual(['Jan', '1', '4'])
  })

  it('leaves a gap blank for a short series rather than inventing a value', () => {
    const t = chartTable({ ...input, series: [{ label: 'A', values: [1], kind: 'bars' }] })
    expect(t.rows[1]![1]).toBe('')
  })
})

describe('decimation', () => {
  const many: Pt[] = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 100 }))

  it('reduces to the threshold and keeps both endpoints', () => {
    const out = lttb(many, 200)
    expect(out).toHaveLength(200)
    expect(out[0]).toEqual(many[0])
    expect(out[out.length - 1]).toEqual(many[many.length - 1])
  })

  it('leaves a series alone when it is already small enough', () => {
    expect(lttb(many.slice(0, 50), 200)).toHaveLength(50)
  })

  /** Nth-sampling drops a one-sample spike; on a monitoring chart that spike
   *  is the entire reason someone is looking. */
  it('preserves a lone spike that nth-sampling would drop', () => {
    const flat: Pt[] = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: 0 }))
    flat[501] = { x: 501, y: 999 }
    expect(lttb(flat, 100).some((p) => p.y === 999)).toBe(true)
  })

  it('keeps both extremes per bucket', () => {
    const out = minMaxBuckets([0, 100, 1, 99, 2, 98, 3, 97], 2)
    expect(Math.max(...out)).toBe(100)
    expect(Math.min(...out)).toBe(0)
  })
})

describe('log and time scales', () => {
  it('maps decades evenly', () => {
    const d = { min: 1, max: 1000 }
    expect(scaleLog(d, 0, 300, 1)).toBeCloseTo(0, 5)
    expect(scaleLog(d, 0, 300, 10)).toBeCloseTo(100, 5)
    expect(scaleLog(d, 0, 300, 1000)).toBeCloseTo(300, 5)
  })

  /** log(0) is -Infinity and log of a negative is NaN — neither may reach a coordinate. */
  it('never returns a non-finite coordinate, whatever the domain', () => {
    for (const d of [{ min: 0, max: 100 }, { min: -5, max: 5 }, { min: 1, max: 1 }]) {
      expect(Number.isFinite(scaleLog(d, 0, 100, 0))).toBe(true)
      expect(Number.isFinite(scaleLog(d, 0, 100, -1))).toBe(true)
    }
  })

  it('ticks at powers of ten, bounded', () => {
    expect(logTicks({ min: 1, max: 1000 }, 0, 300).map((t) => t.value)).toEqual([1, 10, 100, 1000])
    expect(logTicks({ min: 1e-300, max: 1e300 }, 0, 300).length).toBeLessThanOrEqual(24)
  })

  it('picks a calendar step, not a nice-number one', () => {
    const day = 86400000
    const t = timeTicks({ min: 0, max: day }, 0, 100, 6)
    expect(t.length).toBeGreaterThan(0)
    expect(t[0]!.label).toMatch(/^\d{2}:\d{2}/)
    const year = timeTicks({ min: 0, max: day * 365 * 3 }, 0, 100, 4)
    expect(year[0]!.label).toMatch(/^\d{4}$|^\d{4}-\d{2}$/)
  })

  it('returns nothing for a degenerate span', () => {
    expect(timeTicks({ min: 5, max: 5 }, 0, 100, 5)).toHaveLength(0)
  })
})

describe('tooltip', () => {
  const series = [
    { label: 'A', values: [1, 2, 3], color: '#0f766e' },
    { label: 'B', values: [4, 5, 6], color: '#b45309' },
  ]

  it('collects every series at one index', () => {
    const c = tooltipAt(1, ['Jan', 'Feb', 'Mar'], series)
    expect(c.title).toBe('Feb')
    expect(c.rows).toHaveLength(2)
    expect(tooltipLines(c)).toEqual(['Feb', 'A: 2', 'B: 5'])
  })

  it('skips a series with no value there', () => {
    expect(tooltipAt(5, [], series).rows).toHaveLength(0)
  })

  /** Clamping would slide the tooltip over the datum it describes. */
  it('flips at the right edge instead of clamping', () => {
    const b = { x: 0, y: 0, w: 200, h: 100 }
    const placed = placeTooltip({ x: 190, y: 50 }, { w: 80, h: 40 }, b, 8)
    expect(placed.x).toBeLessThan(190)
  })

  it('keeps the tooltip inside vertically', () => {
    const b = { x: 0, y: 0, w: 200, h: 100 }
    expect(placeTooltip({ x: 10, y: 0 }, { w: 50, h: 40 }, b, 8).y).toBeGreaterThanOrEqual(0)
    expect(placeTooltip({ x: 10, y: 100 }, { w: 50, h: 40 }, b, 8).y + 40).toBeLessThanOrEqual(100)
  })
})

describe('fitCircle', () => {
  it('inscribes the largest circle that fits the box, centred', () => {
    const wide = fitCircle({ x: 10, y: 20, w: 200, h: 100 })
    expect(wide.center).toEqual({ x: 110, y: 70 })
    // The SHORT side limits the radius, or the circle overflows the box.
    expect(wide.radius).toBeLessThanOrEqual(50)
    const tall = fitCircle({ x: 0, y: 0, w: 100, h: 300 })
    expect(tall.radius).toBeLessThanOrEqual(50)
  })
})
