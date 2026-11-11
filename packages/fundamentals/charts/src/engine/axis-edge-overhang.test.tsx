// An upright value label centred on the last (or first) x tick hangs past the
// plot by half its width. The right gutter was a fixed 12px and the left one
// held only the y labels, so a wide label ("300 ms") was cut off by the
// canvas edge — a horizontal bar chart's value axis showed "300.0 r".
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { Axis, Bar, Chart } from './grammar'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (over: Partial<Series> = {}): Series => ({ kind: 'bars', values: [120, 280], color: '#000', width: 1, radius: 3, label: 'S', ...over })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 300,
  series: [series()],
  categories: ['a', 'b'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})
type TextCmd = Extract<DrawCmd, { kind: 'text' }>
/** The upright x-axis labels: centred under their ticks. */
const xLabels = (cmds: DrawCmd[]): TextCmd[] => cmds.filter((c): c is TextCmd => c.kind === 'text' && c.align === 'middle' && c.baseline === 'top')
const span = (c: TextCmd) => ({ from: c.at.x - measure(c.text, c.size) / 2, to: c.at.x + measure(c.text, c.size) / 2 })

describe('x value labels at the ends of the axis', () => {
  it('stay on the canvas in the horizontal frame (the value axis runs along x)', () => {
    const s = spec({ horizontal: true, yFormat: (v: number) => `${v.toFixed(1)} ms` })
    const labels = xLabels(renderChart(s, measure))
    expect(labels.length).toBeGreaterThan(2)
    const last = labels[labels.length - 1]!
    expect(last.text).toBe('300.0 ms')
    for (const l of labels) {
      expect(span(l).from, l.text).toBeGreaterThanOrEqual(0)
      expect(span(l).to, l.text).toBeLessThanOrEqual(s.width)
    }
  })

  it('stay on the canvas on a numeric x axis with the y axis hidden', () => {
    const s = spec({
      categories: [],
      showYAxis: false,
      series: [series({ kind: 'line', values: [1, 2, 3] })],
      xValues: [0, 50_000, 100_000],
      xFormat: (v: number) => `${v.toLocaleString('en')} rows`,
    })
    const labels = xLabels(renderChart(s, measure))
    expect(labels.length).toBeGreaterThan(1)
    for (const l of labels) {
      expect(span(l).from, l.text).toBeGreaterThanOrEqual(0)
      expect(span(l).to, l.text).toBeLessThanOrEqual(s.width)
    }
  })

  it('leave a category axis alone: its labels sit mid-band, so the slim gutter stays', () => {
    const cmds = renderChart(spec({ categories: ['a much longer category', 'b'], series: [series({ values: [1, 2] })] }), measure)
    const axis = cmds.filter((c): c is Extract<DrawCmd, { kind: 'line' }> => c.kind === 'line')
    const right = Math.max(...axis.flatMap((l) => [l.from.x, l.to.x]))
    expect(400 - right).toBe(12)
  })
})

describe('<Axis y format> and the chart-level format', () => {
  it('the axis format overrides the chart format (ChartProps.format says so)', () => {
    interface Row { n: string; v: number }
    const rows: Row[] = [{ n: 'a', v: 1 }, { n: 'b', v: 2 }]
    const root = document.createElement('div')
    document.body.append(root)
    const dispose = mount(
      h(
        Chart<Row>,
        { data: rows, x: 'n', width: 240, height: 160, animate: false, title: 'T', format: (v: number) => `${v} chart` },
        h(Bar<Row>, { y: 'v' }),
        h(Axis, { y: true, format: (v: number) => `${v} axis` }),
      ),
      root,
    )
    try {
      const label = root.querySelector('canvas')?.getAttribute('aria-label') ?? ''
      expect(label).toContain('2 axis')
      expect(label).not.toContain('chart')
    } finally {
      dispose()
      root.remove()
    }
  })
})
