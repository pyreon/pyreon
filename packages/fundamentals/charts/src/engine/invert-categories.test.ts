// `xAxis.inverse` over categories reverses EVERY per-datum channel together,
// so a bar, its label, its whisker, its marker and its hit geometry keep
// agreeing. Each channel is optional, which means each has a populated half
// that only runs when a caller actually sets it — and a channel that fails to
// reverse is a label sitting on the wrong bar, silently.
import { describe, expect, it } from 'vitest'
import { categoriesInverted, categorySlots, defaultTheme, invertCategories } from './render'
import type { ChartSpec, Series } from './render'

const series = (over: Partial<Series> = {}): Series => ({
  kind: 'bars',
  values: [1, 2, 3],
  color: '#000',
  width: 1,
  radius: 3,
  label: 'S',
  ...over,
})

const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 300,
  height: 200,
  series: [series()],
  categories: ['a', 'b', 'c'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  xInverse: true,
  ...over,
})

describe('when inversion applies', () => {
  it('only for a category x axis that asks for it', () => {
    expect(categoriesInverted(spec())).toBe(true)
    expect(categoriesInverted(spec({ xInverse: false }))).toBe(false)
    expect(categoriesInverted(spec({ horizontal: true }))).toBe(false)
    // A continuous x axis inverts its DOMAIN elsewhere, not its categories.
    expect(categoriesInverted(spec({ xValues: [0, 1, 2] }))).toBe(false)
  })

  it('a spec that does not invert is returned as-is', () => {
    const s = spec({ xInverse: false })
    expect(invertCategories(s)).toBe(s)
  })

  it('the slot count is the longer of the categories and the longest series', () => {
    expect(categorySlots(spec())).toBe(3)
    expect(categorySlots(spec({ categories: ['a'] }))).toBe(3)
    expect(categorySlots(spec({ categories: ['a', 'b', 'c', 'd', 'e'] }))).toBe(5)
  })
})

describe('every per-datum channel reverses together', () => {
  const full = invertCategories(
    spec({
      series: [
        series({
          values: [1, 2, 3],
          rValues: [10, 20, 30],
          radii: [4, 5, 6],
          labelTexts: ['x', 'y', 'z'],
          errLow: [0.5, 1.5, 2.5],
          errHigh: [1.5, 2.5, 3.5],
          values2: [7, 8, 9],
          extras: [{ label: 'E', numbers: [100, 200, 300], texts: ['p', 'q', 'r'] }],
        }),
      ],
    }),
  )
  const s = full.series[0]!

  it('values, sizes, radii and labels', () => {
    expect(s.values).toEqual([3, 2, 1])
    expect(s.rValues).toEqual([30, 20, 10])
    expect(s.radii).toEqual([6, 5, 4])
    expect(s.labelTexts).toEqual(['z', 'y', 'x'])
  })

  it('error bars and the second value channel', () => {
    expect(s.errLow).toEqual([2.5, 1.5, 0.5])
    expect(s.errHigh).toEqual([3.5, 2.5, 1.5])
    expect(s.values2).toEqual([9, 8, 7])
  })

  it('tooltip extras, numbers and texts alike', () => {
    expect(s.extras![0]!.numbers).toEqual([300, 200, 100])
    expect(s.extras![0]!.texts).toEqual(['r', 'q', 'p'])
  })

  it('the categories themselves', () => {
    expect(full.categories).toEqual(['c', 'b', 'a'])
  })

  it('channels a series did not set stay unset rather than becoming empty arrays', () => {
    const bare = invertCategories(spec()).series[0]!
    expect(bare.rValues).toBeUndefined()
    expect(bare.labelTexts).toBeUndefined()
    expect(bare.extras).toBeUndefined()
  })

  it('a series SHORTER than the slot count pads with NaN / empty rather than shifting', () => {
    const short = invertCategories(spec({ series: [series({ values: [1], labelTexts: ['only'] })] })).series[0]!
    expect(short.values).toHaveLength(3)
    expect(Number.isNaN(short.values[0]!)).toBe(true)
    expect(short.values[2]).toBe(1)
    expect(short.labelTexts).toEqual(['', '', 'only'])
  })
})

describe('index-valued inputs reflect', () => {
  it('annotation x, xFrom/xTo (which SWAP), and x1/x2', () => {
    const [a] = invertCategories(spec({ annotations: [{ x: 0, xFrom: 0, xTo: 1, x1: 0, x2: 2 }] })).annotations!
    expect(a!.x).toBe(2)
    // The band's ends swap so it still runs low-to-high after reflection.
    expect(a!.xFrom).toBe(1)
    expect(a!.xTo).toBe(2)
    expect(a!.x1).toBe(2)
    expect(a!.x2).toBe(0)
  })

  it('an annotation that carries no x stays x-less', () => {
    const [a] = invertCategories(spec({ annotations: [{ y: 5 }] })).annotations!
    expect(a!.x).toBeUndefined()
    expect(a!.xFrom).toBeUndefined()
    expect(a!.x1).toBeUndefined()
  })

  it('a marker atIndex reflects; a marker without one stays without', () => {
    const marks = invertCategories(spec({ markers: [{ atIndex: 0 }, { at: 'max' }] })).markers!
    expect(marks[0]!.atIndex).toBe(2)
    expect(marks[1]!.atIndex).toBeUndefined()
  })

  it('emphasis highlight and selection reflect; a -1 highlight stays -1', () => {
    const e = invertCategories(spec({ emphasis: { highlight: 0, selected: [0, 2] } })).emphasis!
    expect(e.highlight).toBe(2)
    expect(e.selected).toEqual([2, 0])
    expect(invertCategories(spec({ emphasis: { highlight: -1, selected: [] } })).emphasis!.highlight).toBe(-1)
  })

  it('no annotations / markers / emphasis stay absent', () => {
    const out = invertCategories(spec())
    expect(out.annotations).toBeUndefined()
    expect(out.markers).toBeUndefined()
    expect(out.emphasis).toBeUndefined()
  })
})
