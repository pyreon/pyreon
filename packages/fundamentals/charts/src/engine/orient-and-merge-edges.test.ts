// A handful of single-arm edges across the facade, each a real authored shape:
// the three orientable families carrying `orient` onto both the canvas host
// and the SVG path, a scalar option key merging by replacement, large-data
// sampling refused (and named) when a series has its own x positions, and a
// calendar whose range runs backwards.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'
import { mergeChartOptions } from './option-composite'
import { compileFamily, familyToSvg } from './option-family'
import { familyHostNode } from './family-host'
import { layoutCalendar } from './calendar'

const SANKEY = { series: [{ type: 'sankey', orient: 'vertical', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }] }
const CALENDAR = { calendar: { range: '2024-01', orient: 'vertical' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3]] }] }
const PARALLEL = { parallel: { layout: 'vertical' }, parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }], series: [{ type: 'parallel', data: [[1, 2], [3, 4]] }] }

describe('orient reaches both the canvas host and the SVG', () => {
  for (const [name, option] of [['sankey', SANKEY], ['calendar', CALENDAR], ['parallel', PARALLEL]] as const) {
    it(`${name}: the host receives orient, and the SVG differs from the default orientation`, () => {
      const fam = compileFamily(option as EChartsOption)!
      const node = familyHostNode(fam.plan, { width: 300, height: 200 })!
      expect((node.props as { orient?: string }).orient).toBe('vertical')
      const vertical = familyToSvg(fam.plan, { width: 300, height: 200 })
      const { orient: _o, ...plain } = fam.plan as typeof fam.plan & { orient?: string }
      const horizontal = familyToSvg(plain as typeof fam.plan, { width: 300, height: 200 })
      expect(vertical).not.toBe(horizontal)
    })
  }
})

describe('a scalar option key merges by replacement', () => {
  it('a non-object previous value is simply replaced', () => {
    expect(mergeChartOptions({ animation: true }, { animation: false })['animation']).toBe(false)
    expect(mergeChartOptions({ color: 'red' }, { color: ['blue'] })['color']).toEqual(['blue'])
  })
})

describe('large-data sampling with a second value x axis', () => {
  it('is skipped, and the skip is named', () => {
    const c = compileOption({
      xAxis: [{ type: 'value' }, { type: 'value' }],
      yAxis: {},
      series: [
        { type: 'line', sampling: 'lttb', data: Array.from({ length: 50 }, (_, i) => [i, i]) },
        { type: 'line', xAxisIndex: 1, data: Array.from({ length: 50 }, (_, i) => [i * 10, i]) },
      ],
    } as EChartsOption, { width: 20 } as never)
    // The second series really does sit on the second axis — without that the
    // skip would never be exercised and this spec would pass vacuously.
    expect(c.spec.series.some((s) => s.onX2 === true)).toBe(true)
    expect(c.warnings.some((w) => w.message.includes('second value x axis'))).toBe(true)
  })
})

describe('a calendar range that runs backwards', () => {
  it('lays out without dividing by a non-positive week count', () => {
    const l = layoutCalendar('2024-03-01', '2024-01-01', { x: 0, y: 0, w: 300, h: 120 })
    for (const c of l.cells) {
      expect(Number.isFinite(c.rect.x)).toBe(true)
      expect(Number.isFinite(c.rect.w)).toBe(true)
    }
  })
})
