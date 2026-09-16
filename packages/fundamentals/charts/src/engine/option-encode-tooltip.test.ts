import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { tooltipAt, tooltipLines } from './tooltip'

/**
 * `encode.tooltip` — the dataset columns the tooltip shows under a series'
 * value. The facade resolves them to `Series.extras`; the engine's
 * `tooltipAt` appends one row per extra (numbers as values, texts as text).
 */
describe('encode.tooltip', () => {
  const option = {
    dataset: { source: [['product', 'sales', 'region', 'stock'], ['Milk', 12, 'north', 40], ['Tea', 7, 'south', 15]] },
    xAxis: { type: 'category' },
    yAxis: {},
    series: [{ type: 'bar', name: 'Sales', encode: { x: 'product', y: 'sales', tooltip: ['stock', 'region'] } }],
  }

  it('resolves the named dimensions to series extras, numbers as values and texts as text', () => {
    const { spec, warnings } = compileOption(option)
    expect(warnings).toEqual([])
    expect(spec.series[0]!.extras).toEqual([{ label: 'stock', numbers: [40, 15] }, { label: 'region', texts: ['north', 'south'] }])
    expect(spec.categories).toEqual(['Milk', 'Tea'])
  })

  it('the tooltip lists the extras under the value, in encode order', () => {
    const { spec } = compileOption(option)
    const content = tooltipAt(1, spec.categories, spec.series)
    expect(content.rows.map((r) => [r.label, r.text ?? r.value])).toEqual([['Sales', 7], ['stock', 15], ['region', 'south']])
    expect(tooltipLines(content)).toEqual(['Tea', 'Sales: 7', 'stock: 15', 'region: south'])
    // A gap in an extra column contributes no row; an index past a column is skipped.
    const rows = tooltipAt(0, ['a'], [{ label: 'S', values: [1], color: '#000', extras: [{ label: 'x', numbers: [NaN] }, { label: 'y', texts: [] }] }]).rows
    expect(rows).toHaveLength(1)
  })

  it('an unknown tooltip dimension warns by name and is skipped; a single (non-array) encode.tooltip works', () => {
    const { spec, warnings } = compileOption({ ...option, series: [{ type: 'bar', encode: { x: 'product', y: 'sales', tooltip: 'ghost' } }] })
    expect(warnings.map((w) => w.code + '@' + w.path)).toEqual(['series-data-shape@series[0].encode.tooltip'])
    expect(spec.series[0]!.extras).toBeUndefined()
    const one = compileOption({ ...option, series: [{ type: 'bar', encode: { x: 'product', y: 'sales', tooltip: 'stock' } }] })
    expect(one.spec.series[0]!.extras).toEqual([{ label: 'stock', numbers: [40, 15] }])
  })
})
