/**
 * Showcase: the reactive-native matchers from `@pyreon/testing` — the part no
 * other framework's testing library has. These read Pyreon's reactive graph to
 * assert on FIRE COUNTS and FINE-GRAINED re-run behavior, on real store code
 * (the playground's `useCounter` store: a `count` signal + a `doubled`
 * computed).
 *
 * The differentiator is `notToReRunWhen`: proving that an UNRELATED change
 * does NOT re-run an effect — a claim a whole-component re-render model can't
 * even express.
 */
import { afterEach, describe, it } from 'vitest'
import { effect, signal, __resetReactiveDevtoolsForTesting } from '@pyreon/reactivity'
import { expectEffect, expectSignal } from '@pyreon/testing'
import { useCounter } from '../demos/StoreDemo'

afterEach(() => __resetReactiveDevtoolsForTesting())

describe('StoreDemo reactivity — @pyreon/testing reactive matchers', () => {
  it('the `doubled` computed recomputes ONLY when `count` changes (no thrash)', () => {
    const { store, reset } = useCounter()
    reset() // singleton store — start from a known state

    store.doubled() // prime
    store.increment()
    store.doubled() // read → recompute
    store.increment()
    store.doubled() // read → recompute

    // Exactly the prime + 2 dependency-driven recomputes — not once per read.
    expectSignal(store.doubled).toHaveRecomputedTimes(3)
  })

  it('an effect tracking `count` re-runs on increment but NOT on an unrelated write', () => {
    const { store } = useCounter()
    const unrelated = signal(0)

    const e = effect(() => {
      store.count()
    })

    // Re-runs when its dependency changes …
    expectEffect(e).toReRunWhen(() => store.increment())
    // … and — the fine-grained guarantee — NOT when something unrelated changes.
    // A whole-component re-render model cannot assert this.
    expectEffect(e).notToReRunWhen(() => unrelated.set(99))

    e.dispose()
  })
})
