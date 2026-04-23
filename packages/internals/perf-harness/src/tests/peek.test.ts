// @vitest-environment happy-dom
/**
 * `peek()` correctness probe. peek() is the escape hatch that reads a
 * signal's value WITHOUT tracking the dependency. Used when a caller
 * wants the current value but doesn't want to re-run on change.
 *
 * Contract: an effect that uses only `peek()` should fire its initial
 * run but not re-run when the peeked signal writes.
 */
import { computed, effect, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('signal.peek() does not track', () => {
  it('effect using only peek() fires once (initial) and never re-runs', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('peek-only', () => {
      effect(() => {
        s.peek()
      })
      s.set(1)
      s.set(2)
      s.set(3)
    })
    // 1 initial run, 0 re-runs
    expect(outcome.after['reactivity.effectRun']).toBe(1)
  })

  it('mixing peek() and read — only the read tracks', async () => {
    const tracked = signal(0)
    const peeked = signal(0)
    const outcome = await perfHarness.record('mix', () => {
      effect(() => {
        tracked()
        peeked.peek()
      })
      tracked.set(1) // triggers re-run
      peeked.set(1) // does NOT trigger
      peeked.set(2) // does NOT trigger
      tracked.set(2) // triggers re-run
    })
    expect(outcome.after['reactivity.effectRun']).toBe(3) // 1 initial + 2 tracked-writes
  })

  it('peek() does not subscribe the caller — signal subscriber count stays 0', () => {
    const s = signal(0)
    effect(() => {
      s.peek()
    })
    expect(s.debug().subscriberCount).toBe(0)
  })

  it('peek() returns the current value even mid-write chain', () => {
    const s = signal(10)
    s.set(20)
    expect(s.peek()).toBe(20)
    s.set(30)
    expect(s.peek()).toBe(30)
  })

  it('computed using peek() — recomputes only on its OTHER tracked reads', async () => {
    const tracked = signal(0)
    const peeked = signal(100)
    const c = computed(() => tracked() + peeked.peek())

    // First read primes computed with tracked=0, peeked=100 → 100
    expect(c()).toBe(100)

    const outcome = await perfHarness.record('computed-peek', () => {
      peeked.set(200) // NOT tracked — c is still clean, next read reuses cached value
      peeked.set(300)
      // c() read here should return the CACHED 100 (since tracked signal didn't fire)
    })
    // Zero computed recomputes — peek didn't invalidate c
    expect(outcome.after['reactivity.computedRecompute']).toBeFalsy()
    // Reading c still returns the value cached from tracked=0
    expect(c()).toBe(100)
  })
})
