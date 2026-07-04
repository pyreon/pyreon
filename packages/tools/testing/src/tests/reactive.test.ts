/**
 * Reactive-native matchers. These are the differentiator — fire-count +
 * fine-grained re-run assertions read from Pyreon's reactive graph.
 *
 * Includes the side-by-side rewrite of the hand-rolled `let ran = 0` pattern
 * (the 49-file shape) to demonstrate the ergonomic win.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { computed, effect, signal, __resetReactiveDevtoolsForTesting } from '@pyreon/reactivity'
import { expectEffect, expectSignal } from '../index'

afterEach(() => __resetReactiveDevtoolsForTesting())

describe('expectSignal', () => {
  it('toHaveChangedTimes counts writes', () => {
    const count = signal(0)
    count.set(1)
    count.set(2)
    count.set(3)
    expectSignal(count).toHaveChangedTimes(3)
  })

  it('toHaveRecomputedTimes counts computed recomputes (no thrash)', () => {
    const qty = signal(2)
    const price = signal(10)
    const total = computed(() => qty() * price())
    total() // prime
    qty.set(3)
    total()
    price.set(20)
    total()
    expectSignal(total).toHaveRecomputedTimes(3) // prime + 2 dep-change recomputes
  })

  it('throws a clear error for a non-reactive target', () => {
    expect(() => expectSignal({}).toHaveChangedTimes(1)).toThrow(/not a reactive node/)
  })
})

describe('expectEffect', () => {
  it('toReRunWhen + notToReRunWhen express fine-grained precision', () => {
    const qty = signal(1)
    const unrelated = signal(0)
    const e = effect(() => {
      qty()
    })
    expectEffect(e).toReRunWhen(() => qty.set(2))
    // The NEGATIVE — a DOM-only testing library can't express this:
    expectEffect(e).notToReRunWhen(() => unrelated.set(9))
    e.dispose()
  })

  it('notToReRunWhen fails when the effect DID re-run', () => {
    const a = signal(0)
    const e = effect(() => {
      a()
    })
    expect(() => expectEffect(e).notToReRunWhen(() => a.set(1))).toThrow(/expected effect NOT to re-run/)
    e.dispose()
  })
})

describe('rewrite: the hand-rolled `let ran = 0` pattern', () => {
  it('BEFORE — manual counter + mental math', () => {
    const a = signal(1)
    let runs = 0
    const e = effect(() => {
      a()
      runs++
    })
    a.set(2)
    a.set(3)
    expect(runs).toBe(3) // "initial + 2 writes" — mechanism, not intent
    e.dispose()
  })

  it('AFTER — matcher reads as intent, no counter var', () => {
    const a = signal(1)
    const e = effect(() => { a() })
    expectEffect(e).toReRunWhen(() => a.set(2))
    expectEffect(e).toReRunWhen(() => a.set(3))
    e.dispose()
  })
})
