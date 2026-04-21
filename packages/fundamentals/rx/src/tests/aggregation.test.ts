import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { average, count, every, max, min, reduce, some, sum } from '../aggregation'

describe('aggregation — plain values', () => {
  it('count', () => {
    expect(count([1, 2, 3])).toBe(3)
    expect(count([])).toBe(0)
  })

  it('sum', () => {
    expect(sum([1, 2, 3])).toBe(6)
  })

  it('sum with key', () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }]
    expect(sum(items, 'v')).toBe(60)
  })

  it('min', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }]
    expect(min(items, 'v')?.v).toBe(1)
  })

  it('max', () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }]
    expect(max(items, 'v')?.v).toBe(3)
  })

  it('min/max empty array', () => {
    expect(min([])).toBeUndefined()
    expect(max([])).toBeUndefined()
  })

  it('average', () => {
    expect(average([2, 4, 6])).toBe(4)
  })

  it('average with key', () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }]
    expect(average(items, 'v')).toBe(20)
  })

  it('average empty array returns 0', () => {
    expect(average([])).toBe(0)
  })

  it('reduce', () => {
    expect(reduce([1, 2, 3], (acc, n) => acc + n, 0)).toBe(6)
    expect(reduce([], (acc: number, n: number) => acc + n, 10)).toBe(10)
  })

  it('reduce with index', () => {
    const result = reduce(['a', 'b', 'c'], (acc, item, i) => acc + `${i}:${item} `, '')
    expect(result).toBe('0:a 1:b 2:c ')
  })

  it('every', () => {
    expect(every([2, 4, 6], (n) => n % 2 === 0)).toBe(true)
    expect(every([2, 3, 6], (n) => n % 2 === 0)).toBe(false)
    expect(every([], () => false)).toBe(true) // vacuous truth
  })

  it('some', () => {
    expect(some([1, 3, 5], (n) => n % 2 === 0)).toBe(false)
    expect(some([1, 2, 5], (n) => n % 2 === 0)).toBe(true)
    expect(some([], () => true)).toBe(false)
  })
})

describe('aggregation — signal values', () => {
  it('count returns computed', () => {
    const src = signal([1, 2, 3])
    const c = count(src)
    expect(c()).toBe(3)
    src.set([1])
    expect(c()).toBe(1)
  })

  it('sum returns computed', () => {
    const src = signal([1, 2, 3])
    const s = sum(src)
    expect(s()).toBe(6)
    src.set([10, 20])
    expect(s()).toBe(30)
  })

  it('average returns computed', () => {
    const src = signal([2, 4, 6])
    const avg = average(src)
    expect(avg()).toBe(4)

    src.set([10, 20])
    expect(avg()).toBe(15)
  })

  it('average with key returns computed', () => {
    const src = signal([{ v: 10 }, { v: 20 }, { v: 30 }])
    const avg = average(src, 'v')
    expect(avg()).toBe(20)

    src.set([{ v: 100 }])
    expect(avg()).toBe(100)
  })

  it('reduce returns computed', () => {
    const src = signal([1, 2, 3])
    const total = reduce(src, (acc, n) => acc + n, 0)
    expect(total()).toBe(6)
    src.set([10, 20])
    expect(total()).toBe(30)
  })

  it('every returns computed', () => {
    const src = signal([2, 4, 6])
    const allEven = every(src, (n) => n % 2 === 0)
    expect(allEven()).toBe(true)
    src.set([2, 3, 6])
    expect(allEven()).toBe(false)
  })

  it('some returns computed', () => {
    const src = signal([1, 3, 5])
    const hasEven = some(src, (n) => n % 2 === 0)
    expect(hasEven()).toBe(false)
    src.set([1, 2, 5])
    expect(hasEven()).toBe(true)
  })
})
