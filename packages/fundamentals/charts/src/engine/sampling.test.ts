// `sampling.ts` is the ONE large-data mechanism both the web facade and the
// native compiler resolve `sampling` / `large` / `progressive` through, so a
// divergence here thins a series differently per target. It arrived with no
// direct suite — reached only incidentally through `option.ts` — which left
// the precedence order, the bucket aggregators and every misalignment guard
// unasserted. These drive the module's own surface.
import { describe, expect, it, vi } from 'vitest'
import { LARGE_THRESHOLD, PROGRESSIVE_THRESHOLD, decimateShared, samplingRequest } from './sampling'
import type { SamplingRequest, SharedRows } from './sampling'

const rows = (columns: number[][], categories: string[] = [], xValues?: number[]): SharedRows => ({
  columns,
  categories,
  xValues,
})

describe('samplingRequest — which key wins, and what it asks for', () => {
  it('a known `sampling` method thins to the pixel width, floored at 3', () => {
    const warn = vi.fn()
    expect(samplingRequest({ sampling: 'lttb' }, 640.7, warn)).toEqual({ limit: 640, method: 'lttb' })
    // A sub-3 width still has to leave LTTB its two endpoints plus one.
    expect(samplingRequest({ sampling: 'average' }, 1, warn)).toEqual({ limit: 3, method: 'average' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('an unknown `sampling` reports through `unsupported` and leaves the series unthinned', () => {
    const warn = vi.fn()
    expect(samplingRequest({ sampling: 'median' }, 640, warn)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('lttb, average, max, min, sum')
  })

  it('a NON-string `sampling` takes the same unsupported path', () => {
    const warn = vi.fn()
    expect(samplingRequest({ sampling: 7 }, 640, warn)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('an unsupported `sampling` does NOT suppress a `large` request on the same series', () => {
    const warn = vi.fn()
    expect(samplingRequest({ sampling: 'median', large: true }, 640, warn)).toEqual({
      limit: LARGE_THRESHOLD,
      method: 'lttb',
    })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('`large` uses its threshold, defaulting when absent or non-finite', () => {
    const warn = vi.fn()
    expect(samplingRequest({ large: true }, 640, warn)).toEqual({ limit: LARGE_THRESHOLD, method: 'lttb' })
    expect(samplingRequest({ large: true, largeThreshold: 500 }, 640, warn)).toEqual({ limit: 500, method: 'lttb' })
    // `Number.isFinite` rejects NaN/Infinity, so both fall back to the default.
    expect(samplingRequest({ large: true, largeThreshold: Number.NaN }, 640, warn)).toEqual({
      limit: LARGE_THRESHOLD,
      method: 'lttb',
    })
    expect(samplingRequest({ large: true, largeThreshold: '500' }, 640, warn)).toEqual({
      limit: LARGE_THRESHOLD,
      method: 'lttb',
    })
    // A tiny threshold is still floored at 3.
    expect(samplingRequest({ large: true, largeThreshold: 1 }, 640, warn)).toEqual({ limit: 3, method: 'lttb' })
    // `large: false` is not a request at all.
    expect(samplingRequest({ large: false }, 640, warn)).toBeNull()
  })

  it('`progressive` asks only when it is a positive finite number', () => {
    const warn = vi.fn()
    expect(samplingRequest({ progressive: 400 }, 640, warn)).toEqual({
      limit: PROGRESSIVE_THRESHOLD,
      method: 'lttb',
    })
    expect(samplingRequest({ progressive: 400, progressiveThreshold: 900 }, 640, warn)).toEqual({
      limit: 900,
      method: 'lttb',
    })
    expect(samplingRequest({ progressive: 0 }, 640, warn)).toBeNull()
    expect(samplingRequest({ progressive: -1 }, 640, warn)).toBeNull()
    expect(samplingRequest({ progressive: 'fast' }, 640, warn)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('an empty series asks for nothing', () => {
    const warn = vi.fn()
    expect(samplingRequest({}, 640, warn)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('decimateShared — every column thinned on the SAME rows', () => {
  const req = (limit: number, method: SamplingRequest['method'] = 'lttb'): SamplingRequest => ({ limit, method })

  it('returns the rows untouched when nothing asks, or there is nothing to thin', () => {
    const r = rows([[1, 2, 3, 4, 5]])
    expect(decimateShared([], r)).toBe(r)
    expect(decimateShared([req(3)], rows([]))).toEqual(rows([]))
    // Under the limit — no thinning.
    expect(decimateShared([req(10)], r)).toBe(r)
    // A limit below LTTB's two-endpoints-plus-one floor is refused.
    expect(decimateShared([req(2)], r)).toBe(r)
  })

  it('refuses to thin columns of DIFFERENT lengths — it would misalign the shared x', () => {
    const r = rows([
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3],
    ])
    expect(decimateShared([req(3)], r)).toBe(r)
  })

  it('the TIGHTEST limit wins and the FIRST request decides the method', () => {
    const values = Array.from({ length: 20 }, (_, i) => i)
    const out = decimateShared([req(6, 'average'), req(4, 'lttb')], rows([values]))
    // Bucket aggregation (the first request's method) into the tightest limit.
    expect(out.columns[0]).toHaveLength(4)
    expect(out.columns[0]).toEqual([2, 7, 12, 17])
  })

  it('LTTB keeps real datums and thins categories and x on the same rows', () => {
    const n = 40
    const values = Array.from({ length: n }, (_, i) => Math.sin(i))
    const cats = Array.from({ length: n }, (_, i) => `c${i}`)
    const xs = Array.from({ length: n }, (_, i) => i)
    const out = decimateShared([req(8)], rows([values, values.map((v) => -v)], cats, xs))
    expect(out.columns[0]).toHaveLength(8)
    expect(out.columns[1]).toHaveLength(8)
    expect(out.categories).toHaveLength(8)
    expect(out.xValues).toHaveLength(8)
    // Same rows across every column: the second column is the negation of the first.
    expect(out.columns[1]).toEqual(out.columns[0]!.map((v) => -v))
    // And each kept category matches its kept x, so the pairing survived.
    for (const [i, x] of out.xValues!.entries()) expect(out.categories[i]).toBe(`c${x}`)
  })

  it('a categories array that does not match the row count is passed through unthinned', () => {
    const values = Array.from({ length: 20 }, (_, i) => i)
    const out = decimateShared([req(5)], rows([values], ['only', 'three', 'labels']))
    expect(out.columns[0]).toHaveLength(5)
    expect(out.categories).toEqual(['only', 'three', 'labels'])
    expect(out.xValues).toBeUndefined()
  })

  it('max, min and sum aggregate within each bucket; NaN datums are skipped', () => {
    const values = [1, 9, 2, 8, 3, 7]
    expect(decimateShared([req(3, 'max')], rows([values])).columns[0]).toEqual([9, 8, 7])
    expect(decimateShared([req(3, 'min')], rows([values])).columns[0]).toEqual([1, 2, 3])
    expect(decimateShared([req(3, 'sum')], rows([values])).columns[0]).toEqual([10, 10, 10])
    // A bucket that is entirely NaN stays NaN rather than becoming 0.
    const holes = [Number.NaN, Number.NaN, 4, 6, 5, 5]
    const out = decimateShared([req(3, 'average')], rows([holes])).columns[0]!
    expect(Number.isNaN(out[0]!)).toBe(true)
    expect(out[1]).toBe(5)
    expect(out[2]).toBe(5)
  })

  it('the bucket path takes the FIRST row of each bucket for categories and x', () => {
    const values = [0, 1, 2, 3, 4, 5]
    const cats = ['a', 'b', 'c', 'd', 'e', 'f']
    const xs = [10, 11, 12, 13, 14, 15]
    const out = decimateShared([req(3, 'average')], rows([values], cats, xs))
    expect(out.categories).toEqual(['a', 'c', 'e'])
    expect(out.xValues).toEqual([10, 12, 14])
  })
})
