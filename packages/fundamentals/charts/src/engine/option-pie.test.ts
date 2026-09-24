/**
 * ECharts' pie keys: the arc layout they read to, the labels, the empty
 * circle, and the facade paths (canvas family host, SVG) that draw them.
 * The geometry itself is held against real ECharts in echarts-differential.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_ARCS, hitArc, layoutArcsWith, renderPie } from './arc'
import { arcSweep, readPieArcs, readPieEmpty, readPieLabels } from './option-pie'
import { compileFamily } from './option-family'
import { optionToSvg } from './option'
import type { EChartsOption } from './option'
import { truncateLabel } from './pie-labels'

const TAU = Math.PI * 2
const rows = [
  { value: 1, name: 'a', color: '#a00' },
  { value: 2, name: 'b', color: '#0a0' },
  { value: 3, name: 'c', color: '#00a' },
]

describe('readPieArcs', () => {
  it('ECharts defaults: 12 o\'clock, clockwise, a whole turn, zeros kept', () => {
    expect(readPieArcs({})).toEqual({ start: -Math.PI / 2, sweep: TAU, clockwise: true, minAngle: 0, padAngle: 0, rose: '', zeros: true })
  })

  it('reads startAngle / endAngle / clockwise / minAngle / padAngle / roseType / stillShowZeroSum', () => {
    const a = readPieArcs({ startAngle: 180, endAngle: 0, clockwise: true, minAngle: 10, padAngle: 4, roseType: 'area', stillShowZeroSum: false })
    expect(a.start).toBeCloseTo(-Math.PI, 9)
    expect(a.sweep).toBeCloseTo(Math.PI, 9)
    expect(a.minAngle).toBeCloseTo((10 * Math.PI) / 180, 9)
    expect(a.padAngle).toBeCloseTo((4 * Math.PI) / 180, 9)
    expect(a.rose).toBe('area')
    expect(a.zeros).toBe(false)
    expect(readPieArcs({ roseType: true }).rose).toBe('radius')
  })

  it('arcSweep follows the pie\'s direction round the turn', () => {
    // 90° → 0° runs a quarter counter-clockwise and three quarters clockwise.
    expect(arcSweep(-Math.PI / 2, 0, false)).toBeCloseTo(Math.PI * 1.5, 9)
    expect(arcSweep(-Math.PI / 2, 0, true)).toBeCloseTo(Math.PI / 2, 9)
    expect(arcSweep(0, -TAU * 2, true)).toBeCloseTo(TAU, 9)
  })
})

describe('layoutArcsWith', () => {
  const slices = rows.map((r) => ({ value: r.value, label: r.name, color: r.color }))

  it('a partial sweep scales every slice into it', () => {
    const arcs = layoutArcsWith(slices, { ...DEFAULT_ARCS, sweep: Math.PI, zeros: true })
    expect(arcs[arcs.length - 1]!.end - arcs[0]!.start).toBeCloseTo(Math.PI, 9)
    expect(arcs[2]!.end - arcs[2]!.start).toBeCloseTo(Math.PI / 2, 9)
  })

  it('reports each arc\'s INPUT index past a dropped slice, and hitArc answers by arc', () => {
    const arcs = layoutArcsWith([{ value: 0, label: 'z', color: '' }, ...slices], DEFAULT_ARCS)
    expect(arcs.map((a) => a.index)).toEqual([1, 2, 3])
    expect(hitArc(arcs, { x: 0, y: 0 }, 10, 0, { x: 3, y: -8 })).toBe(0)
  })

  it('hits a rose slice only within its reach, from any start angle', () => {
    const arcs = layoutArcsWith(slices, { ...DEFAULT_ARCS, start: 2.5, rose: 'radius' })
    const a = arcs[0]!
    const at = (r: number) => ({ x: Math.cos(a.mid) * r, y: Math.sin(a.mid) * r })
    expect(hitArc(arcs, { x: 0, y: 0 }, 30, 0, at(a.reach * 30 - 1))).toBe(0)
    expect(hitArc(arcs, { x: 0, y: 0 }, 30, 0, at(a.reach * 30 + 1))).toBe(-1)
  })
})

describe('readPieLabels', () => {
  it('ECharts\' default: outside, the name, 15 + 30 guide lines', () => {
    const l = readPieLabels({}, rows, rows)!
    expect(l).toMatchObject({ position: 'outside', texts: ['a', 'b', 'c'], leg1: 15, leg2: 30, distance: 5, avoidOverlap: true, overflow: 'truncate' })
  })

  it('a template reads {a} {b} {c} {d} with largest-remainder percents', () => {
    const l = readPieLabels({ name: 'S', label: { formatter: '{a}|{b}|{c}|{d}' } }, rows, rows)!
    expect(l.texts).toEqual(['S|a|1|16.67', 'S|b|2|33.33', 'S|c|3|50'])
  })

  it('percentPrecision rounds the share', () => {
    expect(readPieLabels({ percentPrecision: 0, label: { formatter: '{d}' } }, rows, rows)!.texts).toEqual(['17', '33', '50'])
  })

  it('a function formatter gets ECharts params, the datum included', () => {
    const seen: Record<string, unknown>[] = []
    const l = readPieLabels({ label: { formatter: (p: Record<string, unknown>) => (seen.push(p), `#${String(p['dataIndex'])}`) } }, rows, ['r0', 'r1', 'r2'])!
    expect(l.texts).toEqual(['#0', '#1', '#2'])
    expect(seen[1]).toMatchObject({ seriesType: 'pie', name: 'b', value: 2, percent: 33.33, data: 'r1' })
  })

  it('reads position, labelLine, colours and minShowLabelAngle; show: false turns labels off', () => {
    const l = readPieLabels({ minShowLabelAngle: 30, avoidLabelOverlap: false, label: { position: 'inner', color: 'inherit', fontSize: 9, overflow: 'none' }, labelLine: { show: false, length: 4, length2: 6, lineStyle: { color: '#f0f' } } }, rows, rows)!
    expect(l).toMatchObject({ position: 'inside', color: 'inherit', fontSize: 9, line: false, leg1: 4, leg2: 6, lineColor: '#f0f', avoidOverlap: false, overflow: 'none' })
    expect(l.minAngle).toBeCloseTo(Math.PI / 6, 9)
    expect(readPieLabels({ label: { show: false } }, rows, rows)).toBeUndefined()
    expect(readPieLabels({ label: { position: 'center' } }, rows, rows)!.position).toBe('center')
  })
})

describe('the empty circle', () => {
  it('lightgray by default, the series\' colour, or none', () => {
    expect(readPieEmpty({})).toBe('lightgray')
    expect(readPieEmpty({ emptyCircleStyle: { color: '#eee' } })).toBe('#eee')
    expect(readPieEmpty({ showEmptyCircle: false })).toBe('')
  })

  it('renderPie draws it only when there are no slices', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 }
    const base = { innerRadius: 0, showLabels: false, labelColor: '#fff', fontSize: 12, empty: 'lightgray' }
    expect(renderPie([], box, base).map((c) => (c.kind === 'polygon' ? c.fill : c.kind))).toEqual(['lightgray'])
    expect(renderPie([{ value: 1, label: 'a', color: '#123' }], box, base).map((c) => (c.kind === 'polygon' ? c.fill : c.kind))).toEqual(['#123'])
    expect(renderPie([], box, { ...base, empty: '' })).toEqual([])
  })
})

describe('truncateLabel (zrender\'s truncateText)', () => {
  const m = (t: string) => t.length * 6
  it('keeps what fits, cuts the rest with an ellipsis, drops the ellipsis when even that does not fit', () => {
    expect(truncateLabel('abcdef', 100, 12, m)).toBe('abcdef')
    expect(truncateLabel('abcdefghij', 40, 12, m)).toBe('abc...')
    expect(truncateLabel('abcdef', 12, 12, m)).toBe('a')
    expect(truncateLabel('abc', 1, 12, m)).toBe('')
  })
})

describe('the facade paths', () => {
  const option: EChartsOption = { series: [{ type: 'pie', startAngle: 0, data: [{ name: 'alpha', value: 1 }, { name: 'beta', value: 3 }] }] }

  it('compileFamily carries the pie shape on the plan, with no warnings for its keys', () => {
    const fam = compileFamily({ series: [{ type: 'pie', startAngle: 0, endAngle: 180, padAngle: 2, minAngle: 5, roseType: 'radius', labelLine: { length: 5 }, avoidLabelOverlap: false, percentPrecision: 1, showEmptyCircle: false, minShowLabelAngle: 3, left: 10, data: [1, 2] }] } as EChartsOption)!
    expect(fam.warnings).toEqual([])
    const plan = fam.plan
    if (plan.kind !== 'pie') throw new Error('pie')
    expect(plan.pie.arcs.rose).toBe('radius')
    expect(plan.pie.empty).toBe('')
  })

  it('optionToSvg draws the names outside on guide lines, at ECharts\' 50% radius', () => {
    const svg = optionToSvg(option, { width: 400, height: 300 })
    expect(svg).toContain('>alpha<')
    expect(svg).toContain('>beta<')
    expect(svg).toContain('<polyline')
    // The slice fill: a polygon whose points reach no further than 75px from the centre.
    const pts = [...svg.matchAll(/<polygon points="([^"]+)"/g)].flatMap((m) => m[1]!.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]))
    const far = Math.max(...pts.map(([x, y]) => Math.hypot(x - 200, y - 150)))
    expect(far).toBeCloseTo(75, 0)
  })
})
