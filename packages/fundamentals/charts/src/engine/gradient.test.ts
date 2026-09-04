// Gradients: the plot-box resolution, the draw-list plumbing, and the SVG
// <defs> + url() reference — plus the fallback every backend leans on.

import { describe, expect, it } from 'vitest'
import { polygonCmd, rectCmd } from './corners'
import { gradientFor, gradientSolid, seriesGradient } from './gradient'
import { area, bars, resolveMarks, stackedBars } from './marks'
import { defaultTheme, layoutChart, renderChart } from './render'
import type { ChartSpec } from './render'
import { collectGradients, renderSvg, svgCommand } from './svg'
import type { ChartGradient, DrawCmd } from './types'

interface Row {
  k: string
  v: number
}
const ROWS: Row[] = [
  { k: 'a', v: 3 },
  { k: 'b', v: 5 },
]
const measure = (t: string, s: number): number => t.length * s * 0.6
const PLOT = { x: 10, y: 20, w: 200, h: 100 }
const STOPS = [
  { offset: 0, color: '#2563eb' },
  { offset: 1, color: 'rgba(37,99,235,0)' },
]

const spec = (series: ChartSpec['series'], over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 300,
  height: 160,
  series,
  categories: ROWS.map((r) => r.k),
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})
const withGrad = (cmds: DrawCmd[]): (ChartGradient | undefined)[] =>
  cmds
    .filter((c) => c.kind === 'rect' || c.kind === 'polygon')
    .map((c) => (c.kind === 'rect' || c.kind === 'polygon' ? c.grad : undefined))

describe('gradientFor', () => {
  it('ramps top → bottom across the PLOT by default', () => {
    expect(gradientFor({ stops: STOPS }, PLOT)).toEqual({
      from: { x: 10, y: 20 },
      to: { x: 10, y: 120 },
      stops: STOPS,
    })
  })

  it("'horizontal' ramps left → right", () => {
    expect(gradientFor({ stops: STOPS, direction: 'horizontal' }, PLOT).to).toEqual({ x: 210, y: 20 })
  })

  it('an unknown direction is vertical rather than an error — a typo must not blank the chart', () => {
    expect(gradientFor({ stops: STOPS, direction: 'diagonal' }, PLOT).to).toEqual({ x: 10, y: 120 })
  })
})

describe('seriesGradient', () => {
  it('coalesces an absent gradient to an EMPTY ramp rather than an optional — the engine never reads through one', () => {
    const none = seriesGradient(undefined, PLOT)
    expect(none.stops).toEqual([])
    expect(seriesGradient({ stops: STOPS }, PLOT).stops).toEqual(STOPS)
  })
})

describe('gradientSolid', () => {
  it('degrades to the first stop, or to the fallback when there are none', () => {
    expect(gradientSolid({ from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, stops: STOPS }, '#000')).toBe('#2563eb')
    expect(gradientSolid({ from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, stops: [] }, '#000')).toBe('#000')
  })
})

describe('rectCmd / polygonCmd', () => {
  const G: ChartGradient = { from: { x: 0, y: 0 }, to: { x: 0, y: 10 }, stops: STOPS }

  it('omits both optional keys when neither is asked for', () => {
    const c = rectCmd(PLOT, '#f00', undefined, undefined)
    expect('corners' in c).toBe(false)
    expect('grad' in c).toBe(false)
  })

  it('carries each independently and both together', () => {
    expect('grad' in rectCmd(PLOT, '#f00', [2, 2, 2, 2], undefined)).toBe(false)
    expect('corners' in rectCmd(PLOT, '#f00', undefined, G)).toBe(false)
    const both = rectCmd(PLOT, '#f00', [2, 2, 2, 2], G)
    expect(both).toEqual({ kind: 'rect', rect: PLOT, fill: '#f00', corners: [2, 2, 2, 2], grad: G })
  })

  it('a polygon keeps its solid fill alongside the gradient', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    expect(polygonCmd(pts, '#f00', G)).toEqual({ kind: 'polygon', points: pts, fill: '#f00', grad: G })
    expect('grad' in polygonCmd(pts, '#f00', undefined)).toBe(false)
  })
})

