// @vitest-environment happy-dom
/**
 * `computed(fn, { equals })` skip-downstream probe.
 *
 * Contract: when `equals(prev, next)` returns true, the computed's value
 * is considered unchanged and downstream subscribers (other computeds,
 * effects) must NOT be notified.
 *
 * This is the primitive behind "structural sharing" style optimizations
 * — expensive re-derivations can return a new object with the same
 * shape, and the equals check prevents the downstream cascade.
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

describe('equality-computed downstream skip', () => {
  it('equals returns true → downstream effect does NOT re-run', async () => {
    const s = signal(0)
    // Derived value: always returns constant 42 regardless of s. equals=true
    // so any write to s that doesn't change the derived value should skip
    // downstream notifications.
    const c = computed(() => (s() * 0) + 42, { equals: (a, b) => a === b })

    const outcome = await perfHarness.record('equals-skip', () => {
      effect(() => {
        c()
      })
      s.set(1)
      s.set(2)
      s.set(3)
    })
    // 1 initial effect run, then s writes invalidate c, but c's value is
    // still 42 (equals returns true) — no downstream notify. Total: 1.
    expect(outcome.after['reactivity.effectRun']).toBe(1)
  })

  it('equals returns false → downstream effect DOES re-run', async () => {
    const s = signal(0)
    const c = computed(() => s() * 2, { equals: (a, b) => a === b })

    const outcome = await perfHarness.record('equals-nodiff', () => {
      effect(() => {
        c()
      })
      s.set(1) // c: 0 → 2, equals false → notify
      s.set(2) // c: 2 → 4, equals false → notify
      s.set(3) // c: 4 → 6, equals false → notify
    })
    expect(outcome.after['reactivity.effectRun']).toBe(4) // 1 initial + 3
  })

  it('structural-equals works on object shapes', async () => {
    const s = signal({ id: 1, name: 'a' })
    const c = computed(() => ({ id: s().id }), {
      equals: (a, b) => a.id === b.id,
    })

    const outcome = await perfHarness.record('struct-equals', () => {
      effect(() => {
        c()
      })
      s.set({ id: 1, name: 'b' }) // id unchanged, equals true → skip
      s.set({ id: 1, name: 'c' }) // id unchanged, equals true → skip
      s.set({ id: 2, name: 'd' }) // id changed, equals false → notify
    })
    // 1 initial + 1 for the id-change = 2
    expect(outcome.after['reactivity.effectRun']).toBe(2)
  })

  it('chained equality-computeds also short-circuit', async () => {
    const s = signal(0)
    const c1 = computed(() => s() % 2 === 0, { equals: (a, b) => a === b })
    const c2 = computed(() => (c1() ? 'even' : 'odd'), { equals: (a, b) => a === b })

    const outcome = await perfHarness.record('chain-equals', () => {
      effect(() => {
        c2()
      })
      s.set(2) // c1: true→true (equals) → c2 unchanged → skip
      s.set(4) // c1: true→true (equals) → c2 unchanged → skip
      s.set(6) // c1: true→true (equals) → c2 unchanged → skip
      s.set(1) // c1: true→false → c2: 'even'→'odd' → notify
    })
    // 1 initial + 1 for the even→odd flip = 2
    expect(outcome.after['reactivity.effectRun']).toBe(2)
  })
})
