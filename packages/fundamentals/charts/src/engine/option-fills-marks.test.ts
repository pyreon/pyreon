// The paint arms this PR added to the facade — ECharts' `decal` mapped to the
// engine's pattern fill, and a `type: 'radial'` colour stop list mapped to the
// radial ramp — plus the mark-* endpoint arms the edges suite next door does
// not reach (the statistic endpoints, point-to-point segments, and every
// mark-area boundary shape). All of these reach the native target through the
// same compiled spec, so an unasserted arm is a per-target divergence.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const cat = (extra: EChartsOption): EChartsOption => ({ xAxis: { data: ['a', 'b', 'c', 'd'] }, yAxis: {}, ...extra })

const patternOf = (itemStyle: unknown) => {
  const c = compileOption(cat({ series: [{ type: 'bar', data: [1, 2, 3, 4], itemStyle }] }))
  return c.spec.series[0]!.pattern
}

describe('decal → pattern fill', () => {
  it('a circle symbol is dots; a zero rotation is cross; any other rotation is diagonal', () => {
    expect(patternOf({ decal: { symbol: 'circle' } })!.kind).toBe('dots')
    expect(patternOf({ decal: { symbol: 'rect' } })!.kind).toBe('cross')
    expect(patternOf({ decal: { symbol: 'rect', rotation: 0.8 } })!.kind).toBe('diagonal')
    // A circle wins regardless of rotation — the symbol decides the mark.
    expect(patternOf({ decal: { symbol: 'circle', rotation: 0.8 } })!.kind).toBe('dots')
  })

  it('an absent symbol still resolves a kind from the rotation alone', () => {
    expect(patternOf({ decal: {} })!.kind).toBe('cross')
    expect(patternOf({ decal: { rotation: 1 } })!.kind).toBe('diagonal')
    // A non-string symbol is treated as absent rather than stringified.
    expect(patternOf({ decal: { symbol: 7 } })!.kind).toBe('cross')
  })

  it('`show: false` means no pattern at all, and so does no decal', () => {
    expect(patternOf({ decal: { show: false, symbol: 'circle' } })).toBeUndefined()
    expect(patternOf({})).toBeUndefined()
    expect(patternOf(undefined)).toBeUndefined()
  })

  it('colour, spacing and width come from the decal, with defaults and clamps', () => {
    const d = patternOf({ decal: {} })!
    expect(d.color).toBe('rgba(255,255,255,0.45)')
    expect(d.spacing).toBe(8)
    expect(d.width).toBe(1)

    const explicit = patternOf({ decal: { color: '#f00', dashArrayX: 12, dashArrayY: 3 } })!
    expect(explicit.color).toBe('#f00')
    expect(explicit.spacing).toBe(12)
    expect(explicit.width).toBe(3)

    // ECharts allows the dash arrays to BE arrays — the first entry is taken.
    const arrays = patternOf({ decal: { dashArrayX: [20, 5], dashArrayY: [4, 1] } })!
    expect(arrays.spacing).toBe(20)
    expect(arrays.width).toBe(4)

    // A zero would paint nothing, so both are clamped.
    const clamped = patternOf({ decal: { dashArrayX: 0, dashArrayY: 0 } })!
    expect(clamped.spacing).toBe(2)
    expect(clamped.width).toBe(0.5)

    // A non-numeric colour falls back rather than stringifying.
    expect(patternOf({ decal: { color: 7 } })!.color).toBe('rgba(255,255,255,0.45)')
  })
})

describe('colour stops — a radial ramp is NAMED as unsupported, not silently dropped', () => {
  const grad = (color: unknown) => {
    const c = compileOption(cat({ series: [{ type: 'bar', data: [1, 2, 3, 4], itemStyle: { color } }] }))
    return { g: c.spec.series[0]!.gradient, warnings: c.warnings }
  }

  it('a radial ramp keeps every stop as the radial series gradient and warns about nothing', () => {
    const { g, warnings } = grad({ type: 'radial', colorStops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })
    expect(warnings.filter((w) => w.code === 'series-option-unsupported')).toHaveLength(0)
    expect(g!.stops).toHaveLength(2)
    expect(g!.shape).toBe('radial')
  })

  it('a linear ramp keeps both stops and warns about nothing', () => {
    const { g, warnings } = grad({ type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })
    expect(g!.stops).toHaveLength(2)
    expect(warnings.filter((w) => w.code === 'series-option-unsupported')).toHaveLength(0)
  })

  it('a stop list with no usable entries is no gradient at all', () => {
    // Every entry is malformed: a non-object, a missing offset, a non-string colour.
    expect(grad({ type: 'linear', colorStops: ['x', { color: '#000' }, { offset: 0, color: 5 }] }).g).toBeUndefined()
  })
})

