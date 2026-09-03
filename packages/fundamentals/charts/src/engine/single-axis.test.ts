import { describe, expect, it } from 'vitest'
import { hitSingleAxis, layoutSingleAxis, renderSingleAxis, singleAxisToSvg } from './single-axis'
import { compileFamily, familyToSvg, isFamilyOption } from './option-family'

const box = { x: 0, y: 0, w: 400, h: 100 }

describe('single axis', () => {
  it('category axis: one tick per category, points at their category, radius by size', () => {
    const l = layoutSingleAxis({ type: 'category', categories: ['a', 'b', 'c'] }, [{ x: 0, size: 1 }, { x: 2, size: 4 }, { x: 1 }], box, { fontSize: 10, radius: 5 })
    expect(l.axis.ticks.map((t) => t.label)).toEqual(['a', 'b', 'c'])
    expect(l.axis.x0).toBe(20)
    expect(l.axis.x1).toBe(380)
    expect(l.points[0]!.at).toEqual({ x: 20, y: 50 })
    expect(l.points[1]!.at.x).toBe(380)
    expect(l.points[2]!.at.x).toBe(200)
    expect(l.points[1]!.radius).toBeCloseTo(10, 9)
    expect(l.points[2]!.radius).toBe(5)
  })
  it('value axis: data or fixed domain, nice ticks, degenerate span centred', () => {
    const l = layoutSingleAxis({ type: 'value' }, [{ x: 10 }, { x: 30 }], box, { fontSize: 10 })
    expect(l.points[0]!.at.x).toBe(20)
    expect(l.points[1]!.at.x).toBe(380)
    expect(l.axis.ticks.length).toBeGreaterThan(2)
    const fixed = layoutSingleAxis({ type: 'value', domain: [0, 100] }, [{ x: 50 }], box, { fontSize: 10 })
    expect(fixed.points[0]!.at.x).toBe(200)
    const flat = layoutSingleAxis({ type: 'value' }, [{ x: 7 }, { x: 7 }], box, { fontSize: 10 })
    expect(flat.points[0]!.at.x).toBe(200)
  })
  it('renders axis + ticks + points (+ opt-in labels, axis name); entrance grows; hit-testing', () => {
    const l = layoutSingleAxis({ type: 'category', categories: ['a', 'b'], name: 'Day' }, [{ x: 0, name: 'p' }, { x: 1 }], box)
    const cmds = renderSingleAxis(l, { showLabels: true })
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(3)
    expect(cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['a', 'b', 'Day', 'p'])
    const half = renderSingleAxis(l, { progress: 0.5 })
    const c0 = half.find((c) => c.kind === 'circle')!
    if (c0.kind !== 'circle') throw new Error('circle')
    expect(c0.radius).toBeCloseTo(2.5, 9)
    expect(hitSingleAxis(l, l.points[1]!.at.x + 2, l.points[1]!.at.y)).toBe(1)
    expect(hitSingleAxis(l, 200, 5)).toBe(-1)
  })
  it('singleAxisToSvg renders and describes', () => {
    const svg = singleAxisToSvg({ axis: { type: 'value' }, points: [{ x: 1 }, { x: 2 }], title: 'Ages' })
    expect(svg).toContain('<circle')
    expect(svg).toContain('2 points on a value axis')
  })
})

describe('singleAxis option mapping', () => {
  it('scatter on coordinateSystem singleAxis lowers the axis, sizes, names and colours', () => {
    const option = {
      singleAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'], name: 'Day' },
      series: [{ type: 'scatter', coordinateSystem: 'singleAxis', symbolSize: 12, label: { show: true }, itemStyle: { color: '#123456' }, data: [[0, 5], { name: 'big', value: [2, 20] }, 'junk'] }],
    }
    expect(isFamilyOption(option)).toBe(true)
    const f = compileFamily(option)!
    if (f.plan.kind !== 'singleAxis') throw new Error('kind')
    expect(f.plan.axis).toEqual({ type: 'category', categories: ['Mon', 'Tue', 'Wed'], name: 'Day' })
    expect(f.plan.points).toEqual([{ x: 0, size: 5 }, { x: 2, size: 20, name: 'big' }])
    expect(f.plan.options).toMatchObject({ radius: 6, showLabels: true, color: '#123456' })
    expect(f.warnings.map((w) => w.code)).toEqual(['series-data-shape'])
    expect(familyToSvg(f.plan)).toContain('<circle')
    const value = compileFamily({ singleAxis: { type: 'value', min: 0, max: 10 }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [3, 7] }] })!
    if (value.plan.kind !== 'singleAxis') throw new Error('kind')
    expect(value.plan.axis.domain).toEqual([0, 10])
    expect(value.plan.points.map((p) => p.x)).toEqual([3, 7])
    const bad = compileFamily({ singleAxis: {}, series: [{ type: 'bar', coordinateSystem: 'singleAxis', data: [1] }] })!
    expect(bad.warnings.map((w) => w.code)).toContain('series-type-unsupported')
  })
})
