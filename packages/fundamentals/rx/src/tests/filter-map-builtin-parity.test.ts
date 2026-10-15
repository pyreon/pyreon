/**
 * `filter` and `map` run their own loops instead of calling
 * `Array.prototype.filter` / `map` (a callback passed through rx's parameter
 * into the builtin was ~1.5x slower on JSC). These specs lock that the loops
 * keep the builtins' observable behaviour — the third `array` argument, holes
 * in sparse arrays, and the result for a signal source as well as a plain array.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { filter, map } from '../index'

const sparse = (): number[] => {
  // oxlint-disable-next-line no-sparse-arrays -- the holes are the point
  const a = [1, , 3, , 5] as number[]
  return a
}

describe('filter matches Array.prototype.filter', () => {
  it('passes item, index and the array, and keeps matching items in order', () => {
    const seen: unknown[] = []
    const arr = [10, 20, 30, 40]
    const out = filter(arr, ((item: number, i: number, a: number[]) => {
      seen.push([item, i, a])
      return item > 15
    }) as (item: number, index: number) => boolean)
    expect(out).toEqual(arr.filter((x) => x > 15))
    expect(seen).toEqual(arr.map((x, i) => [x, i, arr]))
  })

  it('skips holes without calling the predicate', () => {
    const calls: number[] = []
    const out = filter(sparse(), (_x: number, i: number) => {
      calls.push(i)
      return true
    })
    expect(out).toEqual(sparse().filter(() => true))
    expect(calls).toEqual([0, 2, 4])
  })

  it('recomputes from a signal source', () => {
    const src = signal([1, 2, 3, 4])
    const evens = filter(src, (x: number) => x % 2 === 0)
    expect(evens()).toEqual([2, 4])
    src.set([5, 6])
    expect(evens()).toEqual([6])
  })
})

describe('map matches Array.prototype.map', () => {
  it('passes item, index and the array', () => {
    const arr = ['a', 'b']
    const out = map(arr, ((item: string, i: number, a: string[]) => `${item}${i}${a.length}`) as (
      item: string,
      index: number,
    ) => string)
    expect(out).toEqual(['a02', 'b12'])
  })

  it('leaves holes as holes without calling the callback', () => {
    const calls: number[] = []
    const out = map(sparse(), (x: number, i: number) => {
      calls.push(i)
      return x * 2
    })
    const expected = sparse().map((x) => x * 2)
    expect(out.length).toBe(expected.length)
    expect(Object.keys(out)).toEqual(Object.keys(expected))
    expect(out).toEqual(expected)
    expect(calls).toEqual([0, 2, 4])
  })

  it('recomputes from a signal source', () => {
    const src = signal([1, 2])
    const doubled = map(src, (x: number) => x * 2)
    expect(doubled()).toEqual([2, 4])
    src.set([3])
    expect(doubled()).toEqual([6])
  })
})
