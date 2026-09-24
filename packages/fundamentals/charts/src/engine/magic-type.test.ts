import { applyMagicType } from './magic-type'
import type { ChartSpec, Series } from './render'

const spec = (kinds: Series['kind'][]): ChartSpec => ({ series: kinds.map((kind) => ({ kind, values: [1, 2], label: kind })) }) as unknown as ChartSpec
const kinds = (s: ChartSpec) => s.series.map((x) => x.kind)

describe('magicType', () => {
  it('line / bar switch the independent marks and carry a stack across', () => {
    expect(kinds(applyMagicType(spec(['bars', 'grouped', 'stacked', 'points']), 'line', ''))).toEqual(['line', 'line', 'stackedArea', 'points'])
    expect(kinds(applyMagicType(spec(['line', 'area']), 'bar', ''))).toEqual(['grouped', 'grouped'])
    expect(kinds(applyMagicType(spec(['line']), 'bar', ''))).toEqual(['bars'])
    expect(kinds(applyMagicType(spec(['stackedArea']), 'bar', ''))).toEqual(['stacked'])
  })

  it('stack / tiled restack, independently of the kind switch', () => {
    expect(kinds(applyMagicType(spec(['bars', 'bars']), '', 'stack'))).toEqual(['stacked', 'stacked'])
    expect(kinds(applyMagicType(spec(['line', 'area']), '', 'stack'))).toEqual(['stackedArea', 'stackedArea'])
    expect(kinds(applyMagicType(spec(['stacked', 'stacked']), '', 'tiled'))).toEqual(['grouped', 'grouped'])
    expect(kinds(applyMagicType(spec(['stackedArea']), 'bar', 'tiled'))).toEqual(['bars'])
    const same = spec(['waterfall', 'band'])
    expect(applyMagicType(same, '', '')).toBe(same)
    expect(kinds(applyMagicType(same, 'line', 'stack'))).toEqual(['waterfall', 'band'])
  })
})
