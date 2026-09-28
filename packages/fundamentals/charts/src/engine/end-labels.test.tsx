// Direct labels (`<Legend direct />`): each line is named at its last point,
// in its own colour, spread apart so no two overlap.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { Area, Bar, Legend, Line, resolveGrammar } from './grammar'
import { defaultTheme, renderChart, spreadLabels } from './render'
import type { ChartSpec, Series } from './render'
import { measureApprox } from './svg'
import type { DrawCmd } from './types'

type TextCmd = Extract<DrawCmd, { kind: 'text' }>
const measure = measureApprox()
const line = (label: string, values: number[], color: string, kind: Series['kind'] = 'line'): Series => ({ kind, values, color, width: 2, radius: 3, label, showValues: false })
const spec = (series: Series[], endLabels: boolean): ChartSpec => ({
  width: 400, height: 240, series, categories: ['a', 'b', 'c', 'd'], theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true, endLabels,
})
const texts = (s: ChartSpec, names: string[]): TextCmd[] => renderChart(s, measure).filter((c): c is TextCmd => c.kind === 'text' && names.includes(c.text))

describe('spreadLabels', () => {
  it('leaves labels that already clear each other where they are', () => {
    expect(spreadLabels([10, 50, 90], 12, 0, 200)).toEqual([10, 50, 90])
  })

  it('pushes a crowded label down by the gap, keeping input order', () => {
    expect(spreadLabels([50, 40, 45], 12, 0, 200)).toEqual([64, 40, 52])
  })

  it('moves the column up when it runs past the bottom, and never above the top', () => {
    expect(spreadLabels([95, 96, 97], 10, 0, 100)).toEqual([80, 90, 100])
    // Spread to 0/10/20, lifted by 8 to end at 12, then held at the top of 5.
    expect(spreadLabels([0, 0, 0], 10, 5, 12)).toEqual([5, 5, 12])
  })
})

describe('renderChart endLabels', () => {
  const series = [line('Revenue', [1, 4, 6, 9], '#4f7df3'), line('Target', [2, 4, 5, 8.9], '#c88100'), line('Cost', [1, 2, 3, 2], '#1ca28a', 'area')]

  it('names each line and area at its last point, in its colour, right of the plot', () => {
    const labels = texts(spec(series, true), ['Revenue', 'Target', 'Cost'])
    expect(labels.map((l) => [l.text, l.fill, l.align])).toEqual([['Revenue', '#4f7df3', 'start'], ['Target', '#c88100', 'start'], ['Cost', '#1ca28a', 'start']])
    const xs = new Set(labels.map((l) => l.at.x))
    expect(xs.size).toBe(1)
  })

  it('reserves the gutter: the plot narrows by the widest name', () => {
    const grid = (s: ChartSpec) => Math.max(...renderChart(s, measure).filter((c) => c.kind === 'line').map((c) => (c as { from: { x: number }; to: { x: number } }).to.x))
    expect(grid(spec(series, true))).toBeLessThan(grid(spec(series, false)) - measure('Revenue', 11))
  })

  it('spreads two lines ending at the same value apart', () => {
    const [a, b] = texts(spec(series, true), ['Revenue', 'Target'])
    expect(Math.abs(a!.at.y - b!.at.y)).toBeGreaterThanOrEqual(defaultTheme.fontSize + 2)
  })

  it('labels the last FINITE point of a series ending in a gap, and skips bars and unnamed series', () => {
    const s = spec([line('Gappy', [1, 2, 3, Number.NaN], '#4f7df3'), { ...line('Bars', [1, 2, 3, 4], '#000'), kind: 'bars' }, line('', [1, 1, 1, 1], '#111')], true)
    expect(texts(s, ['Gappy', 'Bars', '']).map((c) => c.text)).toEqual(['Gappy'])
  })

  it('draws nothing without the flag, and nothing on a horizontal chart', () => {
    expect(texts(spec(series, false), ['Revenue'])).toEqual([])
    expect(texts({ ...spec(series, true), horizontal: true }, ['Revenue'])).toEqual([])
  })
})

describe('<Legend direct />', () => {
  interface Row { m: string; rev: number; cost: number }
  const ROWS: Row[] = [{ m: 'a', rev: 1, cost: 2 }]
  it('turns on direct labels instead of the legend box', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'm' }, [h(Line, { y: 'rev', label: 'Revenue' }), h(Area, { y: 'cost' }), h(Bar, { y: 'rev' }), h(Legend, { direct: true })])
    expect(g.props.endLabels).toBe(true)
    expect(g.props.showLegend).toBeUndefined()
  })
})
