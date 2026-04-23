/**
 * Per-counter behavioural tests for the @pyreon/reactivity layer.
 *
 * For each counter, we drive the API through a controlled scenario and
 * assert the exact increment. This proves the counter fires in the right
 * place AND doesn't over- or under-fire. Today the broader test suite
 * only had this for `styler.resolve`; we caught a real bug in
 * `runtime.mountFor.lisOps` when we went to write these (counter was on
 * only ONE of the two LIS paths).
 *
 * Each test uses `perfHarness.record(label, fn)` which guarantees
 * counter isolation — the snapshot reflects only what fn() did.
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

describe('reactivity.signalCreate', () => {
  it('fires once per signal() call', async () => {
    const outcome = await perfHarness.record('create-3-signals', () => {
      signal(0)
      signal('a')
      signal({})
    })
    expect(outcome.after['reactivity.signalCreate']).toBe(3)
  })
})

describe('reactivity.signalWrite', () => {
  it('fires for real writes and skips no-op writes via Object.is', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('writes', () => {
      s.set(1) // fires
      s.set(1) // skipped — same value
      s.set(2) // fires
      s.update((n) => n + 1) // fires (3)
      s.update((n) => n) // skipped — same value
    })
    expect(outcome.after['reactivity.signalWrite']).toBe(3)
  })
})

describe('reactivity.effectRun', () => {
  it('counts initial run + each reactive re-run', async () => {
    const s = signal(0)
    const outcome = await perfHarness.record('effect-runs', () => {
      const e = effect(() => {
        // biome-ignore lint/suspicious/noExplicitAny: reading the signal under tracking
        s()
      })
      s.set(1)
      s.set(2)
      s.set(3)
      e.dispose()
    })
    // 1 (initial) + 3 (writes) = 4
    expect(outcome.after['reactivity.effectRun']).toBe(4)
  })
})

describe('reactivity.computedRecompute', () => {
  it('fires on first read and on each invalidated read (lazy computed)', async () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    const outcome = await perfHarness.record('computed', () => {
      // 1st read: dirty → recompute (fire 1)
      expect(c()).toBe(2)
      // 2nd read: clean → no recompute
      expect(c()).toBe(2)
      // write invalidates
      s.set(5)
      // next read: dirty → recompute (fire 2)
      expect(c()).toBe(10)
    })
    expect(outcome.after['reactivity.computedRecompute']).toBe(2)
  })

  it('fires eagerly for equals-computed on each dependency change', async () => {
    const s = signal(1)
    const c = computed(() => s() * 2, { equals: (a, b) => a === b })
    const outcome = await perfHarness.record('eager-computed', () => {
      c() // 1st read → recompute
      s.set(2) // invalidates → eager recompute
      s.set(3) // invalidates → eager recompute
      c() // read, already clean — no extra recompute
    })
    // With eager evaluation: 1 (read) + 2 (invalidations) = 3
    expect(outcome.after['reactivity.computedRecompute']).toBe(3)
  })
})