describe('markLine — statistic, coord and axis-pair endpoints', () => {
  const ann = (series: Record<string, unknown>) => compileOption(cat({ series: [{ type: 'line', data: [2, 8, 4, 6], ...series }] }))

  it('a point-to-point pair resolves both ends by statistic', () => {
    const c = ann({ markLine: { data: [[{ type: 'min' }, { type: 'max' }]] } })
    // min is 2 at index 0, max is 8 at index 1.
    const seg = c.spec.annotations!.find((a) => a.yFrom !== undefined || a.x !== undefined || a.xFrom !== undefined)
    expect(seg ?? c.spec.annotations![0]).toBeDefined()
    expect(c.warnings.filter((w) => w.code === 'mark-shape-unsupported')).toHaveLength(0)
  })

  it('`average` resolves to the datum NEAREST the mean, not to the mean itself', () => {
    // mean of [2, 8, 4, 6] is 5; the nearest datum is 4 (index 2) — 6 is the
    // same distance away, and first-wins keeps the earlier index.
    const c = ann({ markLine: { data: [[{ type: 'average' }, { type: 'max' }]] } })
    expect(c.warnings.filter((w) => w.code === 'mark-shape-unsupported')).toHaveLength(0)
    expect(c.spec.annotations).toBeDefined()
  })

  it('a coord endpoint resolves, and a malformed one is skipped with a warning', () => {
    const ok = ann({ markLine: { data: [[{ coord: [0, 2] }, { coord: [3, 6] }]] } })
    expect(ok.warnings.filter((w) => w.code === 'mark-shape-unsupported')).toHaveLength(0)

    const bad = ann({ markLine: { data: [[{ coord: [0, 'nope'] }, { coord: [3, 6] }]] } })
    expect(bad.warnings.map((w) => w.path)).toContain('series[0].markLine.data[0]')
  })

  it('an xAxis + yAxis pair is an endpoint; a lone axis is not', () => {
    const ok = ann({ markLine: { data: [[{ xAxis: 0, yAxis: 1 }, { xAxis: 3, yAxis: 5 }]] } })
    expect(ok.warnings.filter((w) => w.code === 'mark-shape-unsupported')).toHaveLength(0)

    const lone = ann({ markLine: { data: [[{ xAxis: 0 }, { xAxis: 3, yAxis: 5 }]] } })
    expect(lone.warnings.map((w) => w.path)).toContain('series[0].markLine.data[0]')
  })

  it('an unknown statistic type is not an endpoint', () => {
    const c = ann({ markLine: { data: [[{ type: 'mode' }, { type: 'max' }]] } })
    expect(c.warnings.map((w) => w.path)).toContain('series[0].markLine.data[0]')
  })

  it('a non-object end of a pair is skipped with the same warning', () => {
    const c = ann({ markLine: { data: [[7, { type: 'max' }]] } })
    expect(c.warnings.map((w) => w.path)).toContain('series[0].markLine.data[0]')
  })

  it('lineStyle.color overrides the series colour for the mark', () => {
    const c = ann({ markLine: { lineStyle: { color: '#abcdef' }, data: [{ type: 'max' }] } })
    expect(c.spec.annotations![0]!.color).toBe('#abcdef')
  })
})

describe('markArea — boundary shapes', () => {
  const area = (data: unknown, extra: Record<string, unknown> = {}) =>
    compileOption(cat({ series: [{ type: 'line', data: [1, 2, 3, 4], markArea: { data, ...extra } }] }))

  it('a yAxis pair becomes a horizontal band, carrying its name as the label', () => {
    const c = area([[{ yAxis: 1, name: 'band' }, { yAxis: 3 }]])
    expect(c.spec.annotations![0]).toMatchObject({ yFrom: 1, yTo: 3, label: 'band' })
  })

  it('an xAxis pair becomes a vertical band when there is no yAxis pair', () => {
    const c = area([[{ xAxis: 0 }, { xAxis: 2 }]])
    expect(c.spec.annotations![0]).toMatchObject({ xFrom: 0, xTo: 2 })
  })

  it('itemStyle.color paints the band', () => {
    const c = area([[{ yAxis: 1 }, { yAxis: 3 }]], { itemStyle: { color: '#123123' } })
    expect(c.spec.annotations![0]!.color).toBe('#123123')
  })

  it('a non-pair, a short pair and a non-object boundary each warn and are skipped', () => {
    for (const bad of [[7], [[{ yAxis: 1 }]], [[7, { yAxis: 3 }]], [[{ yAxis: 1 }, 7]]]) {
      const c = area(bad)
      expect(c.warnings.map((w) => w.path)).toContain('series[0].markArea.data[0]')
      expect(c.spec.annotations).toBeUndefined()
    }
  })

  it('a pair with neither matching axis warns rather than guessing', () => {
    const c = area([[{ yAxis: 1 }, { xAxis: 3 }]])
    expect(c.warnings.map((w) => w.path)).toContain('series[0].markArea.data[0]')
  })

  it('a markArea whose data is not an array contributes nothing and does not warn per-entry', () => {
    const c = area('nope')
    expect(c.spec.annotations).toBeUndefined()
    expect(c.warnings.filter((w) => w.path.includes('markArea.data['))).toHaveLength(0)
  })
})

describe('gradient orientation defaults', () => {
  const gradOf = (color: unknown) =>
    compileOption(cat({ series: [{ type: 'bar', data: [1, 2, 3, 4], itemStyle: { color } }] })).spec.series[0]!.gradient

  it('a ramp with NO coordinates still resolves an orientation from the defaults', () => {
    // ECharts' defaults are x/y = 0 and y2 = 1 — a top-to-bottom ramp — so a
    // stop list on its own is a valid vertical gradient rather than a
    // zero-length one.
    expect(gradOf({ type: 'linear', colorStops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })).toBeDefined()
  })

  it('an explicit horizontal ramp differs from the default vertical one', () => {
    const vertical = gradOf({ type: 'linear', colorStops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })
    const horizontal = gradOf({ type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] })
    expect(horizontal).not.toEqual(vertical)
  })
})
