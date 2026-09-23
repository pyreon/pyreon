import { afterEach, describe, expect, it } from 'vitest'
import { applyTransformsAll, registerChartTransform, resolveDataset, unregisterChartTransform } from './option-layer'

type Obj = Record<string, unknown>
const seriesOf = (o: Obj): Obj[] => o['series'] as Obj[]

afterEach(() => {
  unregisterChartTransform('cov:scalars')
})

describe('registered transform — scalar records', () => {
  it('a record that is neither a row nor an object is skipped', () => {
    registerChartTransform({ type: 'cov:scalars', transform: () => ({ data: [[1, 2], 5, 'x', [3, 4]] }) as never })
    const [out] = applyTransformsAll({ dims: ['a', 'b'], rows: [] }, [{ type: 'cov:scalars' }], [])
    expect(out!.rows).toEqual([[1, 2], [3, 4]])
    // Same width as the upstream → the upstream's dimension names carry over.
    expect(out!.dims).toEqual(['a', 'b'])
  })
})

describe('resolveDataset — a derived dataset whose upstream index does not exist', () => {
  it('warns on fromDatasetIndex and leaves the series empty', () => {
    const { option, warnings } = resolveDataset({
      dataset: [{ source: [['a', 'b'], ['x', 1]] }, { fromDatasetIndex: 9, transform: { type: 'filter', config: {} } }],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    expect(warnings.some((w) => w.path === 'dataset[1].fromDatasetIndex' && /index 9/.test(w.message))).toBe(true)
    expect(seriesOf(option)[0]!['data']).toBeUndefined()
  })
})

describe('resolveDataset — a series\' own `dimensions`', () => {
  const dataset = { source: [['a', 'b'], ['x', 1], ['y', 2]] }
  it('object and string entries rename the columns the encode reads', () => {
    const { option } = resolveDataset({ dataset, series: [{ type: 'bar', dimensions: [{ name: 'cat' }, 'val'], encode: { x: 'cat', y: 'val' } }] })
    expect(seriesOf(option)[0]!['data']).toEqual([1, 2])
    expect((option['xAxis'] as Obj)['data']).toEqual(['x', 'y'])
  })
  it('a non-name entry keeps the dataset\'s own name; a short list keeps the rest', () => {
    const kept = resolveDataset({ dataset, series: [{ type: 'bar', dimensions: [{ name: 'cat' }, 7, 8], encode: { x: 'cat', y: 'b' } }] })
    expect(seriesOf(kept.option)[0]!['data']).toEqual([1, 2])
    const short = resolveDataset({ dataset, series: [{ type: 'bar', dimensions: [{ name: 'cat' }], encode: { x: 'cat', y: 'b' } }] })
    expect(seriesOf(short.option)[0]!['data']).toEqual([1, 2])
  })
})

describe('resolveDataset — tuple families on sparse or odd cells', () => {
  it('candlestick: a non-numeric cell reads 0; a second candlestick keeps the first x axis', () => {
    const { option } = resolveDataset({
      dataset: { source: [['d', 'o', 'c', 'l', 'h'], ['d1', 1, 'n/a', 0, 3], ['d2', 2, 3, 1, 4]] },
      series: [{ type: 'candlestick' }, { type: 'candlestick', encode: { x: 'l' } }],
    })
    expect(seriesOf(option)[0]!['data']).toEqual([[1, 0, 0, 3], [2, 3, 1, 4]])
    // The first series claimed the x axis — the second's own x column does not overwrite it.
    expect((option['xAxis'] as Obj)['data']).toEqual(['d1', 'd2'])
  })
  it('heatmap: a missing value column leaves the series untouched; a non-numeric value reads 0', () => {
    const narrow = resolveDataset({ dataset: { source: [['x', 'y'], ['a', 'b']] }, series: [{ type: 'heatmap' }] })
    expect(seriesOf(narrow.option)[0]!['data']).toBeUndefined()
    const odd = resolveDataset({ dataset: { source: [['x', 'y', 'v'], ['a', 'b', 'hot']], sourceHeader: true }, series: [{ type: 'heatmap' }] })
    expect(seriesOf(odd.option)[0]!['data']).toEqual([['a', 'b', 0]])
  })
  it('radar: a scalar encode.value picks one column; an unknown one warns and leaves the series', () => {
    const dataset = { source: [['n', 'p', 'q'], [null, 'x', 5]] }
    const one = resolveDataset({ dataset, series: [{ type: 'radar', encode: { value: 'q' } }] })
    expect(seriesOf(one.option)[0]!['data']).toEqual([{ name: '', value: [5] }])
    const all = resolveDataset({ dataset, series: [{ type: 'radar' }] })
    // Every other column, a non-numeric cell reading 0; a null name reads ''.
    expect(seriesOf(all.option)[0]!['data']).toEqual([{ name: '', value: [0, 5] }])
    const bad = resolveDataset({ dataset, series: [{ type: 'radar', encode: { value: 'zzz' } }] })
    expect(seriesOf(bad.option)[0]!['data']).toBeUndefined()
    expect(bad.warnings.some((w) => w.path === 'series[0].encode.value')).toBe(true)
  })
  it('parallel: a short row fills the missing dimension with null', () => {
    const { option } = resolveDataset({ dataset: { source: [{ a: 1, b: 2 }, { a: 3 }] }, series: [{ type: 'parallel' }] })
    expect(seriesOf(option)[0]!['data']).toEqual([[1, 2], [3, null]])
  })
  it('themeRiver: fewer than three columns leaves it untouched; empty cells read as defaults', () => {
    const narrow = resolveDataset({ dataset: { source: [['d', 'v'], ['2020', 1]] }, series: [{ type: 'themeRiver' }] })
    expect(seriesOf(narrow.option)[0]!['data']).toBeUndefined()
    const odd = resolveDataset({ dataset: { source: [['d', 'v', 'n'], [null, 'x', null]] }, series: [{ type: 'themeRiver' }] })
    expect(seriesOf(odd.option)[0]!['data']).toEqual([['', 0, '']])
  })
})

describe('resolveDataset — encode.itemName on a plain series', () => {
  it('an empty name cell reads \'\' and a non-numeric value reads null', () => {
    const { option } = resolveDataset({
      dataset: { source: [['k', 'v'], [null, 'x'], ['b', 2]] },
      series: [{ type: 'bar', encode: { y: 'v', itemName: 'k' } }],
    })
    expect(seriesOf(option)[0]!['data']).toEqual([{ name: '', value: null }, { name: 'b', value: 2 }])
  })
})
