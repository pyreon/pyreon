import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { barsFor, categoryIndex, layoutChart, renderChart } from './render'
import { plotHitIndex } from './plot-hit'
import type { DrawCmd } from './types'

const base = { xAxis: { type: 'category', data: ['a', 'b'] }, series: [{ type: 'line', data: [1, 2] }, { type: 'bar', yAxisIndex: 1, data: [100, 200] }] }

describe('option axes', () => {
  it('maps axis names to titles, both y domains and the right-axis series', () => {
    const { spec, warnings } = compileOption({
      ...base,
      xAxis: { ...base.xAxis, name: 'Day' },
      yAxis: [{ name: 'Temp', min: 0, max: 10 }, { name: 'Rain', min: 0, max: 300 }],
    })
    expect(warnings).toEqual([])
    expect(spec.xTitle).toBe('Day')
    expect(spec.yTitle).toBe('Temp')
    expect(spec.y2Title).toBe('Rain')
    expect(spec.yDomain).toEqual({ min: 0, max: 10 })
    expect(spec.y2Domain).toEqual({ min: 0, max: 300 })
    expect(spec.series[1]!.axis).toBe('right')
  })

  it('show: false hides an axis and splitLine.show: false drops the grid', () => {
    const { spec, warnings } = compileOption({ ...base, xAxis: { ...base.xAxis, show: false }, yAxis: { show: false, splitLine: { show: false } } })
    expect(warnings).toEqual([])
    expect(spec.showXAxis).toBe(false)
    expect(spec.showYAxis).toBe(false)
    expect(spec.showGrid).toBe(false)
  })

  it('a default option keeps axes and grid on, with no titles', () => {
    const { spec } = compileOption({ ...base, yAxis: {} })
    expect([spec.showXAxis, spec.showYAxis, spec.showGrid]).toEqual([true, true, true])
    expect(spec.xTitle).toBeUndefined()
    expect(spec.yScale).toBeUndefined()
  })

  it('a log y axis lowers to the log scale', () => {
    expect(compileOption({ ...base, yAxis: { type: 'log' } }).spec.yScale).toBe('log')
  })

  it('names an unmapped axis key and a one-sided domain instead of dropping them silently', () => {
    const { warnings } = compileOption({ ...base, yAxis: { nameGap: 8, min: 0 } })
    expect(warnings.map((w) => w.path)).toEqual(['yAxis.nameGap', 'yAxis.min'])
  })
})

