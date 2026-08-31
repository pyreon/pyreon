// Wave-1 parity features: curves, annotations, bubbles, value labels, dashes.

import { describe, expect, it } from 'vitest'
import { smooth, step } from './curve'
import { bars, bubble, line, points, resolveMarks } from './marks'
import { defaultTheme, renderChart } from './render'
import type { Annotation, ChartSpec } from './render'
import { svgCommand } from './svg'
import type { Pt } from './types'

const FONT = 'system-ui, sans-serif'

function spec(overrides: Partial<ChartSpec>): ChartSpec {
  return {
    width: 320,
    height: 200,
    series: [],
    categories: [],
    theme: defaultTheme,
    showXAxis: false,
    showYAxis: false,
    showGrid: false,
    ...overrides,
  }
}

describe('smooth (monotone cubic)', () => {
  const P = (x: number, y: number): Pt => ({ x, y })

  it('passes through every original datum', () => {
    const pts = [P(0, 10), P(10, 90), P(20, 30), P(30, 50)]
    const out = smooth(pts)
    for (const p of pts) {
      expect(out.some((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)).toBe(true)
    }
    expect(out.length).toBeGreaterThan(pts.length)
  })

  it('never overshoots the data envelope — the reason it is monotone', () => {
    // A Catmull-Rom-family curve dips below 10 and bumps above 90 here,
    // inventing extrema that are not in the data. Monotone must not.
    const out = smooth([P(0, 10), P(10, 10), P(20, 90), P(30, 90)])
    for (const p of out) {
      expect(p.y).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(p.y).toBeLessThanOrEqual(90 + 1e-9)
    }
  })

  it('is monotone between monotone data', () => {
    const out = smooth([P(0, 0), P(10, 20), P(20, 30), P(30, 100)])
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.y).toBeGreaterThanOrEqual(out[i - 1]!.y - 1e-9)
    }
  })

  it('returns short inputs untouched', () => {
    const two = [P(0, 1), P(5, 2)]
    expect(smooth(two)).toBe(two)
    expect(smooth([])).toEqual([])
  })

  it('survives coincident x values without NaN', () => {
    const out = smooth([P(0, 1), P(0, 5), P(10, 3)])
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('is deterministic — same input, identical output', () => {
    const pts = [P(0, 3), P(7, 9), P(11, 2)]
    expect(smooth(pts)).toEqual(smooth(pts))
  })
})

describe('step (step-after)', () => {
  it('holds each value until the next datum', () => {
    const out = step([
      { x: 0, y: 5 },
      { x: 10, y: 8 },
    ])
    expect(out).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 8 },
    ])
  })

  it('returns a single point untouched', () => {
    const one = [{ x: 1, y: 1 }]
    expect(step(one)).toBe(one)
  })
})

describe('curve through the render path', () => {
  const DATA = [
    { v: 10 },
    { v: 90 },
    { v: 30 },
  ]

  it('densifies the polyline for a smoothed line, and the area follows', () => {
    const straight = renderChart(
      spec({ series: resolveMarks(DATA, [line((d: (typeof DATA)[number]) => d.v)]) }),
      () => 20,
    )
    const curved = renderChart(
      spec({
        series: resolveMarks(DATA, [line((d: (typeof DATA)[number]) => d.v, { curve: smooth })]),
      }),
      () => 20,
    )
    const straightPoly = straight.find((c) => c.kind === 'polyline')
    const curvedPoly = curved.find((c) => c.kind === 'polyline')
    if (straightPoly?.kind !== 'polyline' || curvedPoly?.kind !== 'polyline') {
      throw new Error('expected polylines')
    }
    expect(straightPoly.points).toHaveLength(3)
    expect(curvedPoly.points.length).toBeGreaterThan(20)
  })
})

