/**
 * The WEB arm of `@pyreon/rx`'s native lowering.
 *
 * PMTC now lowers the STANDALONE transforms (`filter(src, p)`), not just the
 * `rx.*` namespace. The emit turns each into the target's own collection
 * method — `nums.filter { … }` on Swift, `nums.filter { … }` on Kotlin — so
 * what has to hold is that those methods answer what rx answers.
 *
 * The shape being pinned first is the one the lowering depends on and that a
 * reader would not guess from the docs: the transforms are SOURCE-FIRST and
 * return a computed, which is why `map(src, fn)` is structurally identical to
 * `rx.map(src, fn)` and could share one recognizer.
 *
 * Native counterpart:
 *   packages/native/compiler/src/tests/native-rx-standalone.test.ts
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { filter, map, take, unique } from '../collections'

describe('the standalone transforms are source-first and reactive', () => {
  it('take the signal FIRST and return a computed, not a value', () => {
    const nums = signal([1, 2, 3, 4])
    const evens = filter(nums, (n) => n % 2 === 0)
    // A computed accessor — this is what makes `evens()` the read on both
    // sides, and what the native emit reproduces as a derived property.
    expect(typeof evens).toBe('function')
    expect(evens()).toEqual([2, 4])
  })

  it('stay live when the source changes', () => {
    const nums = signal([1, 2, 3])
    const doubled = map(nums, (n) => n * 2)
    expect(doubled()).toEqual([2, 4, 6])
    nums.set([5])
    // The native emit is a computed property / derivedStateOf, so this is
    // the property that must survive the lowering.
    expect(doubled()).toEqual([10])
  })
})

describe('the lowered set answers what the native collection methods answer', () => {
  const nums = signal([3, 1, 2, 3, 4])

  it('filter keeps order', () => {
    expect(filter(nums, (n) => n > 2)()).toEqual([3, 3, 4])
  })

  it('map preserves length and order', () => {
    expect(map(nums, (n) => n * 2)()).toEqual([6, 2, 4, 6, 8])
  })

  it('take is a PREFIX, and a count past the end is not an error', () => {
    // Swift lowers this to `prefix`, Kotlin to `take`; both clamp rather
    // than throw, so the web contract has to clamp too.
    expect(take(nums, 2)()).toEqual([3, 1])
    expect(take(nums, 99)()).toEqual([3, 1, 2, 3, 4])
    expect(take(nums, 0)()).toEqual([])
  })

  it('unique keeps the FIRST occurrence, not the last', () => {
    // The distinction matters: Swift and Kotlin both have to reproduce
    // first-wins, and a set-based implementation would not.
    expect(unique(nums)()).toEqual([3, 1, 2, 4])
  })
})
