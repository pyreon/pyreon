import { describe, expect, it } from 'vitest'
import { computeLayout, edgeTicks } from './layout'
import type { LayoutConfig } from './layout'
import type { MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const cfg = (over: Partial<LayoutConfig> = {}): LayoutConfig => ({
  width: 400, height: 300, xDomain: { min: 0, max: 10 }, yDomain: { min: 0, max: 100 },
  categories: [], fontSize: 12, xTickCount: 5, yTickCount: 5, showXAxis: true, showYAxis: true, ...over,
})

describe('computeLayout — fixed insets without containment', () => {
  it('a set side places the plot edge exactly there, ignoring its labels', () => {
    const l = computeLayout(cfg({ insetLeft: 3, insetRight: 4, insetTop: 5, insetBottom: 6 }), measure)
    expect(l.plot).toEqual({ x: 3, y: 5, w: 400 - 3 - 4, h: 300 - 5 - 6 })
    expect(l.gutters).toEqual({ left: 3, right: 4, top: 5, bottom: 6 })
  })
  it('with insetContain the same small insets grow to fit the labels', () => {
    const l = computeLayout(cfg({ insetLeft: 3, insetRight: 4, insetTop: 5, insetBottom: 6, insetContain: true }), measure)
    expect(l.gutters.left).toBeGreaterThan(3)
    expect(l.gutters.bottom).toBeGreaterThan(6)
  })
})

describe('computeLayout — extra y axes', () => {
  it('an extra axis without a domain falls back to 0..1 and still ticks', () => {
    const l = computeLayout(cfg({ extraYAxes: [{ side: 'right' }] }), measure)
    const labels = l.extraTicks.map((t) => t.label)
    expect(labels[0]).toBe('0')
    expect(labels[labels.length - 1]).toBe('1')
    expect(l.extraTicks.every((t) => t.axis === 0)).toBe(true)
  })
  it('a titled left extra axis widens the left gutter more than an untitled one', () => {
    const plain = computeLayout(cfg({ extraYAxes: [{ side: 'left', domain: { min: 0, max: 1e6 }, offset: 80 }] }), measure)
    const titled = computeLayout(cfg({ extraYAxes: [{ side: 'left', domain: { min: 0, max: 1e6 }, offset: 80, title: 'T' }] }), measure)
    expect(titled.gutters.left).toBe(plain.gutters.left + 12 + 6)
  })
  it('two axes on one side: the gutter is the widest band, whichever comes first', () => {
    const wide = { domain: { min: 0, max: 1e6 }, offset: 80 }
    const narrow = { domain: { min: 0, max: 1 }, offset: 0 }
    for (const side of ['left', 'right']) {
      const alone = computeLayout(cfg({ extraYAxes: [{ side, ...wide }] }), measure)
      const both = computeLayout(cfg({ extraYAxes: [{ side, ...wide }, { side, ...narrow }] }), measure)
      expect(both.gutters).toEqual(alone.gutters)
    }
  })
})

describe('computeLayout — echarts label mode', () => {
  const cats = ['a', 'b', 'c', 'd', 'e', 'f']
  it('a fixed interval shows every (interval + 1)th label', () => {
    expect(computeLayout(cfg({ categories: cats, xLabels: 'echarts', xLabelInterval: 2 }), measure).xLabelEvery).toBe(3)
    expect(computeLayout(cfg({ categories: cats, xLabels: 'echarts', xLabelInterval: 0 }), measure).xLabelEvery).toBe(1)
  })
  it('upright labels are bounded only by their width along the axis', () => {
    const few = computeLayout(cfg({ categories: cats, xLabels: 'echarts' }), measure)
    expect(few.xLabelRotate).toBe(0)
    expect(few.xLabelEvery).toBe(1)
    const many = Array.from({ length: 40 }, (_, i) => `category-${i}`)
    expect(computeLayout(cfg({ categories: many, xLabels: 'echarts' }), measure).xLabelEvery).toBeGreaterThan(1)
  })
  it('a tiny angle on a short label adds no slant height (clamped at 0)', () => {
    const upright = computeLayout(cfg({ categories: [''], xLabels: 'echarts' }), measure)
    const tilted = computeLayout(cfg({ categories: [''], xLabels: 'echarts', xLabelAngle: 1 }), measure)
    expect(tilted.xLabelRotate).toBe(1)
    expect(tilted.gutters.bottom).toBe(upright.gutters.bottom)
  })
  it('a 90° label is bounded only by its height across the category', () => {
    const many = Array.from({ length: 30 }, (_, i) => `label-${i}`)
    const l = computeLayout(cfg({ categories: many, xLabels: 'echarts', xLabelAngle: 90 }), measure)
    expect(l.xLabelRotate).toBe(90)
    // 30 categories over ~<380px is ~12px each; a 12px font × 1.3 = 15.6 needs every 2nd.
    expect(l.xLabelEvery).toBe(2)
  })
})

describe('edgeTicks', () => {
  const plot = { x: 10, y: 0, w: 100, h: 50 }
  it('no categories yields no ticks', () => {
    expect(edgeTicks([], plot)).toEqual([])
  })
  it('a single category sits at the plot centre; several run edge to edge', () => {
    expect(edgeTicks(['a'], plot)).toEqual([{ value: 0, pos: 60, label: 'a' }])
    expect(edgeTicks(['a', 'b'], plot).map((t) => t.pos)).toEqual([10, 110])
  })
})
