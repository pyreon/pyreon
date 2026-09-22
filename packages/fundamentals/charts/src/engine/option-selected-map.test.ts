import { describe, expect, it } from 'vitest'
import { selectedSeed } from './option-selected-map'

const cats = ['a', 'b', 'c']
describe('selectedSeed — ECharts selectedMap', () => {
  it('no selectedMap (or no selectedMode) leaves the pins alone', () => {
    expect(selectedSeed([{ data: [1, 2, 3] }], [0], cats)).toBeNull()
    expect(selectedSeed([{ selectedMap: { a: true }, data: [1] }], [0], cats)).toBeNull()
    expect(selectedSeed([{ selectedMode: false, selectedMap: { a: true } }], [0], cats)).toBeNull()
    expect(selectedSeed(['bad'], [0], cats)).toBeNull()
  })
  it('keys by category, or a datum\'s own name', () => {
    expect(selectedSeed([{ selectedMode: 'multiple', selectedMap: { b: true, c: false }, data: [1, 2, 3] }], [0], cats)).toEqual({ data: [1], series: [] })
    expect(selectedSeed([{ selectedMode: true, selectedMap: { own: true }, data: [1, { name: 'own', value: 2 }] }], [0], cats)).toEqual({ data: [1], series: [] })
    expect(selectedSeed([{ selectedMode: true, selectedMap: 'nope' }], [0], cats)).toEqual({ data: [], series: [] })
  })
  it('"all" selects every item; the compiled index maps through seriesSource', () => {
    expect(selectedSeed([{ type: 'x' }, { selectedMode: 'multiple', selectedMap: 'all', data: [1, 2] }], [1], ['a', 'b'])).toEqual({ data: [0, 1], series: [] })
  })
  it('selectedMode "series" pins the series when anything in it is selected', () => {
    expect(selectedSeed([{ selectedMode: 'series', selectedMap: 'all' }, { selectedMode: 'series', selectedMap: { a: false } }, { selectedMode: 'series', selectedMap: { a: true } }], [0, 1, 2], cats)).toEqual({ data: [], series: [0, 2] })
  })
})
