import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { combine, distinct, merge, scan, zip } from '../operators'

describe('distinct', () => {
  it('skips consecutive duplicate values', () => {
    const src = signal(1)
    const d = distinct(src)
    expect(d()).toBe(1)

    // Same value — should not re-emit
    src.set(1)
    expect(d()).toBe(1)

    // Different value — should emit
    src.set(2)
    expect(d()).toBe(2)

    // Back to same — should emit (not same as previous)
    src.set(2)
    expect(d()).toBe(2)

    // New value
    src.set(3)
    expect(d()).toBe(3)
  })

  it('supports custom equality function', () => {
    const src = signal({ id: 1, name: 'Alice' })
    const d = distinct(src, (a, b) => a.id === b.id)
    expect(d().name).toBe('Alice')

    // Same id, different name — should be considered equal, skip
    src.set({ id: 1, name: 'Updated Alice' })
    expect(d().name).toBe('Alice')

    // Different id — should emit
    src.set({ id: 2, name: 'Bob' })
    expect(d().name).toBe('Bob')
  })

  it('works reactively with signal source', () => {
    const src = signal('a')
    const d = distinct(src)
    expect(d()).toBe('a')

    src.set('b')
    expect(d()).toBe('b')

    src.set('b')
    expect(d()).toBe('b')

    src.set('c')
    expect(d()).toBe('c')
  })
})

describe('scan', () => {
  it('accumulates values over signal changes', () => {
    const src = signal(0)
    const total = scan(src, (acc, val) => acc + val, 0)

    // Initial: reducer runs with initial source value
    expect(total()).toBe(0)

    src.set(1)
    expect(total()).toBe(1)

    src.set(3)
    expect(total()).toBe(4)

    src.set(2)
    expect(total()).toBe(6)
  })

  it('works with non-numeric accumulation', () => {
    const src = signal('start')
    const log = scan(src, (acc, val) => [...acc, val], [] as string[])

    // Effect runs immediately with initial value
    expect(log()).toEqual(['start'])

    src.set('hello')
    expect(log()).toEqual(['start', 'hello'])

    src.set('world')
    expect(log()).toEqual(['start', 'hello', 'world'])
  })

  it('is signal-reactive', () => {
    const src = signal(10)
    const running = scan(src, (acc, val) => acc + val, 0)
    expect(running()).toBe(10)

    src.set(5)
    expect(running()).toBe(15)

    // Different value triggers accumulation again
    src.set(7)
    expect(running()).toBe(22)
  })
})

describe('combine', () => {
  it('combines 2 signals', () => {
    const firstName = signal('John')
    const lastName = signal('Doe')
    const fullName = combine(firstName, lastName, (f, l) => `${f} ${l}`)

    expect(fullName()).toBe('John Doe')
  })

  it('combines 3 signals', () => {
    const a = signal(1)
    const b = signal(2)
    const c = signal(3)
    const total = combine(a, b, c, (x, y, z) => x + y + z)

    expect(total()).toBe(6)
  })

  it('reacts to updates from any source', () => {
    const firstName = signal('John')
    const lastName = signal('Doe')
    const fullName = combine(firstName, lastName, (f, l) => `${f} ${l}`)

    expect(fullName()).toBe('John Doe')

    firstName.set('Jane')
    expect(fullName()).toBe('Jane Doe')

    lastName.set('Smith')
    expect(fullName()).toBe('Jane Smith')
  })

  it('reacts to updates from all 3 sources', () => {
    const a = signal(1)
    const b = signal(10)
    const c = signal(100)
    const sum = combine(a, b, c, (x, y, z) => x + y + z)

    expect(sum()).toBe(111)

    a.set(2)
    expect(sum()).toBe(112)

    b.set(20)
    expect(sum()).toBe(122)

    c.set(200)
    expect(sum()).toBe(222)
  })
})

// ─── zip ────────────────────────────────────────────────────────────────────

describe('zip', () => {
  it('zips two plain arrays element-by-element', () => {
    expect(zip(['a', 'b', 'c'], [1, 2, 3])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('truncates to shortest array', () => {
    expect(zip(['a', 'b'], [1, 2, 3, 4])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('empty arrays', () => {
    expect(zip([], [])).toEqual([])
    expect(zip(['a'], [])).toEqual([])
  })

  it('three arrays', () => {
    expect(zip(['a', 'b'], [1, 2], [true, false])).toEqual([
      ['a', 1, true],
      ['b', 2, false],
    ])
  })

  it('signal inputs return reactive computed', () => {
    const names = signal(['Alice', 'Bob'])
    const ages = signal([30, 25])
    const pairs = zip(names, ages)
    expect(pairs()).toEqual([
      ['Alice', 30],
      ['Bob', 25],
    ])

    names.set(['Charlie'])
    expect(pairs()).toEqual([['Charlie', 30]])

    ages.set([40, 50])
    expect(pairs()).toEqual([['Charlie', 40]])
  })

  it('mixed signal and plain array', () => {
    const names = signal(['Alice', 'Bob'])
    const ages = [30, 25]
    const pairs = zip(names, ages)
    expect(pairs()).toEqual([
      ['Alice', 30],
      ['Bob', 25],
    ])

    names.set(['Charlie', 'Dave', 'Eve'])
    expect(pairs()).toEqual([
      ['Charlie', 30],
      ['Dave', 25],
    ])
  })
})

// ─── merge ─────────────────���─────────────────────────────��──────────────────

describe('merge', () => {
  it('concatenates plain arrays', () => {
    expect(merge([1, 2], [3, 4], [5])).toEqual([1, 2, 3, 4, 5])
  })

  it('empty arrays', () => {
    expect(merge([], [])).toEqual([])
  })

  it('single array', () => {
    expect(merge([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('signal inputs return reactive computed', () => {
    const a = signal([1, 2])
    const b = signal([3, 4])
    const all = merge(a, b)
    expect(all()).toEqual([1, 2, 3, 4])

    a.set([10])
    expect(all()).toEqual([10, 3, 4])

    b.set([20, 30])
    expect(all()).toEqual([10, 20, 30])
  })

  it('mixed signal and plain array', () => {
    const a = signal([1, 2])
    const b = [3, 4]
    const all = merge(a, b)
    expect(all()).toEqual([1, 2, 3, 4])

    a.set([10])
    expect(all()).toEqual([10, 3, 4])
  })
})
