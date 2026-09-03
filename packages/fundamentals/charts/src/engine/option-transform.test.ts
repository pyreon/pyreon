import { describe, expect, it } from 'vitest'
import { applyTransforms, resolveDataset } from './option-layer'
import { compileOption } from './option'
import type { OptionWarning } from './option'

const src = { source: [['name', 'score', 'team'], ['a', 5, 'x'], ['b', 9, 'y'], ['c', 1, 'x'], ['d', 7, 'y']] }

describe('dataset transforms', () => {
  it('filter by comparison, and/or/not trees; sort by one or many keys', () => {
    const t = { dims: ['name', 'score', 'team'], rows: [['a', 5, 'x'], ['b', 9, 'y'], ['c', 1, 'x'], ['d', 7, 'y']] }
    const f = applyTransforms(t, [{ type: 'filter', config: { dimension: 'score', gte: 5 } }], [])
    expect(f.rows.map((r) => r[0])).toEqual(['a', 'b', 'd'])
    const and = applyTransforms(t, [{ type: 'filter', config: { and: [{ dimension: 'score', gt: 1 }, { dimension: 'team', '=': 'x' }] } }], [])
    expect(and.rows.map((r) => r[0])).toEqual(['a'])
    const or = applyTransforms(t, [{ type: 'filter', config: { or: [{ dimension: 'name', eq: 'c' }, { dimension: 'score', '>=': 9 }] } }], [])
    expect(or.rows.map((r) => r[0])).toEqual(['b', 'c'])
    const not = applyTransforms(t, [{ type: 'filter', config: { not: { dimension: 'team', ne: 'y' } } }], [])
    expect(not.rows.map((r) => r[0])).toEqual(['b', 'd'])
    const sorted = applyTransforms(t, [{ type: 'sort', config: { dimension: 'score', order: 'desc' } }], [])
    expect(sorted.rows.map((r) => r[0])).toEqual(['b', 'd', 'a', 'c'])
    const multi = applyTransforms(t, [{ type: 'sort', config: [{ dimension: 'team', order: 'asc' }, { dimension: 'score', order: 'desc' }] }], [])
    expect(multi.rows.map((r) => r[0])).toEqual(['a', 'c', 'b', 'd'])
    const chained = applyTransforms(t, [{ type: 'filter', config: { dimension: 'team', eq: 'y' } }, { type: 'sort', config: { dimension: 'score', order: 'asc' } }], [])
    expect(chained.rows.map((r) => r[0])).toEqual(['d', 'b'])
  })
  it('unknown transform types and dimensions warn by name and pass the table through', () => {
    const warnings: OptionWarning[] = []
    const t = { dims: ['a'], rows: [[1], [2]] }
    const out = applyTransforms(t, [{ type: 'ecStat:regression' }, { type: 'filter', config: { dimension: 'zzz', gt: 0 } }], warnings, 'dataset[1]')
    expect(out.rows).toEqual([[1], [2]])
    expect(warnings.map((w) => w.path)).toEqual(['dataset[1].transform[0].type', 'dataset[1].transform[1].config.dimension'])
  })
  it('a derived dataset feeds a series through datasetIndex; fromDatasetIndex chains; the source dataset is untouched', () => {
    const option = {
      dataset: [
        src,
        { transform: { type: 'filter', config: { dimension: 'team', eq: 'x' } } },
        { fromDatasetIndex: 1, transform: { type: 'sort', config: { dimension: 'score', order: 'desc' } } },
      ],
      xAxis: { type: 'category' }, yAxis: {},
      series: [{ type: 'bar', datasetIndex: 2 }, { type: 'bar', datasetIndex: 0 }],
    }
    const { option: out, warnings } = resolveDataset(option)
    expect(warnings).toEqual([])
    const s = out['series'] as Record<string, unknown>[]
    expect(s[0]!['data']).toEqual([5, 1])
    expect(s[1]!['data']).toEqual([5, 9, 1, 7])
    expect((out['xAxis'] as Record<string, unknown>)['data']).toEqual(['a', 'c'])
    expect(compileOption(option).spec.series[0]!.values).toEqual([5, 1])
    expect(option.dataset[1]).toEqual({ transform: { type: 'filter', config: { dimension: 'team', eq: 'x' } } })
  })
})
