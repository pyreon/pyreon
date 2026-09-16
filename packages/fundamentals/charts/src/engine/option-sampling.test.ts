// The large-data keys: `sampling`, `large` and `progressive` all ask the same
// pass to thin a series, and the precedence between them decides how many
// datums survive. An unknown `sampling` must NAME its loss rather than
// quietly leaving the series at full length, and must not suppress a `large`
// request sitting beside it.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const N = 5000
const DATA = Array.from({ length: N }, (_, i) => Math.sin(i / 7) * 100)

const compiled = (series: Record<string, unknown>, width = 640) =>
  compileOption(
    { xAxis: { type: 'category', data: DATA.map((_, i) => String(i)) }, yAxis: {}, series: [{ type: 'line', data: DATA, ...series }] } as EChartsOption,
    { width } as never,
  )

const lengthOf = (series: Record<string, unknown>, width = 640) => compiled(series, width).spec.series[0]!.values.length

describe('large-data keys — how far a series is thinned', () => {
  it('leaves a series untouched when nothing asks', () => {
    expect(lengthOf({})).toBe(N)
  })

  it('`sampling` thins to the plot width', () => {
    const out = lengthOf({ sampling: 'lttb' }, 400)
    expect(out).toBeLessThan(N)
    expect(out).toBeLessThanOrEqual(400)
  })

  it('every documented method is accepted and thins', () => {
    for (const method of ['lttb', 'average', 'max', 'min', 'sum']) {
      const c = compiled({ sampling: method }, 300)
      expect(c.warnings.filter((w) => w.code === 'series-option-unsupported'), method).toHaveLength(0)
      expect(c.spec.series[0]!.values.length, method).toBeLessThan(N)
    }
  })

  it('an UNKNOWN sampling names the loss and leaves the series at full length', () => {
    const c = compiled({ sampling: 'median' })
    expect(c.spec.series[0]!.values).toHaveLength(N)
    const w = c.warnings.find((x) => x.path.endsWith('.sampling'))
    expect(w).toBeDefined()
    expect(w!.message).toContain('lttb, average, max, min, sum')
  })

  it('a NON-STRING sampling takes the same named path', () => {
    const c = compiled({ sampling: 7 })
    expect(c.warnings.some((w) => w.path.endsWith('.sampling'))).toBe(true)
  })

  it('an unsupported `sampling` does NOT suppress a `large` request beside it', () => {
    const c = compiled({ sampling: 'median', large: true, largeThreshold: 500 })
    expect(c.warnings.some((w) => w.path.endsWith('.sampling'))).toBe(true)
    expect(c.spec.series[0]!.values.length).toBeLessThanOrEqual(500)
  })

  it('`large` uses its threshold, and defaults when it is absent or not a number', () => {
    expect(lengthOf({ large: true, largeThreshold: 300 })).toBeLessThanOrEqual(300)
    // The default is 2000, so a 5000-point series still thins.
    expect(lengthOf({ large: true })).toBeLessThanOrEqual(2000)
    expect(lengthOf({ large: true, largeThreshold: '300' })).toBeLessThanOrEqual(2000)
    // `large: false` is not a request at all.
    expect(lengthOf({ large: false })).toBe(N)
  })

  it('`progressive` asks only when it is a positive number', () => {
    expect(lengthOf({ progressive: 400 })).toBeLessThanOrEqual(3000)
    expect(lengthOf({ progressive: 400, progressiveThreshold: 900 })).toBeLessThanOrEqual(900)
    expect(lengthOf({ progressive: 0 })).toBe(N)
    expect(lengthOf({ progressive: -1 })).toBe(N)
    expect(lengthOf({ progressive: 'fast' })).toBe(N)
  })

  it('a tiny limit is floored so LTTB keeps its two endpoints plus one', () => {
    expect(lengthOf({ large: true, largeThreshold: 1 })).toBeGreaterThanOrEqual(3)
  })
})
