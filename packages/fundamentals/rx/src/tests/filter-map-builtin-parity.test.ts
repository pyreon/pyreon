/**
 * `filter` and `map` run their own loops instead of calling
 * `Array.prototype.filter` / `map` (a callback passed through rx's parameter
 * into the builtin was ~1.5x slower on JSC). These specs lock that the loops
 * keep the builtins' observable behaviour — the third `array` argument, holes
 * in sparse arrays, and the result for a signal source as well as a plain array.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { average, every, filter, find, map, reduce, some, sum } from '../index'

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

describe('aggregations match the Array builtins', () => {
  const arr = [3, 1, 4, 1, 5]

  it('reduce passes acc, item, index and the array, and skips holes', () => {
    const calls: unknown[] = []
    const out = reduce(arr, ((acc: number, x: number, i: number, a: number[]) => {
      calls.push([acc, x, i, a])
      return acc + x
    }) as (acc: number, item: number, index: number) => number, 10)
    expect(out).toBe(arr.reduce((a, x) => a + x, 10))
    expect(calls.length).toBe(arr.length)
    expect(reduce(sparse(), (a: number, x: number) => a + x, 0)).toBe(sparse().reduce((a, x) => a + x, 0))
  })

  it('every and some short-circuit and skip holes', () => {
    expect(every(arr, (x: number) => x > 0)).toBe(true)
    expect(every(arr, (x: number) => x > 1)).toBe(false)
    expect(every([], () => false)).toBe(true)
    expect(some(arr, (x: number) => x === 4)).toBe(true)
    expect(some([], () => true)).toBe(false)
    let calls = 0
    expect(every(sparse(), (x: number) => (calls++, x !== undefined))).toBe(true)
    expect(calls).toBe(3)
    expect(some(sparse(), (x: number) => x === undefined)).toBe(false)
  })

  it('find visits holes as undefined, like Array.prototype.find', () => {
    expect(find(arr, (x: number) => x > 3)).toBe(4)
    expect(find(arr, (x: number) => x > 9)).toBeUndefined()
    const visited: number[] = []
    find(sparse(), ((_x: number, i: number) => {
      visited.push(i)
      return false
    }) as (item: number) => boolean)
    expect(visited).toEqual([0, 1, 2, 3, 4])
  })

  it('sum and average skip holes and divide by length', () => {
    expect(sum(arr)).toBe(14)
    expect(average(arr)).toBe(14 / 5)
    expect(average([])).toBe(0)
    expect(sum(sparse())).toBe(9)
    expect(average(sparse())).toBe(9 / 5)
  })
})
