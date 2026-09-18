import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A literal `dataset` on `<OptionChart>` resolves at COMPILE time through the
 * web facade's own `resolveDataset` (`@pyreon/charts/option-layer`): the
 * series data, the category axis, `encode` (x / y / seriesName / itemName /
 * tooltip) and the built-in `filter` / `sort` transforms name the same datums
 * natively that they name on the web. Registered transforms live in the
 * page's registry and are named as web-only.
 */
const DATASET = `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      dataset: [
        { source: [['product', 'sales', 'region', 'stock'], ['Milk', 12, 'north', 40], ['Tea', 7, 'south', 15], ['Rice', 20, 'north', 5]] },
        { transform: [{ type: 'filter', config: { dimension: 'region', '=': 'north' } }, { type: 'sort', config: { dimension: 'sales', order: 'desc' } }] },
      ],
      xAxis: { type: 'category' },
      yAxis: {},
      series: [{ type: 'bar', datasetIndex: 1, encode: { x: 'product', y: 'sales', seriesName: 'sales', tooltip: ['stock', 'region'] } }],
    }} />
  )
}`

describe.each(['swift', 'kotlin'] as const)('dataset on %s', (target) => {
  it('resolves source, encode, filter and sort at compile time, carries tooltip extras, and compiles with zero warnings', () => {
    const r = transform(DATASET, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    // Filtered to the north rows and sorted by sales desc: Rice (20) then Milk (12); Tea is gone.
    expect(r.code.indexOf('"Rice"')).toBeGreaterThan(0)
    expect(r.code.indexOf('"Rice"')).toBeLessThan(r.code.indexOf('"Milk"'))
    expect(r.code).not.toContain('"Tea"')
    expect(r.code).toContain(`label${sep}"sales"`)
    expect(r.code).toContain(`extras${sep}${target === 'swift' ? '[' : 'listOf('}SeriesExtra(label${sep}"stock", numbers${sep}${target === 'swift' ? '[' : 'listOf('}5.0, 40.0`)
    expect(r.code).toContain(`SeriesExtra(label${sep}"region", texts${sep}${target === 'swift' ? '[' : 'listOf('}"north", "north"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('object rows with declared dimensions feed a pie through encode.itemName / value', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ dataset: { dimensions: ['name', 'share'], source: [{ name: 'A', share: 60 }, { name: 'B', share: 40 }] }, series: [{ type: 'pie', encode: { itemName: 'name', value: 'share' } }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"A"')
    expect(r.code).toContain('"B"')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a registered transform is named as web-only rather than run silently empty', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ dataset: [{ source: [['x', 'y'], ['a', 1]] }, { transform: { type: 'ecStat:regression' } }], xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'line', datasetIndex: 1 }] }} />
}`, { target })
    expect(r.warnings.some((w) => w.includes('option.dataset[1].transform[0].type>') && w.includes('is not registered'))).toBe(true)
  })

  it('fromDatasetIndex chains a derived dataset through a built-in transform, the same as the web', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return (
    <OptionChart option={{
      dataset: [
        { source: [['name', 'score', 'team'], ['a', 5, 'x'], ['b', 9, 'y'], ['c', 1, 'x'], ['d', 7, 'y']] },
        { fromDatasetIndex: 0, transform: { type: 'filter', config: { dimension: 'team', '=': 'x' } } },
        { fromDatasetIndex: 1, transform: { type: 'sort', config: { dimension: 'score', order: 'desc' } } },
      ],
      xAxis: { type: 'category' },
      yAxis: {},
      series: [{ type: 'bar', datasetIndex: 2, encode: { x: 'name', y: 'score' } }],
    }} />
  )
}`, { target })
    expect(r.warnings).toEqual([])
    // team=x rows are a (5) and c (1); sorted desc by score: a then c.
    expect(r.code.indexOf('"a"')).toBeGreaterThan(0)
    expect(r.code.indexOf('"a"')).toBeLessThan(r.code.indexOf('"c"'))
    expect(r.code).not.toContain('"b"')
    expect(r.code).not.toContain('"d"')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})

describe.each(['swift', 'kotlin'] as const)('negative datums on %s', (target) => {
  it('a negative literal datum lowers like a positive one (a unary minus over a literal is a literal)', () => {
    const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'line', data: [1, -2.5] }] }} />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('-2.5')
  })
})