describe('yAxis.inverse', () => {
  const measure = (t: string): number => t.length * 6
  const kinds: Record<string, unknown>[] = [
    { type: 'line', data: [1, 5, 3] },
    { type: 'bar', data: [1, -5, 3] },
    { type: 'line', areaStyle: {}, data: [1, 5, 3] },
    { type: 'bar', stack: 's', data: [1, 5, 3] },
    { type: 'scatter', data: [1, 5, 3] },
    { type: 'line', stack: 's', areaStyle: {}, data: [1, 5, 3] },
  ]
  // The inverted plot is the upright plot reflected about its horizontal
  // centreline — every mark, for every cartesian kind.
  it.each(kinds.flatMap((k) => [[k, 1], [k, 2]] as const))('%j ×%i draws the mirror image of the upright chart', (kind, count) => {
    const series = count === 1 ? [kind] : [kind, { ...kind, name: 'b' }]
    const upright = compileOption({ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series })
    const inverted = compileOption({ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: { inverse: true }, series })
    expect(inverted.warnings).toEqual([])
    expect(inverted.spec.yInverse).toBe(true)
    const p = layoutChart(upright.spec, measure).plot
    const r = (n: number): number => Math.round(n * 10) / 10
    const sig = (c: DrawCmd, flip: boolean): string | null => {
      const Y = (y: number): number => r(flip ? 2 * p.y + p.h - y : y)
      if (c.kind === 'rect' && c.rect.w > 0 && c.rect.y >= p.y - 1 && c.rect.y + c.rect.h <= p.y + p.h + 1) return `rect ${r(c.rect.x)} ${Y(flip ? c.rect.y + c.rect.h : c.rect.y)} ${r(c.rect.h)}`
      if (c.kind === 'circle') return `circle ${r(c.center.x)} ${Y(c.center.y)}`
      if (c.kind === 'polyline' || c.kind === 'polygon') return `${c.kind} ${c.points.map((q) => `${r(q.x)},${Y(q.y)}`).sort().join(' ')}`
      return null
    }
    const expected = renderChart(upright.spec, measure).map((c) => sig(c, true)).filter((x) => x !== null).sort()
    const actual = renderChart(inverted.spec, measure).map((c) => sig(c, false)).filter((x) => x !== null).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('puts the largest tick label at the bottom', () => {
    const { spec } = compileOption({ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: { inverse: true, min: 0, max: 10 }, series: [{ type: 'line', data: [1, 9] }] })
    const ticks = layoutChart(spec, measure).yTicks
    const top = ticks.reduce((a, b) => (a.pos < b.pos ? a : b))
    const bottom = ticks.reduce((a, b) => (a.pos > b.pos ? a : b))
    expect(top.value).toBe(0)
    expect(bottom.value).toBe(10)
  })
})

describe('xAxis.inverse', () => {
  const measure = (t: string): number => t.length * 6
  const cats = ['a', 'b', 'c', 'd']
  const kinds: Record<string, unknown>[] = [
    { type: 'line', data: [1, 5, 3, 2] },
    { type: 'bar', data: [1, -5, 3, 2] },
    { type: 'line', areaStyle: {}, data: [1, 5, 3, 2] },
    { type: 'bar', stack: 's', data: [1, 5, 3, 2] },
    { type: 'scatter', data: [1, 5, 3, 2] },
  ]
  const build = (series: Record<string, unknown>[], inverse: boolean) =>
    compileOption({ xAxis: { type: 'category', data: cats, ...(inverse ? { inverse: true } : {}) }, yAxis: {}, series })
  it.each(kinds.flatMap((k) => [[k, 1], [k, 2]] as const))('%j ×%i draws the left-right mirror of the upright chart', (kind, count) => {
    const series = count === 1 ? [kind] : [kind, { ...kind, name: 'b' }]
    const upright = build(series, false)
    const inverted = build(series, true)
    expect(inverted.warnings).toEqual([])
    const p = layoutChart(upright.spec, measure).plot
    const r = (n: number): number => Math.round(n * 10) / 10
    const sig = (c: DrawCmd, flip: boolean): string | null => {
      const X = (x: number): number => r(flip ? 2 * p.x + p.w - x : x)
      if (c.kind === 'rect' && c.rect.w > 0 && c.rect.x >= p.x - 1 && c.rect.x + c.rect.w <= p.x + p.w + 1 && c.rect.h < p.h) return `rect ${X(flip ? c.rect.x + c.rect.w : c.rect.x)} ${r(c.rect.y)} ${r(c.rect.w)}`
      if (c.kind === 'circle') return `circle ${X(c.center.x)} ${r(c.center.y)}`
      if (c.kind === 'polyline' || c.kind === 'polygon') return `${c.kind} ${c.points.map((q) => `${X(q.x)},${r(q.y)}`).sort().join(' ')}`
      return null
    }
    const expected = renderChart(upright.spec, measure).map((c) => sig(c, true)).filter((x) => x !== null).sort()
    const actual = renderChart(inverted.spec, measure).map((c) => sig(c, false)).filter((x) => x !== null).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('labels the categories right to left and a hit still names the ORIGINAL datum', () => {
    const { spec } = build([{ type: 'bar', data: [10, 20, 30, 40] }], true)
    const l = layoutChart(spec, measure)
    expect([...l.xTicks].sort((a, b) => a.pos - b.pos).map((t) => t.label)).toEqual(['d', 'c', 'b', 'a'])
    // The leftmost bar is datum 3 ('d').
    const bars = barsFor(spec, 0, measure)
    const leftmost = bars.reduce((a, b) => (a.x < b.x ? a : b))
    expect(plotHitIndex(spec, measure, leftmost.x + leftmost.w / 2, leftmost.y + leftmost.h - 1)).toBe(3)
    expect(categoryIndex(spec, 0)).toBe(3)
  })

  it('a continuous x axis inverts through its domain', () => {
    const { spec } = compileOption({ xAxis: { type: 'value', inverse: true }, yAxis: {}, series: [{ type: 'scatter', data: [[0, 1], [10, 2]] }] })
    const l = layoutChart(spec, measure)
    const first = l.xTicks.reduce((a, b) => (a.pos < b.pos ? a : b))
    expect(first.value).toBe(10)
  })
})

describe('axis position', () => {
  const measure = (t: string): number => t.length * 6
  const cats = ['alpha', 'beta']
  it("xAxis.position: 'top' moves the axis, its labels and title above the plot", () => {
    const { spec, warnings } = compileOption({ xAxis: { type: 'category', data: cats, position: 'top', name: 'Day' }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] })
    expect(warnings).toEqual([])
    const l = layoutChart(spec, measure)
    expect(l.gutters.top).toBeGreaterThan(l.gutters.bottom)
    const cmds = renderChart(spec, measure)
    const label = cmds.find((c) => c.kind === 'text' && c.text === 'alpha')
    expect(label?.kind === 'text' && label.at.y < l.plot.y).toBe(true)
    const title = cmds.find((c) => c.kind === 'text' && c.text === 'Day')
    expect(title?.kind === 'text' && title.at.y < l.plot.y).toBe(true)
    expect(cmds.some((c) => c.kind === 'line' && c.from.y === l.plot.y && c.to.y === l.plot.y && c.to.x - c.from.x === l.plot.w)).toBe(true)
  })

  it("a lone yAxis.position: 'right' moves the value labels and title to the right gutter", () => {
    const { spec, warnings } = compileOption({ xAxis: { type: 'category', data: cats }, yAxis: { position: 'right', name: 'Units' }, series: [{ type: 'bar', data: [1, 200] }] })
    expect(warnings).toEqual([])
    const l = layoutChart(spec, measure)
    expect(l.gutters.right).toBeGreaterThan(l.gutters.left)
    const cmds = renderChart(spec, measure)
    const tickText = cmds.filter((c) => c.kind === 'text' && l.yTicks.some((tk) => tk.label === c.text))
    expect(tickText.length).toBeGreaterThan(0)
    for (const c of tickText) expect(c.kind === 'text' && c.at.x > l.plot.x + l.plot.w).toBe(true)
  })

  it('two axes whose first is placed right swap sides, and yAxisIndex follows', () => {
    const { spec, warnings } = compileOption({
      xAxis: { type: 'category', data: cats },
      yAxis: [{ position: 'right', name: 'R', min: 0, max: 5 }, { position: 'left', name: 'L', min: 0, max: 500 }],
      series: [{ type: 'line', data: [1, 2] }, { type: 'bar', yAxisIndex: 1, data: [100, 400] }],
    })
    expect(warnings).toEqual([])
    expect(spec.yTitle).toBe('L')
    expect(spec.y2Title).toBe('R')
    expect(spec.yDomain).toEqual({ min: 0, max: 500 })
    expect(spec.series[0]!.axis).toBe('right')
    expect(spec.series[1]!.axis).toBeUndefined()
  })

  it('two axes on the same side are named', () => {
    const { warnings } = compileOption({ xAxis: { type: 'category', data: cats }, yAxis: [{}, { position: 'left' }], series: [{ type: 'line', data: [1, 2] }] })
    expect(warnings.map((w) => w.path)).toEqual(['yAxis[1].position'])
  })
})

describe('axis offset', () => {
  const measure = (t: string): number => t.length * 6
  it('moves each axis line and its labels off the plot edge, and grows its gutter by the same', () => {
    const series = [{ type: 'line', data: [1, 2] }, { type: 'line', yAxisIndex: 1, data: [10, 20] }]
    const base = compileOption({ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: [{}, {}], series })
    const off = compileOption({ xAxis: { type: 'category', data: ['a', 'b'], offset: 7 }, yAxis: [{ offset: 11 }, { offset: 13 }], series })
    expect(off.warnings).toEqual([])
    const lb = layoutChart(base.spec, measure)
    const lo = layoutChart(off.spec, measure)
    expect(lo.gutters.left - lb.gutters.left).toBeCloseTo(11)
    expect(lo.gutters.right - lb.gutters.right).toBeCloseTo(13)
    expect(lo.gutters.bottom - lb.gutters.bottom).toBeCloseTo(7)
    const p = lo.plot
    const lines = renderChart(off.spec, measure).filter((c) => c.kind === 'line')
    expect(lines.some((c) => c.kind === 'line' && c.from.x === p.x - 11 && c.to.x === p.x - 11)).toBe(true)
    expect(lines.some((c) => c.kind === 'line' && c.from.x === p.x + p.w + 13 && c.to.x === p.x + p.w + 13)).toBe(true)
    expect(lines.some((c) => c.kind === 'line' && c.from.y === p.y + p.h + 7 && c.to.y === p.y + p.h + 7)).toBe(true)
  })
})

describe('a third y axis', () => {
  const measure = (t: string): number => t.length * 6
  const option = (offset: number) => ({
    xAxis: { type: 'category', data: ['a', 'b'] },
    yAxis: [{ min: 0, max: 10 }, { min: 0, max: 100 }, { name: 'Wind', min: 0, max: 1000, offset, position: 'right' }],
    series: [{ type: 'line', data: [5, 5] }, { type: 'line', yAxisIndex: 1, data: [50, 50] }, { type: 'line', yAxisIndex: 2, data: [500, 500] }],
  })
  it('scales its series on its own domain, draws its line and labels at its offset, and widens the gutter', () => {
    const { spec, warnings } = compileOption(option(60))
    expect(warnings).toEqual([])
    expect(spec.extraYAxes).toEqual([{ side: 'right', domain: { min: 0, max: 1000 }, title: 'Wind', offset: 60 }])
    expect(spec.series[2]!.axisExtra).toBe(0)
    expect(spec.series[2]!.axis).toBeUndefined()
    const l = layoutChart(spec, measure)
    const p = l.plot
    // All three series sit at the middle of their own domain, so on one line.
    const mids = renderChart(spec, measure).filter((c) => c.kind === 'polyline').map((c) => (c.kind === 'polyline' ? Math.round(c.points[0]!.y) : 0))
    expect(mids).toEqual([Math.round(p.y + p.h / 2), Math.round(p.y + p.h / 2), Math.round(p.y + p.h / 2)])
    const cmds = renderChart(spec, measure)
    expect(cmds.some((c) => c.kind === 'line' && c.from.x === p.x + p.w + 60 && c.to.x === p.x + p.w + 60)).toBe(true)
    const top = l.extraTicks.reduce((a, b) => (a.pos < b.pos ? a : b))
    expect(cmds.some((c) => c.kind === 'text' && c.text === top.label && c.at.x > p.x + p.w + 60)).toBe(true)
    expect(cmds.some((c) => c.kind === 'text' && c.text === 'Wind')).toBe(true)
    expect(l.gutters.right).toBeGreaterThan(layoutChart(compileOption(option(0)).spec, measure).gutters.right)
  })
})
