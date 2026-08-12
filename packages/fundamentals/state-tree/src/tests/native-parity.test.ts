/**
 * The WEB arm of `@pyreon/state-tree`'s native lowering.
 *
 * PMTC lowers `model({ state }).views(f).actions(f).create()` to a Swift
 * `@Observable` class and a Kotlin `object`. Those two agreeing with each
 * other proves nothing — they were written from the same belief about what
 * the web does. This file measures the belief.
 *
 * The specific claim under test is the one the native emit got backwards:
 * a state field is a SIGNAL, so `instance.total` is the accessor and
 * `instance.total()` is the value. The emit read it bare, which meant the
 * source that compiled natively was the source that is wrong here — and
 * the source that is right here did not compile.
 *
 * Native counterpart: packages/native/compiler/src/tests/
 * native-model-views-actions.test.ts
 */
import { describe, expect, it } from 'vitest'
import { model } from '../model'

const Cart = model({ state: { total: 0, note: 'empty' } })
  .views((self) => ({ doubled: () => (self.total as () => number)() * 2 }))
  .actions((self) => ({
    add: (n: number) =>
      (self.total as { set(v: number): void }).set(
        (self.total as () => number)() + n,
      ),
    reset: () => (self.total as { set(v: number): void }).set(0),
  }))

describe('a state field is a signal, not a plain property', () => {
  it('the bare member is the ACCESSOR; calling it yields the value', () => {
    const cart = Cart.create()
    // This is the whole inversion in two lines: native emitted the first
    // form (a function here, not a number) and rejected the second.
    expect(typeof cart.total).toBe('function')
    expect(cart.total()).toBe(0)
  })

  it('reads stay live after an action writes', () => {
    const cart = Cart.create()
    cart.add(3)
    expect(cart.total()).toBe(3)
  })
})

describe('views are called; actions mutate', () => {
  it('a view reads through to current state', () => {
    const cart = Cart.create()
    expect(cart.doubled()).toBe(0)
    cart.add(4)
    // A view is derived, not a snapshot taken at create().
    expect(cart.doubled()).toBe(8)
  })

  it('actions take their arguments and are callable with none', () => {
    const cart = Cart.create()
    cart.add(5)
    expect(cart.total()).toBe(5)
    cart.reset()
    expect(cart.total()).toBe(0)
  })

  it('instances are independent — create() is not a shared singleton', () => {
    // Worth pinning: the native emit is a SINGLETON (`static let shared` /
    // `object`), so a second `.create()` would alias the first. Web does
    // not, and any future native support for multiple instances of one
    // model has to start from this assertion.
    const a = Cart.create()
    const b = Cart.create()
    a.add(7)
    expect(a.total()).toBe(7)
    expect(b.total()).toBe(0)
  })
})

describe('string state behaves the same way', () => {
  it('reads through the accessor', () => {
    const cart = Cart.create()
    expect(typeof cart.note).toBe('function')
    expect(cart.note()).toBe('empty')
  })
})
