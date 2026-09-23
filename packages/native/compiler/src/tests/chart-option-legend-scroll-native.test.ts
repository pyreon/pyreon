import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A scrolling legend (`legend.type: 'scroll'`) is paged on the web by
 * ECharts' controller. On a cartesian native host a horizontal one keeps one
 * row and pages the rest with the engine legend's own pager (tappable
 * arrows, "‹ 2/5 ›"); a vertical one, or one on a family host, still wraps and
 * says so instead of silently drawing a different legend.
 */
const src = (legend: string, series = "[{ type: 'bar', name: 'A', data: [1, 2] }, { type: 'bar', name: 'B', data: [2, 1] }]"): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ legend: ${legend}, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: ${series} }} />
}`
const pie = (legend: string): string => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ legend: ${legend}, series: [{ type: 'pie', data: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }] }] }} />
}`

describe.each(['swift', 'kotlin'] as const)('scrolling legend on %s', (target) => {
  const paged = transform(src("{ type: 'scroll' }"), { target })

  it('a horizontal scroll legend pages one row on a cartesian chart, with zero scroll warnings', () => {
    expect(paged.warnings.filter((w) => w.includes('scroll'))).toEqual([])
    expect(paged.code).toContain('pyreonLegendPage')
  })

  it('a vertical scroll legend still wraps, and says so', () => {
    const r = transform(src("{ type: 'scroll', orient: 'vertical' }"), { target })
    expect(r.warnings.some((w) => w.includes("'scroll' pages the legend on the web") && w.includes('vertical legend'))).toBe(true)
    expect(r.code).not.toContain('pyreonLegendPage')
  })

  it('a family host still wraps, and says so', () => {
    const r = transform(pie("{ type: 'scroll' }"), { target })
    expect(r.warnings.some((w) => w.includes("'scroll' pages the legend on the web"))).toBe(true)
  })

  it('a plain legend lowers without it', () => {
    const r = transform(src('{}'), { target })
    expect(r.warnings.filter((w) => w.includes('scroll'))).toEqual([])
    expect(r.code).not.toContain('pyreonLegendPage')
  })

  it('the toolchain accepts the paged legend', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(paged.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(paged.code)).toMatchObject({ ok: true })
  })
})
