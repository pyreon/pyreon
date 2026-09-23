import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * A scrolling legend (`legend.type: 'scroll'`) is paged on the web by
 * ECharts' controller. The native legend has no pager, so the option says so
 * instead of silently drawing a different legend.
 */
const src = (legend: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ legend: ${legend}, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', name: 'A', data: [1, 2] }, { type: 'bar', name: 'B', data: [2, 1] }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('scrolling legend on %s', (target) => {
  it("names 'scroll' as web-only", () => {
    const r = transform(src("{ type: 'scroll' }"), { target })
    expect(r.warnings.some((w) => w.includes("'scroll' pages the legend on the web"))).toBe(true)
  })
  it('a plain legend lowers without it', () => {
    const r = transform(src('{}'), { target })
    expect(r.warnings.filter((w) => w.includes('scroll'))).toEqual([])
  })
})
