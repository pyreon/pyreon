import { describe, expect, it } from 'vitest'
import { bars, columnLength, isColumnMark, line, resolveMarks, stackedArea, waterfall } from './marks'

// A column is the call-free alternative to an accessor. It must resolve to
// exactly what the equivalent accessor resolves to, gaps included.
const rowsOf = (n: number): undefined[] => new Array<undefined>(n).fill(undefined)

describe('column marks', () => {
  it('resolves a Float64Array identically to the equivalent accessor', () => {
    const col = new Float64Array([1, 2.5, -3, 4])
    const viaCol = resolveMarks(rowsOf(4), [line(col)])[0]!.values
    const viaAcc = resolveMarks(rowsOf(4), [line((_d: undefined, i: number) => col[i]!)])[0]!.values
    expect(viaCol).toEqual(viaAcc)
    expect(viaCol).toEqual([1, 2.5, -3, 4])
  })

  it('treats NaN, ±Infinity and indices past the end as gaps', () => {
    const v = resolveMarks(rowsOf(6), [bars([1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])])[0]!.values
    expect(v[0]).toBe(1)
    for (let i = 1; i < 6; i++) expect(Number.isNaN(v[i])).toBe(true)
  })

  it('reads only as many points as there are rows', () => {
    const v = resolveMarks(rowsOf(2), [line([5, 6, 7, 8])])[0]!.values
    expect(v).toEqual([5, 6])
  })

  it('keeps `y` callable, so per-datum consumers still work', () => {
    const m = waterfall([10, 20])
    expect(m.y(undefined, 1)).toBe(20)
    expect(Number.isNaN(m.y(undefined, 5))).toBe(true)
  })

  it('reports column marks and the longest column', () => {
    const a = line([1, 2, 3])
    const b = stackedArea(new Float64Array(7))
    const c = line((d: { v: number }) => d.v)
    expect(isColumnMark(a)).toBe(true)
    expect(isColumnMark(c)).toBe(false)
    expect(columnLength([a, b])).toBe(7)
    expect(columnLength([c])).toBe(0)
  })
})
