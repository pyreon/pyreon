import { describe, expect, it } from 'vitest'
import { hitRiver, layerPolygon, layoutRiver, renderRiver, smoothPoints } from './river'
import { riverToSvg } from './family-svg'
import type { RiverSeries } from './river'
import { compileFamily, familyToSvg } from './option-family'

const box = { x: 0, y: 0, w: 400, h: 200 }
const series: RiverSeries[] = [
  { name: 'a', values: [1, 3, 2, 4] },
  { name: 'b', values: [2, 1, 3, 1] },
  { name: 'c', values: [1, 1, 1, 1] },
]

describe('theme river layout', () => {
  it('layers stack without gaps and the silhouette is symmetric about the midline', () => {
    const l = layoutRiver(series, box, { showAxis: false })
    expect(l.layers).toHaveLength(3)
    for (let i = 0; i < 4; i++) {
      expect(l.layers[1]!.bottom[i]!.y).toBeCloseTo(l.layers[0]!.top[i]!.y, 9)
      expect(l.layers[2]!.bottom[i]!.y).toBeCloseTo(l.layers[1]!.top[i]!.y, 9)
      const mid = (l.layers[0]!.bottom[i]!.y + l.layers[2]!.top[i]!.y) / 2
      expect(mid).toBeCloseTo(100, 6)
    }
    expect(l.xs).toEqual([0, 400 / 3, 800 / 3, 400])
  })
  it('zero baseline stacks from the bottom edge; thickness tracks the widest value', () => {
    const l = layoutRiver(series, box, { baseline: 'zero', showAxis: false })
    for (const p of l.layers[0]!.bottom) expect(p.y).toBeCloseTo(200, 6)
    const widest = l.layers[0]!
    expect(widest.labelAt.x).toBeCloseTo(400, 6)
    expect(widest.thickness).toBeGreaterThan(0)
    const empty = layoutRiver([{ name: 'z', values: [0, 0] }], box)
    expect(empty.layers[0]!.thickness).toBe(0)
  })
  it('categories drive tick labels; missing values are zero; the axis reserves space', () => {
    const l = layoutRiver([{ name: 'a', values: [1, NaN] }, { name: 'b', values: [1] }], box, { categories: ['Jan', 'Feb'] })
    expect(l.ticks.map((t) => t.label)).toEqual(['Jan', 'Feb'])
    expect(l.plot.h).toBeLessThan(200)
    expect(l.layers[0]!.top[1]!.y).toBeCloseTo(l.layers[0]!.bottom[1]!.y, 9)
  })
  it('smoothing keeps the endpoints and adds interior samples; linear does not', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]
    const s = smoothPoints(pts)
    expect(s[0]).toEqual(pts[0])
    expect(s[s.length - 1]).toEqual(pts[2])
    expect(s.length).toBe(17)
    const l = layoutRiver(series, box)
    expect(layerPolygon(l.layers[0]!, 'linear', 1).length).toBe(8)
    expect(layerPolygon(l.layers[0]!, 'smooth', 1).length).toBeGreaterThan(8)
  })
  it('renders one polygon per non-empty layer, axis, labels for thick layers; entrance flows in', () => {
    const l = layoutRiver(series, box)
    const cmds = renderRiver(l)
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(3)
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(1)
    expect(cmds.filter((c) => c.kind === 'text').length).toBeGreaterThanOrEqual(4)
    const half = renderRiver(l, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    const full = cmds.find((c) => c.kind === 'polygon')!
    const part = half.find((c) => c.kind === 'polygon')!
    if (full.kind !== 'polygon' || part.kind !== 'polygon') throw new Error('polygon')
    expect(Math.max(...part.points.map((p) => p.x))).toBeLessThan(Math.max(...full.points.map((p) => p.x)))
    expect(renderRiver(l, { progress: 0 })).toHaveLength(0)
  })
  it('hit-testing returns the layer under a point, front-most first', () => {
    const l = layoutRiver(series, box, { curve: 'linear', showAxis: false })
    const a = l.layers[0]!
    const y = (a.top[0]!.y + a.bottom[0]!.y) / 2
    expect(hitRiver(l, 1, y, 'linear')!.name).toBe('a')
    expect(hitRiver(l, 1, 1, 'linear')).toBeNull()
  })
  it('riverToSvg renders and describes', () => {
    const svg = riverToSvg({ series, title: 'Traffic', river: { categories: ['q1', 'q2', 'q3', 'q4'] } })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('3 streams over 4 points (a, b, c)')
    expect(svg).not.toContain('NaN')
  })
})

describe('theme river option mapping', () => {
  it('[date, value, name] triples group into streams over the sorted date axis', () => {
    const f = compileFamily({
      singleAxis: { type: 'time' },
      series: [{ type: 'themeRiver', data: [['2024-01-02', 5, 'x'], ['2024-01-01', 3, 'x'], ['2024-01-01', 2, 'y'], ['2024-01-03', 1, 'y']], label: { show: false } }],
    })!
    if (f.plan.kind !== 'themeRiver') throw new Error('kind')
    expect(f.plan.river.categories).toEqual(['2024-01-01', '2024-01-02', '2024-01-03'])
    expect(f.plan.series.map((s) => s.name)).toEqual(['x', 'y'])
    expect(f.plan.series[0]!.values).toEqual([3, 5, 0])
    expect(f.plan.series[1]!.values).toEqual([2, 0, 1])
    expect(f.plan.river.showLabels).toBe(false)
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<polygon')
    const bad = compileFamily({ series: [{ type: 'themeRiver', data: [['2024-01-01', 'nope', 'x'], 'junk'] }] })!
    expect(bad.warnings.filter((w) => w.code === 'series-data-shape')).toHaveLength(2)
  })
})
