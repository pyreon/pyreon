// Rounded rects: the clamp, the draw-list plumbing, and the SVG path — the
// three halves the four executors share (the fourth, the pixels, is asserted
// in a real browser next door).

import { describe, expect, it } from 'vitest'
import { cornerRadii, hasCorners, rectCmd } from './corners'
import { bars, groupedBars, normalizeCorners, resolveMarks, stackedBars } from './marks'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec } from './render'
import { svgCommand } from './svg'
import type { DrawCmd } from './types'

interface Row {
  k: string
  v: number
}
const ROWS: Row[] = [
  { k: 'a', v: 3 },
  { k: 'b', v: 5 },
]
const measure = (t: string, s: number): number => t.length * s * 0.6
const R = { x: 10, y: 20, w: 40, h: 100 }

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
const rects = (cmds: DrawCmd[]): Extract<DrawCmd, { kind: 'rect' }>[] =>
  cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')

describe('cornerRadii', () => {
  it('passes radii that fit through untouched', () => {
    expect(cornerRadii(R, [6, 4, 2, 0])).toEqual([6, 4, 2, 0])
  })

  it('clamps each corner to half the SHORTER side — a bar mid-entrance rounds proportionally, not into a lozenge', () => {
    // 40x100: half the shorter side is 20.
    expect(cornerRadii(R, [50, 30, 20, 1])).toEqual([20, 20, 20, 1])
    // The same radii against a 40x6 bar (the second frame of an entrance).
    expect(cornerRadii({ x: 0, y: 0, w: 40, h: 6 }, [50, 30, 20, 1])).toEqual([3, 3, 3, 1])
  })

  it('reads a missing, short or negative input as square', () => {
    expect(cornerRadii(R, undefined)).toEqual([0, 0, 0, 0])
    expect(cornerRadii(R, [])).toEqual([0, 0, 0, 0])
    expect(cornerRadii(R, [6, 6])).toEqual([0, 0, 0, 0])
    expect(cornerRadii(R, [-4, 6, 0, 0])).toEqual([0, 6, 0, 0])
  })

  it('handles a negative-height rect (a bar hanging below the zero line)', () => {
    expect(cornerRadii({ x: 0, y: 0, w: 40, h: -10 }, [8, 8, 8, 8])).toEqual([5, 5, 5, 5])
  })

  it('hasCorners is false for an all-zero clamp', () => {
    expect(hasCorners([0, 0, 0, 0])).toBe(false)
    expect(hasCorners(cornerRadii({ x: 0, y: 0, w: 40, h: 0 }, [6, 6, 6, 6]))).toBe(false)
    expect(hasCorners([0, 0, 0.5, 0])).toBe(true)
  })
})

describe('normalizeCorners', () => {
  it('expands a scalar, keeps a 4-array, pads a shorthand the way CSS does', () => {
    expect(normalizeCorners(6)).toEqual([6, 6, 6, 6])
    expect(normalizeCorners([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
    expect(normalizeCorners([6, 6])).toEqual([6, 6, 6, 6])
    expect(normalizeCorners([6])).toEqual([6, 6, 6, 6])
  })

  it('reads absent and empty as no rounding at all', () => {
    expect(normalizeCorners(undefined)).toBeUndefined()
    expect(normalizeCorners([])).toBeUndefined()
  })
})

describe('rectCmd', () => {
  it('omits the key entirely when there is no rounding — an existing chart serializes byte-identically', () => {
    const c = rectCmd(R, '#f00', undefined, undefined)
    expect(c).toEqual({ kind: 'rect', rect: R, fill: '#f00' })
    expect('corners' in c).toBe(false)
  })

  it('carries the radii when there are any', () => {
    expect(rectCmd(R, '#f00', [6, 6, 0, 0], undefined)).toEqual({ kind: 'rect', rect: R, fill: '#f00', corners: [6, 6, 0, 0] })
  })
})

describe('renderChart carries borderRadius into the draw list', () => {
  it('plain bars: every bar rect gets the mark radii, and a mark without them stays square', () => {
    const rounded = renderChart(spec(resolveMarks(ROWS, [bars((d: Row) => d.v, { borderRadius: [6, 6, 0, 0] })])), measure)
    expect(rects(rounded).map((c) => c.corners)).toEqual([[6, 6, 0, 0], [6, 6, 0, 0]])
    const square = renderChart(spec(resolveMarks(ROWS, [bars((d: Row) => d.v)])), measure)
    for (const c of rects(square)) expect(c.corners).toBeUndefined()
  })

  it('a scalar rounds all four', () => {
    const cmds = renderChart(spec(resolveMarks(ROWS, [bars((d: Row) => d.v, { borderRadius: 4 })])), measure)
    expect(rects(cmds)[0]!.corners).toEqual([4, 4, 4, 4])
  })

  it('stacked and grouped segments carry their own series radii', () => {
    const stacked = renderChart(
      spec(resolveMarks(ROWS, [stackedBars((d: Row) => d.v, { borderRadius: 3 }), stackedBars((d: Row) => d.v)])),
      measure,
    )
    const stackedCorners = rects(stacked).map((c) => c.corners)
    expect(stackedCorners).toContainEqual([3, 3, 3, 3])
    expect(stackedCorners).toContainEqual(undefined)
    const grouped = renderChart(spec(resolveMarks(ROWS, [groupedBars((d: Row) => d.v, { borderRadius: 2 })])), measure)
    expect(rects(grouped).every((c) => c.corners !== undefined)).toBe(true)
  })

  it('a horizontal bar rounds too', () => {
    const cmds = renderChart(
      spec(resolveMarks(ROWS, [bars((d: Row) => d.v, { borderRadius: [0, 5, 5, 0] })]), { horizontal: true }),
      measure,
    )
    expect(rects(cmds)[0]!.corners).toEqual([0, 5, 5, 0])
  })
})

describe('svgCommand', () => {
  const F = 'system-ui'

  it('serializes a square rect exactly as before', () => {
    expect(svgCommand({ kind: 'rect', rect: R, fill: '#f00' }, F)).toBe(
      '<rect x="10" y="20" width="40" height="100" fill="#f00"/>',
    )
  })

  it('serializes a rounded rect as a path of four clockwise arcs, clamped', () => {
    const d = svgCommand({ kind: 'rect', rect: R, fill: '#f00', corners: [6, 6, 0, 0] }, F)
    expect(d).toBe('<path d="M16 20H44A6 6 0 0 1 50 26V120H10V26A6 6 0 0 1 16 20Z" fill="#f00"/>')
  })

  it('falls back to <rect> when the radii clamp to nothing (a zero-height bar)', () => {
    const d = svgCommand({ kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 0 }, fill: '#f00', corners: [6, 6, 6, 6] }, F)
    expect(d.startsWith('<rect ')).toBe(true)
  })
})
