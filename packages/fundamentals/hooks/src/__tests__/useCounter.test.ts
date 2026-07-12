import { describe, expect, it } from 'vitest'
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  it('defaults to 0', () => {
    const { count } = useCounter()
    expect(count()).toBe(0)
  })

  it('respects the initial value', () => {
    const { count } = useCounter(5)
    expect(count()).toBe(5)
  })

  it('inc increments by 1 by default', () => {
    const { count, inc } = useCounter(0)
    inc()
    expect(count()).toBe(1)
  })

  it('inc accepts a custom delta', () => {
    const { count, inc } = useCounter(0)
    inc(5)
    expect(count()).toBe(5)
  })

  it('dec decrements by 1 by default', () => {
    const { count, dec } = useCounter(3)
    dec()
    expect(count()).toBe(2)
  })

  it('dec accepts a custom delta', () => {
    const { count, dec } = useCounter(10)
    dec(4)
    expect(count()).toBe(6)
  })

  it('set assigns an absolute value', () => {
    const { count, set } = useCounter(0)
    set(42)
    expect(count()).toBe(42)
  })

  it('reset returns to the clamped initial value', () => {
    const { count, inc, reset } = useCounter(3)
    inc(10)
    expect(count()).toBe(13)
    reset()
    expect(count()).toBe(3)
  })

  it('clamps the initial value into [min, max]', () => {
    expect(useCounter(-5, { min: 0 }).count()).toBe(0)
    expect(useCounter(99, { max: 10 }).count()).toBe(10)
  })

  it('clamps inc to max', () => {
    const { count, inc } = useCounter(8, { max: 10 })
    inc(5)
    expect(count()).toBe(10)
  })

  it('clamps dec to min', () => {
    const { count, dec } = useCounter(2, { min: 0 })
    dec(5)
    expect(count()).toBe(0)
  })

  it('clamps set into bounds', () => {
    const { count, set } = useCounter(0, { min: 0, max: 10 })
    set(100)
    expect(count()).toBe(10)
    set(-100)
    expect(count()).toBe(0)
  })

  it('reset re-clamps against bounds', () => {
    const { count, set, reset } = useCounter(50, { min: 0, max: 10 })
    // initial 50 clamped to 10 at construction
    expect(count()).toBe(10)
    set(0)
    reset()
    expect(count()).toBe(10)
  })
})
