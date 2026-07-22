import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { difference, intersection, sortBy, union } from '../collections'

// New completeness surface: set operations (signal-aware on BOTH inputs) +
// sortBy direction.

describe('intersection', () => {
  it('static × static → plain array (identity)', () => {
    expect(intersection([1, 2, 3, 4], [2, 4, 6])).toEqual([2, 4])
  })

  it('by key selector', () => {
    const a = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const b = [{ id: 2 }, { id: 9 }]
    expect(intersection(a, b, 'id')).toEqual([{ id: 2 }])
  })

  it('signal source → Computed that tracks BOTH inputs', () => {
    const src = signal([1, 2, 3])
    const other = signal([2, 3, 9])
    const both = intersection(src, other)
    expect(both()).toEqual([2, 3])
    src.set([3, 9])
    expect(both()).toEqual([3, 9])
    other.set([9])
    expect(both()).toEqual([9])
  })

  it('plain source × signal other is ALSO reactive', () => {
    const other = signal([2])
    const out = intersection([1, 2, 3], other)
    expect(out()).toEqual([2])
    other.set([1, 3])
    expect(out()).toEqual([1, 3])
  })
})

describe('difference', () => {
  it('items of source not in other', () => {
    expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3])
  })

  it('by key, reactive', () => {
    const src = signal([{ id: 1 }, { id: 2 }])
    const out = difference(src, [{ id: 2 }], 'id')
    expect(out()).toEqual([{ id: 1 }])
    src.set([{ id: 2 }, { id: 3 }])
    expect(out()).toEqual([{ id: 3 }])
  })
})

describe('union', () => {
  it('order-preserving, source first, dedupes by identity', () => {
    expect(union([1, 2], [2, 3, 1, 4])).toEqual([1, 2, 3, 4])
  })

  it('by key — first occurrence wins', () => {
    const a = [{ id: 1, v: 'a' }]
    const b = [{ id: 1, v: 'B' }, { id: 2, v: 'b' }]
    expect(union(a, b, 'id')).toEqual([{ id: 1, v: 'a' }, { id: 2, v: 'b' }])
  })

  it('reactive on the second input', () => {
    const other = signal([3])
    const out = union([1, 2], other)
    expect(out()).toEqual([1, 2, 3])
    other.set([2, 4])
    expect(out()).toEqual([1, 2, 4])
  })
})

describe('sortBy direction', () => {
  it("'desc' inverts; default stays ascending (back-compat)", () => {
    const items = [{ n: 2 }, { n: 3 }, { n: 1 }]
    expect(sortBy(items, 'n').map((i) => i.n)).toEqual([1, 2, 3])
    expect(sortBy(items, 'n', 'desc').map((i) => i.n)).toEqual([3, 2, 1])
  })

  it('reactive desc', () => {
    const src = signal([{ n: 1 }, { n: 5 }])
    const out = sortBy(src, 'n', 'desc')
    expect(out().map((i) => i.n)).toEqual([5, 1])
    src.set([{ n: 2 }, { n: 9 }, { n: 4 }])
    expect(out().map((i) => i.n)).toEqual([9, 4, 2])
  })
})
