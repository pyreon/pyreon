// `encode` dimension references may be given as ARRAYS (ECharts allows several
// dimensions per channel; the engine takes the first), and a text tooltip
// column may hold missing cells. Both are ordinary dataset shapes.
import { describe, expect, it } from 'vitest'
import { resolveDataset } from './option-layer'

const base = { dataset: { source: [['k', 'v', 'note'], ['a', 1, 'x'], ['b', 2, null]] } }
const series0 = (encode: Record<string, unknown>) =>
  (resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', ...encode } }] }).option['series'] as Record<string, unknown>[])[0]!

describe('encode channels given as arrays', () => {
  it('seriesName takes the FIRST dimension of an array', () => {
    expect(series0({ seriesName: ['k', 'v'] })['name']).toBe('k')
  })

  it('itemName takes the FIRST dimension of an array', () => {
    expect(series0({ itemName: ['k'] })['data']).toEqual([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
    ])
  })
})

describe('a text tooltip column with a missing cell', () => {
  it('renders the missing cell as an empty string rather than "null"', () => {
    const extras = series0({ tooltip: 'note' })['tooltipExtras'] as { label: string; texts?: string[] }[]
    expect(extras[0]!.texts).toEqual(['x', ''])
  })
})
