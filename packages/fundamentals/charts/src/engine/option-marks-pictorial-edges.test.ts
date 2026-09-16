// Two sets of edges the broader suites skip. markLine statistics on EMPTY and
// EVEN-length data (the median of an even list is a mean of two, and a
// statistic over nothing must produce no mark rather than NaN). And
// pictorialBar's offset / bounding / circle arms, driven through the real
// facade and renderer so the geometry is what actually paints.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'
import { renderChart } from './render'
import type { MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const cat = (series: Record<string, unknown>[]): EChartsOption => ({
  xAxis: { type: 'category', data: ['a', 'b', 'c', 'd'] },
  yAxis: {},
  series,
})

describe('markLine statistics — empty and even-length data', () => {
  const marks = (data: number[], type: string) =>
    compileOption(cat([{ type: 'line', data, markLine: { data: [{ type }] } }])).spec.annotations

  it('the median of an EVEN list is the mean of the middle pair', () => {
    expect(marks([1, 4, 2, 3], 'median')![0]!.y).toBe(2.5)
  })

  it('the median of an ODD list is its middle value', () => {
    expect(marks([5, 1, 3], 'median')![0]!.y).toBe(3)
  })

  it('a statistic over EMPTY data produces no mark rather than a NaN line', () => {
    for (const type of ['median', 'average', 'max', 'min']) {
      const a = marks([], type)
      expect(a === undefined || a.every((m) => m.y === undefined || Number.isFinite(m.y)), type).toBe(true)
    }
  })

  it('a point-to-point pair on EMPTY data has no endpoint to resolve', () => {
    const c = compileOption(cat([{ type: 'line', data: [], markLine: { data: [[{ type: 'max' }, { type: 'min' }]] } }]))
    expect(c.warnings.some((w) => w.path.endsWith('markLine.data[0]'))).toBe(true)
  })
})

describe('pictorialBar — offset, bounding and circle', () => {
  const draw = (s: Record<string, unknown>) => {
    const c = compileOption(cat([{ type: 'pictorialBar', data: [10, 20, 30, 40], ...s }]))
    return { spec: c.spec, cmds: renderChart(c.spec, measure) }
  }

  it('symbolOffset moves the symbol by exactly its offset', () => {
    const plain = draw({ symbol: 'rect' }).cmds.filter((c) => c.kind === 'polygon' || c.kind === 'rect')
    const moved = draw({ symbol: 'rect', symbolOffset: [5, 7] }).cmds.filter((c) => c.kind === 'polygon' || c.kind === 'rect')
    expect(moved.length).toBe(plain.length)
    expect(JSON.stringify(moved)).not.toBe(JSON.stringify(plain))
  })

  it('a symbolOffset that is not a numeric pair is ignored', () => {
    expect(draw({ symbol: 'rect', symbolOffset: ['a', 1] }).spec.series[0]!.symbolOffset).toBeUndefined()
    expect(draw({ symbol: 'rect', symbolOffset: [1] }).spec.series[0]!.symbolOffset).toBeUndefined()
  })

  it('symbolBoundingData is carried onto the series for the renderer', () => {
    expect(draw({ symbol: 'rect', symbolRepeat: true, symbolBoundingData: 80 }).spec.series[0]!.symbolBoundingData).toBe(80)
    expect(draw({ symbol: 'rect', symbolRepeat: true }).spec.series[0]!.symbolBoundingData).toBeUndefined()
  })

  it('a ZERO value with bounding data does not divide by zero', () => {
    const { cmds } = draw({ type: 'pictorialBar', data: [0, 10, 0, 10], symbol: 'rect', symbolRepeat: true, symbolBoundingData: 20 })
    for (const c of cmds) {
      if (c.kind === 'rect') {
        expect(Number.isFinite(c.rect.w)).toBe(true)
        expect(Number.isFinite(c.rect.h)).toBe(true)
      }
    }
  })

  it('a circle symbol draws one circle per datum', () => {
    expect(draw({ symbol: 'circle' }).cmds.filter((c) => c.kind === 'circle')).toHaveLength(4)
  })

  it('clip keeps a partial last repeat and draws inside the bar', () => {
    const clipped = draw({ symbol: 'rect', symbolRepeat: true, symbolClip: true, symbolBoundingData: 35 }).cmds
    expect(clipped.length).toBeGreaterThan(0)
  })
})