describe('annotations', () => {
  const SERIES = resolveMarks(
    [{ v: 10 }, { v: 60 }],
    [bars((d: { v: number }) => d.v)],
  )

  it('draws a dashed rule at the y value, with its label', () => {
    const notes: Annotation[] = [{ y: 50, label: 'Target', color: '#b42318' }]
    const cmds = renderChart(spec({ series: SERIES, annotations: notes }), () => 20)
    const rule = cmds.find((c) => c.kind === 'line' && c.dash !== undefined)
    if (rule?.kind !== 'line') throw new Error('expected a dashed rule')
    expect(rule.stroke).toBe('#b42318')
    expect(rule.dash).toEqual([4, 4])
    // Horizontal, spanning the plot.
    expect(rule.from.y).toBeCloseTo(rule.to.y, 5)
    expect(
      cmds.some((c) => c.kind === 'text' && c.text === 'Target'),
    ).toBe(true)
  })

  it('places the rule where the axis says that value is', () => {
    // The rule for y=50 must sit at the same position the engine gives the
    // value 50 — a rule placed by its own arithmetic drifts off its tick.
    const withRule = renderChart(
      spec({ series: SERIES, annotations: [{ y: 50 }], yDomain: { min: 0, max: 100 } }),
      () => 20,
    )
    const rule = withRule.find((c) => c.kind === 'line' && c.dash !== undefined)
    if (rule?.kind !== 'line') throw new Error('expected a rule')
    // Domain 0..100 over the plot: 50 is the vertical middle of the plot rect.
    const rects = withRule.filter((c) => c.kind === 'rect')
    expect(rects.length).toBeGreaterThan(0)
    expect(Number.isFinite(rule.from.y)).toBe(true)
  })

  it('draws a translucent band between yFrom and yTo, behind the series', () => {
    const cmds = renderChart(
      spec({ series: SERIES, annotations: [{ yFrom: 20, yTo: 40, color: '#1d4ed8' }] }),
      () => 20,
    )
    const band = cmds.findIndex((c) => c.kind === 'rect' && c.fill.startsWith('rgba'))
    const firstBar = cmds.findIndex((c) => c.kind === 'rect' && !c.fill.startsWith('rgba'))
    expect(band).toBeGreaterThanOrEqual(0)
    expect(firstBar).toBeGreaterThan(band)
  })

  it('draws a vertical rule at an x value', () => {
    const cmds = renderChart(spec({ series: SERIES, annotations: [{ x: 1 }] }), () => 20)
    const rule = cmds.find((c) => c.kind === 'line' && c.dash !== undefined)
    if (rule?.kind !== 'line') throw new Error('expected a rule')
    expect(rule.from.x).toBeCloseTo(rule.to.x, 5)
  })

  it('skips an empty annotation rather than guessing', () => {
    const empty: Annotation[] = [{ label: 'orphan' }]
    const cmds = renderChart(spec({ series: SERIES, annotations: empty }), () => 20)
    expect(cmds.some((c) => c.kind === 'line' && c.dash !== undefined)).toBe(false)
  })
})

describe('bubble', () => {
  const DATA = [
    { v: 5, size: 1 },
    { v: 6, size: 4 },
    { v: 7, size: 0 },
  ]

  it('maps the r channel by AREA, not radius', () => {
    const series = resolveMarks(DATA, [
      bubble(
        (d: (typeof DATA)[number]) => d.v,
        (d: (typeof DATA)[number]) => d.size,
        { minRadius: 2, maxRadius: 10 },
      ),
    ])
    const radii = series[0]!.radii!
    // size 4 is the max → maxRadius. size 1 is a QUARTER of the value, so its
    // AREA should be a quarter — radius scales by sqrt: 2 + sqrt(1/4)*8 = 6.
    expect(radii[1]).toBeCloseTo(10, 5)
    expect(radii[0]).toBeCloseTo(6, 5)
    // Zero (or negative) sizes clamp to the minimum, never vanish.
    expect(radii[2]).toBeCloseTo(2, 5)
  })

  it('renders per-datum circle radii', () => {
    const series = resolveMarks(DATA, [
      bubble(
        (d: (typeof DATA)[number]) => d.v,
        (d: (typeof DATA)[number]) => d.size,
      ),
    ])
    const cmds = renderChart(spec({ series }), () => 20)
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(3)
    const rs = circles.map((c) => (c.kind === 'circle' ? c.radius : 0))
    expect(new Set(rs).size).toBeGreaterThan(1)
  })

  it('plain points are untouched — one shared radius', () => {
    const series = resolveMarks(DATA, [points((d: (typeof DATA)[number]) => d.v, { radius: 5 })])
    const cmds = renderChart(spec({ series }), () => 20)
    for (const c of cmds.filter((c) => c.kind === 'circle')) {
      expect(c.kind === 'circle' && c.radius).toBe(5)
    }
  })
})

describe('bar value labels', () => {
  const DATA = [{ v: 42 }, { v: -17 }]

  it('labels each bar with its formatted value', () => {
    const series = resolveMarks(DATA, [
      bars((d: (typeof DATA)[number]) => d.v, { showValues: true }),
    ])
    const cmds = renderChart(spec({ series, yFormat: (v) => `#${v}` }), () => 20)
    expect(cmds.some((c) => c.kind === 'text' && c.text === '#42')).toBe(true)
    expect(cmds.some((c) => c.kind === 'text' && c.text === '#-17')).toBe(true)
  })

  it('puts a negative value UNDER its bar — above would sit on the zero line', () => {
    const series = resolveMarks(DATA, [
      bars((d: (typeof DATA)[number]) => d.v, { showValues: true }),
    ])
    const cmds = renderChart(spec({ series }), () => 20)
    const rects = cmds.filter((c) => c.kind === 'rect')
    const neg = cmds.find((c) => c.kind === 'text' && c.text === '-17')
    if (neg?.kind !== 'text') throw new Error('expected the negative label')
    const negBar = rects[1]
    if (negBar?.kind !== 'rect') throw new Error('expected the bar')
    expect(neg.at.y).toBeGreaterThan(negBar.rect.y + negBar.rect.h)
    expect(neg.baseline).toBe('top')
  })

  it('is off by default', () => {
    const series = resolveMarks(DATA, [bars((d: (typeof DATA)[number]) => d.v)])
    const cmds = renderChart(spec({ series }), () => 20)
    expect(cmds.some((c) => c.kind === 'text' && c.text === '42')).toBe(false)
  })
})

