/**
 * A family series fed by a `dataset`: the pre-pass maps each family's own
 * tuple shape through `encode`, a series' own `dimensions` and
 * `seriesLayoutBy`, as ECharts does. Before, only name/value families and
 * scatter were mapped; a candlestick, boxplot, heatmap, radar, parallel or
 * theme river read the generic single-column path and came out wrong.
 */
import { describe, expect, it } from 'vitest'
import { compileFamily } from './option-family'
import type { EChartsOption } from './option'

const plan = (o: Record<string, unknown>) => compileFamily(o as EChartsOption)!

describe('family dataset encoders', () => {
  it('candlestick: x plus [open, close, low, high], by default and by encode', () => {
    const source = [['day', 'o', 'c', 'l', 'h'], ['d1', 10, 12, 9, 13], ['d2', 12, 11, 10, 14]]
    const byDefault = plan({ dataset: { source }, series: [{ type: 'candlestick' }] })
    expect(byDefault.plan).toMatchObject({ kind: 'candlestick', rows: [{ x: 'd1', open: 10, close: 12, low: 9, high: 13 }, { x: 'd2', open: 12, close: 11, low: 10, high: 14 }] })
    const reordered = plan({ dataset: { source: [['h', 'l', 'c', 'o', 'day'], [13, 9, 12, 10, 'd1']] }, series: [{ type: 'candlestick', encode: { x: 'day', y: ['o', 'c', 'l', 'h'] } }] })
    expect(reordered.plan).toMatchObject({ rows: [{ x: 'd1', open: 10, close: 12, low: 9, high: 13 }] })
  })

  it('boxplot: x plus five numbers', () => {
    const p = plan({ dataset: { source: [['g', 'a', 'b', 'c', 'd', 'e'], ['G1', 1, 2, 3, 4, 5]] }, series: [{ type: 'boxplot' }] })
    expect(p.plan).toMatchObject({ kind: 'boxplot', rows: [{ x: 'G1', min: 1, q1: 2, median: 3, q3: 4, max: 5 }] })
  })

  it('heatmap: [x, y, value] resolved by name', () => {
    const p = plan({ dataset: { source: [['x', 'y', 'v'], ['Mon', 'am', 3], ['Tue', 'pm', 5]] }, xAxis: { type: 'category' }, yAxis: { type: 'category' }, series: [{ type: 'heatmap', encode: { x: 'x', y: 'y', value: 'v' } }] })
    expect(p.plan).toMatchObject({ kind: 'heatmap', rows: [{ x: 'Mon', y: 'am', value: 3 }, { x: 'Tue', y: 'pm', value: 5 }] })
  })

  it('radar: a named polygon per row, its value every other column or encode.value', () => {
    const radar = { indicator: [{ name: 'a', max: 10 }, { name: 'b', max: 10 }] }
    const all = plan({ radar, dataset: { source: [['who', 'a', 'b'], ['P', 3, 4]] }, series: [{ type: 'radar' }] })
    expect(all.plan).toMatchObject({ kind: 'radar', rows: [{ name: 'P', values: [3, 4] }] })
    const some = plan({ radar, dataset: { source: [['who', 'a', 'x', 'b'], ['P', 3, 99, 4]] }, series: [{ type: 'radar', encode: { itemName: 'who', value: ['a', 'b'] } }] })
    expect(some.plan).toMatchObject({ rows: [{ name: 'P', values: [3, 4] }] })
  })

  it('parallel: one line per row, one value per dimension', () => {
    const p = plan({ parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }], dataset: { source: [['a', 'b'], [1, 2], [3, 4]] }, series: [{ type: 'parallel' }] })
    expect(p.plan).toMatchObject({ kind: 'parallel', rows: [[1, 2], [3, 4]] })
  })

  it('theme river: [date, value, name]', () => {
    const p = plan({ singleAxis: { type: 'time' }, dataset: { source: [['d', 'v', 'n'], ['2024-01-01', 2, 'A'], ['2024-01-02', 3, 'A']] }, series: [{ type: 'themeRiver' }] })
    expect(p.plan).toMatchObject({ kind: 'themeRiver', series: [{ name: 'A', values: [2, 3] }] })
  })

  it('gauge reads a name/value row', () => {
    const p = plan({ dataset: { source: [['k', 'v'], ['speed', 42]] }, series: [{ type: 'gauge' }] })
    expect(p.plan).toMatchObject({ kind: 'gauge', value: 42 })
  })

  it('a series\' own dimensions rename the columns it reads', () => {
    const p = plan({ dataset: { source: [[1, 'a', 5], [2, 'b', 7]] }, series: [{ type: 'pie', dimensions: ['id', 'label', 'amount'], encode: { itemName: 'label', value: 'amount' } }] })
    expect(p.plan).toMatchObject({ kind: 'pie', rows: [{ name: 'a', value: 5 }, { name: 'b', value: 7 }] })
    expect(p.warnings).toEqual([])
  })

  it('seriesLayoutBy row reads a pie off the rows', () => {
    const p = plan({ dataset: { source: [['k', 'x', 'y'], ['v', 1, 2]] }, series: [{ type: 'pie', seriesLayoutBy: 'row' }] })
    expect(p.plan).toMatchObject({ kind: 'pie', rows: [{ name: 'x', value: 1 }, { name: 'y', value: 2 }] })
  })

  it('an unknown encode dimension warns by name and leaves the series empty', () => {
    const p = plan({ dataset: { source: [['day', 'o', 'c', 'l', 'h'], ['d1', 1, 2, 3, 4]] }, series: [{ type: 'candlestick', encode: { y: ['o', 'nope', 'l', 'h'] } }] })
    expect(p.warnings.map((w) => w.path)).toContain('series[0].encode.y')
    expect(p.plan).toMatchObject({ kind: 'candlestick', rows: [] })
  })

  it('too few columns for a tuple leaves the series empty', () => {
    const p = plan({ dataset: { source: [['day', 'o', 'c'], ['d1', 1, 2]] }, series: [{ type: 'candlestick' }] })
    expect(p.plan).toMatchObject({ kind: 'candlestick', rows: [] })
  })
})
