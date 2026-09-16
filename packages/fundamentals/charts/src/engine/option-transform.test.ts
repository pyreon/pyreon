import { describe, expect, it } from 'vitest'
import { applyTransforms, applyTransformsAll, listChartTransforms, registerChartTransform, resolveDataset, unregisterChartTransform } from './option-layer'
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
    expect(warnings[0]!.message).toContain('registerChartTransform')
  })
  it('a registered transform (the echarts.registerTransform / ecStat contract) runs with the upstream surface and can name its dimensions', () => {
    const seen: unknown[] = []
    registerChartTransform({
      type: 'test:double',
      transform: ({ upstream, config }) => {
        seen.push(config, upstream.sourceFormat, upstream.getDimensionInfo('score'), upstream.getDimensionInfo(9), upstream.cloneAllDimensionInfo().map((d) => d.name))
        const rows = upstream.cloneRawData()
        rows[0]![1] = 999 // a clone: the upstream must not see this
        return { dimensions: ['name', 'doubled'], data: upstream.getRawData().map((r) => [r[0], (r[1] as number) * 2]) }
      },
    })
    try {
      const t = { dims: ['name', 'score', 'team'], rows: [['a', 5, 'x'], ['b', 9, 'y']] }
      const warnings: OptionWarning[] = []
      const out = applyTransforms(t, [{ type: 'test:double', config: { k: 1 } }], warnings)
      expect(warnings).toEqual([])
      expect(out).toEqual({ dims: ['name', 'doubled'], rows: [['a', 10], ['b', 18]] })
      expect(t.rows[0]![1], 'cloneRawData is a copy').toBe(5)
      expect(seen).toEqual([{ k: 1 }, 'arrayRows', { index: 1, name: 'score', displayName: 'score' }, undefined, ['name', 'score', 'team']])
      expect(listChartTransforms()).toContain('test:double')
      // Object records and an undeclared width fall back to the record keys / the upstream dims / dimN.
      registerChartTransform({ type: 'test:objects', transform: ({ upstream }) => ({ data: upstream.getRawData().map((r) => ({ label: r[0], total: r[1] })) }) })
      expect(applyTransforms(t, [{ type: 'test:objects' }], [])).toEqual({ dims: ['label', 'total'], rows: [['a', 5], ['b', 9]] })
      registerChartTransform({ type: 'test:same-width', transform: ({ upstream }) => ({ data: upstream.getRawData().map((r) => r.slice()) }) })
      expect(applyTransforms(t, [{ type: 'test:same-width' }], []).dims).toEqual(['name', 'score', 'team'])
      registerChartTransform({ type: 'test:narrow', transform: () => ({ data: [[1, 2]] }) })
      expect(applyTransforms(t, [{ type: 'test:narrow' }], []).dims).toEqual(['dim0', 'dim1'])
      // A throwing transform warns by name and passes the table through.
      registerChartTransform({ type: 'test:boom', transform: () => { throw new Error('nope') } })
      const boom: OptionWarning[] = []
      expect(applyTransforms(t, [{ type: 'test:boom' }], boom, 'dataset[2]')).toEqual(t)
      expect(boom).toEqual([{ code: 'series-data-shape', path: 'dataset[2].transform[0]', message: expect.stringContaining('threw (nope)') }])
    } finally {
      for (const type of ['test:double', 'test:objects', 'test:same-width', 'test:narrow', 'test:boom']) unregisterChartTransform(type)
    }
    expect(listChartTransforms()).not.toContain('test:double')
    expect(applyTransforms({ dims: ['a'], rows: [[1]] }, [{ type: 'test:double' }], []).rows).toEqual([[1]])
  })
  it('a multi-result transform feeds fromTransformResult; datasets and series resolve by id; encode names series and datums', () => {
    registerChartTransform({
      type: 'test:split',
      transform: ({ upstream }) => {
        const rows = upstream.getRawData()
        return [{ data: rows.filter((r) => r[2] === 'x') }, { data: rows.filter((r) => r[2] === 'y') }]
      },
    })
    try {
      const option = {
        dataset: [
          { id: 'raw', ...src },
          { id: 'split', fromDatasetId: 'raw', transform: { type: 'test:split' } },
          { id: 'ys', fromDatasetId: 'split', fromTransformResult: 1 },
          { id: 'ys-sorted', fromDatasetId: 'ys', transform: { type: 'sort', config: { dimension: 'score', order: 'desc' } } },
          { fromDatasetId: 'split', fromTransformResult: 5 },
        ],
        xAxis: { type: 'category' }, yAxis: {},
        series: [
          { type: 'bar', datasetId: 'split', encode: { x: 'name', y: 'score', seriesName: 'score', itemName: 'name' } },
          { type: 'bar', datasetId: 'ys-sorted', encode: { x: 'name', y: 'score' } },
          { type: 'bar', datasetIndex: 4 },
          { type: 'bar', datasetId: 'missing' },
        ],
      }
      const { option: out, warnings } = resolveDataset(option)
      const s = out['series'] as Record<string, unknown>[]
      expect(applyTransformsAll({ dims: ['name', 'score', 'team'], rows: src.source.slice(1) }, [{ type: 'test:split' }], []).map((r) => r.rows.length)).toEqual([2, 2])
      expect(s[0]!['name'], 'encode.seriesName names the series after the dimension').toBe('score')
      expect(s[0]!['data'], 'encode.itemName names each datum').toEqual([{ name: 'a', value: 5 }, { name: 'c', value: 1 }])
      expect(s[0]!['datasetId']).toBeUndefined()
      expect(s[1]!['data'], 'result 1 of the split, sorted').toEqual([9, 7])
      expect(warnings.map((w) => w.path)).toEqual(['dataset[4].fromTransformResult', 'series[2].datasetIndex', 'series[3].datasetId'])
      expect(warnings[0]!.message).toContain('produced 2 result(s); result 5 does not exist')
      // An explicit name beats encode.seriesName; an unknown itemName dimension warns and keeps bare values.
      const named = resolveDataset({ dataset: src, series: [{ type: 'bar', name: 'Mine', encode: { y: 'score', seriesName: 'score', itemName: 'nope' } }] })
      expect((named.option['series'] as Record<string, unknown>[])[0]!['name']).toBe('Mine')
      expect((named.option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([5, 9, 1, 7])
      expect(named.warnings.map((w) => w.path)).toEqual(['series[0].encode.itemName'])
      const tip = resolveDataset({ dataset: src, series: [{ type: 'bar', encode: { y: 'score', tooltip: ['score', 'team'] } }] })
      expect(tip.warnings.map((w) => w.code + ' ' + w.path)).toEqual(['option-key-unsupported series[0].encode.tooltip'])
    } finally {
      unregisterChartTransform('test:split')
    }
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