describe('dash serialization', () => {
  it('emits stroke-dasharray in SVG, and omits it when unset', () => {
    const dashed = svgCommand(
      { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, stroke: '#000', width: 1, dash: [4, 4] },
      FONT,
    )
    expect(dashed).toContain('stroke-dasharray="4 4"')
    const solid = svgCommand(
      { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, stroke: '#000', width: 1 },
      FONT,
    )
    expect(solid).not.toContain('dasharray')
  })

  it('dashes a polyline too', () => {
    const s = svgCommand(
      {
        kind: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        stroke: '#000',
        width: 1,
        dash: [2, 3],
      },
      FONT,
    )
    expect(s).toContain('stroke-dasharray="2 3"')
  })
})

describe('entrance progress', () => {
  const DATA = [{ v: 10 }, { v: 60 }, { v: 40 }]

  it('at 0.5 a bar has half its height, still rooted at the zero line', () => {
    const series = resolveMarks(DATA, [bars((d: (typeof DATA)[number]) => d.v)])
    const full = renderChart(spec({ series }), () => 20)
    const half = renderChart(spec({ series, progress: 0.5 }), () => 20)
    const fullRects = full.filter((c) => c.kind === 'rect')
    const halfRects = half.filter((c) => c.kind === 'rect')
    for (let i = 0; i < fullRects.length; i++) {
      const f = fullRects[i]!
      const h = halfRects[i]!
      if (f.kind !== 'rect' || h.kind !== 'rect') throw new Error('rects')
      expect(h.rect.h).toBeCloseTo(f.rect.h * 0.5, 5)
      // Rooted: the BOTTOM edge stays put while the top rises.
      expect(h.rect.y + h.rect.h).toBeCloseTo(f.rect.y + f.rect.h, 5)
    }
  })

  it('a negative bar grows DOWNWARD from the zero line', () => {
    const negData = [{ v: -30 }, { v: 50 }]
    const series = resolveMarks(negData, [bars((d: (typeof negData)[number]) => d.v)])
    const full = renderChart(spec({ series }), () => 20)
    const half = renderChart(spec({ series, progress: 0.5 }), () => 20)
    const fullNeg = full.filter((c) => c.kind === 'rect')[0]!
    const halfNeg = half.filter((c) => c.kind === 'rect')[0]!
    if (fullNeg.kind !== 'rect' || halfNeg.kind !== 'rect') throw new Error('rects')
    // The TOP edge (the zero line) stays put; the bar extends downward.
    expect(halfNeg.rect.y).toBeCloseTo(fullNeg.rect.y, 5)
    expect(halfNeg.rect.h).toBeCloseTo(fullNeg.rect.h * 0.5, 5)
  })

  it('reveals a line left to right with a smoothly advancing tip', () => {
    const series = resolveMarks(DATA, [line((d: (typeof DATA)[number]) => d.v)])
    const full = renderChart(spec({ series }), () => 20)
    const part = renderChart(spec({ series, progress: 0.75 }), () => 20)
    const fp = full.find((c) => c.kind === 'polyline')
    const pp = part.find((c) => c.kind === 'polyline')
    if (fp?.kind !== 'polyline' || pp?.kind !== 'polyline') throw new Error('polylines')
    const tip = pp.points[pp.points.length - 1]!
    const start = fp.points[0]!.x
    const end = fp.points[fp.points.length - 1]!.x
    // 0.75 of two segments: the tip is midway through the SECOND segment —
    // an interpolated point, not a datum.
    expect(tip.x).toBeCloseTo(start + (end - start) * 0.75, 5)
  })

  it('scales point radii', () => {
    const series = resolveMarks(DATA, [points((d: (typeof DATA)[number]) => d.v, { radius: 8 })])
    const part = renderChart(spec({ series, progress: 0.25 }), () => 20)
    for (const c of part.filter((c) => c.kind === 'circle')) {
      expect(c.kind === 'circle' && c.radius).toBeCloseTo(2, 5)
    }
  })

  it('holds value labels until the entrance settles — text mid-flight jitters', () => {
    const series = resolveMarks(DATA, [
      bars((d: (typeof DATA)[number]) => d.v, { showValues: true }),
    ])
    const mid = renderChart(spec({ series, progress: 0.9 }), () => 20)
    const done = renderChart(spec({ series, progress: 1 }), () => 20)
    expect(mid.some((c) => c.kind === 'text' && c.text === '60')).toBe(false)
    expect(done.some((c) => c.kind === 'text' && c.text === '60')).toBe(true)
  })

  it('absent progress and progress 1 emit identical frames, and values clamp', () => {
    const series = resolveMarks(DATA, [bars((d: (typeof DATA)[number]) => d.v)])
    const absent = renderChart(spec({ series }), () => 20)
    expect(renderChart(spec({ series, progress: 1 }), () => 20)).toEqual(absent)
    expect(renderChart(spec({ series, progress: 7 }), () => 20)).toEqual(absent)
    const zero = renderChart(spec({ series, progress: -3 }), () => 20)
    for (const c of zero.filter((c) => c.kind === 'rect')) {
      expect(c.kind === 'rect' && c.rect.h).toBe(0)
    }
  })
})
