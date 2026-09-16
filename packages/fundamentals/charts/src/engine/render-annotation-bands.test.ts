// The annotation SHAPES the renderer can draw, each asserted by the geometry
// it produces rather than by the fact that it ran. The existing render suites
// pair annotations with a log view and a normalized stack but never drive the
// band and segment arms themselves — and each of those arms has a with-label
// and a without-label half, which is where the uncovered branches sat.
import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6

const series = (over: Partial<Series> & Pick<Series, 'kind' | 'values'>): Series => ({
  color: '#0f766e',
  width: 1.5,
  radius: 3,
  label: 'S',
  ...over,
})

const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 200,
  series: [series({ kind: 'line', values: [10, 20, 30, 40] })],
  categories: [],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})

const draw = (over: Partial<ChartSpec>): DrawCmd[] => renderChart(spec(over), measure)
const texts = (cmds: DrawCmd[]): string[] => cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))
const rects = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'rect')

describe('horizontal band (yFrom/yTo)', () => {
  it('draws one rect spanning the full plot width, and its label when named', () => {
    const before = rects(draw({})).length
    const cmds = draw({ annotations: [{ yFrom: 15, yTo: 25, label: 'target' }] })
    expect(rects(cmds).length).toBe(before + 1)
    expect(texts(cmds)).toContain('target')
    const band = rects(cmds).at(-1)!
    // A y-band spans the plot horizontally and has real height.
    expect(band.kind === 'rect' && band.rect.h).toBeGreaterThan(0)
  })

  it('draws the band but no text when the annotation is unnamed', () => {
    const named = texts(draw({ annotations: [{ yFrom: 15, yTo: 25, label: 'target' }] }))
    const bare = texts(draw({ annotations: [{ yFrom: 15, yTo: 25 }] }))
    expect(named.length).toBe(bare.length + 1)
    expect(bare).not.toContain('target')
  })

  it('is orientation-insensitive — a reversed pair spans the same box', () => {
    const up = rects(draw({ annotations: [{ yFrom: 15, yTo: 25 }] })).at(-1)!
    const down = rects(draw({ annotations: [{ yFrom: 25, yTo: 15 }] })).at(-1)!
    expect(up.kind === 'rect' && down.kind === 'rect' && up.rect).toEqual(down.rect)
  })
})

describe('vertical band (xFrom/xTo)', () => {
  const xs = { xValues: [0, 1, 2, 3] }

  it('draws one rect spanning the full plot height, and its label when named', () => {
    const before = rects(draw(xs)).length
    const cmds = draw({ ...xs, annotations: [{ xFrom: 1, xTo: 2, label: 'window' }] })
    expect(rects(cmds).length).toBe(before + 1)
    expect(texts(cmds)).toContain('window')
    const band = rects(cmds).at(-1)!
    expect(band.kind === 'rect' && band.rect.w).toBeGreaterThan(0)
  })

  it('draws the band but no text when unnamed', () => {
    const bare = texts(draw({ ...xs, annotations: [{ xFrom: 1, xTo: 2 }] }))
    expect(bare).not.toContain('window')
  })

  it('is orientation-insensitive — a reversed pair spans the same box', () => {
    const up = rects(draw({ ...xs, annotations: [{ xFrom: 1, xTo: 2 }] })).at(-1)!
    const down = rects(draw({ ...xs, annotations: [{ xFrom: 2, xTo: 1 }] })).at(-1)!
    expect(up.kind === 'rect' && down.kind === 'rect' && up.rect).toEqual(down.rect)
  })
})

describe('point-to-point segment (x1/y1 → x2/y2)', () => {
  const xs = { xValues: [0, 1, 2, 3] }

  it('draws a dashed line between the two points, and its label when named', () => {
    const cmds = draw({ ...xs, annotations: [{ x1: 0, y1: 10, x2: 3, y2: 40, label: 'trend' }] })
    const line = cmds.filter((c) => c.kind === 'line').at(-1)!
    expect(line.kind === 'line' && line.dash).toEqual([4, 4])
    expect(texts(cmds)).toContain('trend')
  })

  it('draws the line but no text when unnamed', () => {
    const cmds = draw({ ...xs, annotations: [{ x1: 0, y1: 10, x2: 3, y2: 40 }] })
    expect(cmds.some((c) => c.kind === 'line' && c.dash !== undefined)).toBe(true)
    expect(texts(cmds)).not.toContain('trend')
  })

  it('an INCOMPLETE point pair draws no segment at all', () => {
    // Three of the four coordinates is not a segment — drawing one would put a
    // line at an origin the author never asked for.
    const base = draw(xs).filter((c) => c.kind === 'line').length
    const partial = draw({ ...xs, annotations: [{ x1: 0, y1: 10, x2: 3 }] }).filter((c) => c.kind === 'line').length
    expect(partial).toBe(base)
  })
})

describe('annotation colour', () => {
  it('an explicit colour paints both the band and its label; otherwise the theme does', () => {
    const custom = draw({ annotations: [{ yFrom: 15, yTo: 25, label: 'c', color: '#ff00ff' }] })
    const band = rects(custom).at(-1)!
    // The band is the colour at reduced alpha; the label is the colour itself.
    expect(band.kind === 'rect' && band.fill).toContain('255')
    const label = custom.find((c) => c.kind === 'text' && c.text === 'c')!
    expect(label.kind === 'text' && label.fill).toBe('#ff00ff')

    const themed = draw({ annotations: [{ yFrom: 15, yTo: 25, label: 'c' }] })
    const themedLabel = themed.find((c) => c.kind === 'text' && c.text === 'c')!
    expect(themedLabel.kind === 'text' && themedLabel.fill).toBe(defaultTheme.label)
  })
})
