import { describe, expect, it } from 'vitest'
import { hitFunnel, hitFunnelEc, layoutFunnel, renderFunnel, renderFunnelEc } from './funnel'
import { compileFamily } from './option-family'
import type { EChartsOption } from './option'
import { funnelToSvg } from './family-svg'
import type { FunnelStage } from './funnel'

const plot = { x: 0, y: 0, w: 200, h: 100 }
const stages: FunnelStage[] = [
  { value: 50, label: 'Visit', color: '#a' },
  { value: 100, label: 'Sign-up', color: '#b' },
  { value: 20, label: 'Buy', color: '#c' },
]

describe('funnel geometry', () => {
  it('sorts descending by default but names INPUT indices', () => {
    const g = layoutFunnel(stages, plot)
    expect(g.map((s) => s.index)).toEqual([1, 0, 2])
    expect(g[0]!.topWidth).toBe(200)
    expect(g[1]!.topWidth).toBe(100)
    expect(g[2]!.topWidth).toBe(40)
  })
  it('each stage tapers toward the next; the last tapers to minWidthRatio', () => {
    const g = layoutFunnel(stages, plot, { minWidthRatio: 0.1 })
    expect(g[0]!.bottomWidth).toBe(g[1]!.topWidth)
    expect(g[2]!.bottomWidth).toBe(20)
  })
  it('sort: none keeps input order; ascending reverses', () => {
    expect(layoutFunnel(stages, plot, { sort: 'none' }).map((s) => s.index)).toEqual([0, 1, 2])
    expect(layoutFunnel(stages, plot, { sort: 'ascending' }).map((s) => s.index)).toEqual([2, 0, 1])
  })
  it('stages fill the height with gaps between them', () => {
    const g = layoutFunnel(stages, plot, { gap: 5 })
    expect(g[0]!.top).toBe(0)
    expect(g[2]!.bottom).toBeCloseTo(100, 9)
    expect(g[1]!.top - g[0]!.bottom).toBeCloseTo(5, 9)
  })
  it('renders one polygon per stage plus labels; entrance scales widths and hides labels', () => {
    const full = renderFunnel(stages, plot)
    expect(full.filter((c) => c.kind === 'polygon')).toHaveLength(3)
    expect(full.filter((c) => c.kind === 'text').map((c) => c.kind === 'text' && c.text)).toEqual(['Sign-up', 'Visit', 'Buy'])
    const half = renderFunnel(stages, plot, { progress: 0.5 })
    expect(half.filter((c) => c.kind === 'text')).toHaveLength(0)
    const p = half[0]!
    if (p.kind !== 'polygon') throw new Error('polygon')
    expect(p.points[1]!.x - p.points[0]!.x).toBeCloseTo(100, 9)
  })
  it('hit-testing returns the input index of the stage under a point, -1 outside', () => {
    expect(hitFunnel(stages, plot, 100, 10)).toBe(1)
    expect(hitFunnel(stages, plot, 100, 50)).toBe(0)
    expect(hitFunnel(stages, plot, 100, 90)).toBe(2)
    expect(hitFunnel(stages, plot, 2, 90)).toBe(-1)
  })
  it('a zero-max funnel does not divide by zero', () => {
    const g = layoutFunnel([{ value: 0, label: 'a', color: '#a' }], plot)
    expect(Number.isFinite(g[0]!.topWidth)).toBe(true)
  })
  it('funnelToSvg renders labels and derives a description from a title', () => {
    const svg = funnelToSvg({ data: stages, value: (d) => d.value, label: (d) => d.label, title: 'Conversion' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('Sign-up')
    expect(svg).toContain('3 stages')
    expect(svg).not.toContain('NaN')
  })
})

describe('the ECharts funnel: hit test and draw order', () => {
  const ecOf = (series: object) => {
    const plan = compileFamily({ series: [{ type: 'funnel', data: [{ name: 'Visit', value: 60 }, { name: 'Cart', value: 40 }, { name: 'Order', value: 20 }], ...series }] } as EChartsOption)!.plan
    if (plan.kind !== 'funnel') throw new Error('not a funnel')
    return plan.ec
  }
  const st: FunnelStage[] = [
    { value: 60, label: 'Visit', color: '#5070dd' },
    { value: 40, label: 'Cart', color: '#b6d634' },
    { value: 20, label: 'Order', color: '#505372' },
  ]
  // ECharts' default box on a 400×300 chart: x 80..320, y 60..235.
  const box = { x: 80, y: 60, w: 240, h: 175 }

  it('hits the stage under the point, by its polygon', () => {
    const ec = ecOf({})
    expect(hitFunnelEc(st, box, ec, 200, 80)).toBe(0)
    expect(hitFunnelEc(st, box, ec, 200, 150)).toBe(1)
    expect(hitFunnelEc(st, box, ec, 200, 220)).toBe(2)
    // Beside the narrowing stage, inside its bounding box but outside its polygon.
    expect(hitFunnelEc(st, box, ec, 130, 220)).toBe(-1)
  })

  it('an ascending funnel is hit where it is drawn: the largest stage at the bottom', () => {
    const ec = ecOf({ sort: 'ascending' })
    expect(hitFunnelEc(st, box, ec, 200, 220)).toBe(0)
    expect(hitFunnelEc(st, box, ec, 200, 80)).toBe(2)
  })

  it('draws leader lines under the stages and labels over them', () => {
    const cmds = renderFunnelEc(st, box, ecOf({}), 1, '')
    const kinds = cmds.map((c) => c.kind)
    expect(kinds.indexOf('polygon')).toBeGreaterThan(kinds.indexOf('polyline'))
    expect(kinds.lastIndexOf('polygon')).toBeLessThan(kinds.indexOf('text'))
  })

  it('labels wait for the entrance to finish', () => {
    expect(renderFunnelEc(st, box, ecOf({}), 0.5, '').some((c) => c.kind === 'text')).toBe(false)
  })

  it('the border takes the chart background, white on a bare chart', () => {
    const ring = (bg: string) => renderFunnelEc(st, box, ecOf({}), 1, bg).find((c) => c.kind === 'polyline' && c.points.length === 5)
    expect(ring('')).toMatchObject({ stroke: '#ffffff', width: 1 })
    expect(ring('#101418')).toMatchObject({ stroke: '#101418' })
  })
})
