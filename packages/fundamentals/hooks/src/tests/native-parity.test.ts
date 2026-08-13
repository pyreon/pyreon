/**
 * The WEB arm of `useToggle` / `useCounter`'s native lowering.
 *
 * Both are pure state — a signal plus a few mutators — so PMTC lowers them
 * with no runtime: the state becomes a plain field and every mutator is
 * rewritten at its use site into the arithmetic it stands for. That makes
 * `useCounter`'s CLAMP the thing most likely to drift, because it is written
 * into the emitted output rather than executed by shared code.
 *
 * These are the semantics the two emits reproduce. They are asserted here
 * rather than inferred from the implementation, because "what does reset()
 * restore when the initial value is out of bounds" is exactly the kind of
 * question two native ports would answer the same wrong way.
 *
 * Native counterpart:
 *   packages/native/compiler/src/tests/native-pure-state-hooks.test.ts
 */
import { describe, expect, it } from 'vitest'
import { useCounter } from '../useCounter'
import { useToggle } from '../useToggle'

describe('useToggle', () => {
  it('defaults to false and flips', () => {
    const t = useToggle()
    expect(t.value()).toBe(false)
    t.toggle()
    expect(t.value()).toBe(true)
  })

  it('setTrue / setFalse are absolute, not flips', () => {
    const t = useToggle(true)
    t.setTrue()
    expect(t.value()).toBe(true)
    t.setFalse()
    expect(t.value()).toBe(false)
  })
})

describe('useCounter without bounds', () => {
  it('inc/dec default to a step of 1 and take an explicit delta', () => {
    const c = useCounter(0)
    c.inc()
    expect(c.count()).toBe(1)
    c.inc(5)
    expect(c.count()).toBe(6)
    c.dec(2)
    expect(c.count()).toBe(4)
  })

  it('goes negative — an unbounded counter has no floor', () => {
    const c = useCounter(0)
    c.dec(3)
    expect(c.count()).toBe(-3)
  })
})

describe('useCounter clamping — the half the emit bakes in', () => {
  it('clamps on inc and dec rather than refusing them', () => {
    const c = useCounter(1, { min: 0, max: 10 })
    c.inc(100)
    expect(c.count()).toBe(10)
    c.dec(100)
    expect(c.count()).toBe(0)
  })

  it('clamps set() too, not only the steppers', () => {
    const c = useCounter(1, { min: 0, max: 10 })
    c.set(999)
    expect(c.count()).toBe(10)
    c.set(-999)
    expect(c.count()).toBe(0)
  })

  it('clamps the INITIAL value as well', () => {
    // The emit bakes the clamp into the field's seed, so this is the
    // assertion that keeps the two in step.
    expect(useCounter(50, { max: 10 }).count()).toBe(10)
    expect(useCounter(-50, { min: 0 }).count()).toBe(0)
  })

  it('reset() restores the CLAMPED initial, not the raw argument', () => {
    // The subtle one, and the reason the emit clamps its reset expression
    // rather than assigning the literal: an out-of-bounds seed must not
    // reappear on reset.
    const c = useCounter(50, { max: 10 })
    c.set(3)
    c.reset()
    expect(c.count()).toBe(10)
  })

  it('a one-sided bound leaves the other side free', () => {
    const c = useCounter(0, { min: 0 })
    c.inc(1000)
    expect(c.count()).toBe(1000)
    c.dec(5000)
    expect(c.count()).toBe(0)
  })
})