describe('renderChart carries a mark gradient into the draw list', () => {
  it('every bar of a gradient series gets the SAME plot-spanning ramp', () => {
    const s = spec(resolveMarks(ROWS, [bars((d: Row) => d.v, { gradient: { stops: STOPS } })]))
    const cmds = renderChart(s, measure)
    const plot = layoutChart(s, measure).plot
    const grads = withGrad(cmds).filter((g) => g !== undefined)
    expect(grads).toHaveLength(2)
    for (const g of grads) {
      expect(g!.from).toEqual({ x: plot.x, y: plot.y })
      expect(g!.to).toEqual({ x: plot.x, y: plot.y + plot.h })
    }
  })

  it('an area polygon takes the gradient, and a mark without one stays solid', () => {
    const withIt = renderChart(spec(resolveMarks(ROWS, [area((d: Row) => d.v, { gradient: { stops: STOPS } })])), measure)
    expect(withGrad(withIt).some((g) => g !== undefined)).toBe(true)
    const without = renderChart(spec(resolveMarks(ROWS, [area((d: Row) => d.v)])), measure)
    for (const g of withGrad(without)) expect(g).toBeUndefined()
  })

  it('stacked segments take their own series gradient', () => {
    const cmds = renderChart(
      spec(resolveMarks(ROWS, [stackedBars((d: Row) => d.v, { gradient: { stops: STOPS } }), stackedBars((d: Row) => d.v)])),
      measure,
    )
    const grads = withGrad(cmds)
    expect(grads.filter((g) => g !== undefined).length).toBe(2)
    expect(grads.filter((g) => g === undefined).length).toBeGreaterThan(0)
  })
})

describe('svg gradients', () => {
  const F = 'system-ui'
  const G: ChartGradient = { from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, stops: STOPS }
  const RECT: DrawCmd = { kind: 'rect', rect: { x: 1, y: 2, w: 3, h: 4 }, fill: '#f00', grad: G }

  it('collectGradients mints one def per gradient-bearing command and an empty id for the rest', () => {
    const { defs, ids } = collectGradients([{ kind: 'rect', rect: PLOT, fill: '#0f0' }, RECT], 'c')
    expect(ids).toEqual(['', 'c-g0'])
    expect(defs).toContain('<linearGradient id="c-g0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">')
    expect(defs).toContain('<stop offset="0" stop-color="#2563eb"/>')
    expect(defs).toContain('<stop offset="1" stop-color="rgba(37,99,235,0)"/>')
  })

  it('a command serialized WITHOUT an id falls back to its solid fill', () => {
    expect(svgCommand(RECT, F)).toContain('fill="#f00"')
    expect(svgCommand(RECT, F, 'c-g0')).toContain('fill="url(#c-g0)"')
  })

  it('renderSvg emits the defs before the body and references them', () => {
    const out = renderSvg([RECT], 300, 160, { idPrefix: 'demo' })
    expect(out).toContain('<defs><linearGradient id="demo-g0"')
    expect(out).toContain('fill="url(#demo-g0)"')
    expect(out.indexOf('<defs>')).toBeLessThan(out.indexOf('url(#demo-g0)'))
  })

  it('a gradient with no stops emits no def and keeps the solid fill', () => {
    const empty: DrawCmd = { kind: 'rect', rect: PLOT, fill: '#abc', grad: { from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, stops: [] } }
    const { defs, ids } = collectGradients([empty], 'c')
    expect(defs).toBe('')
    expect(ids).toEqual([''])
    expect(svgCommand(empty, F, '')).toContain('fill="#abc"')
  })

  it('an out-of-range offset is clamped rather than emitted verbatim', () => {
    const wild: DrawCmd = {
      kind: 'rect',
      rect: PLOT,
      fill: '#000',
      grad: { from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, stops: [{ offset: -2, color: '#111' }, { offset: 9, color: '#222' }] },
    }
    const { defs } = collectGradients([wild], 'c')
    expect(defs).toContain('offset="0"')
    expect(defs).toContain('offset="1"')
    expect(defs).not.toContain('offset="-2"')
  })
})
