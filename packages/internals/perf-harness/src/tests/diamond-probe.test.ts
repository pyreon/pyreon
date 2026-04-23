// @vitest-environment happy-dom
/**
 * Diamond-dependency probe.
 *
 * Classic reactive-system bug shape:
 *
 *   a → b, c → d
 *
 * If the scheduler is naïve, writing `a` notifies both `b` and `c`,
 * each of which notifies `d` — so `d` recomputes twice per `a` write.
 * A correct implementation collapses to one `d` recompute per write
 * regardless of how many paths lead there.
 *
 * This probe caught a real scheduler bug:
 * - Before the fix: unbatched writes re-fired the apex effect TWICE per
 *   write because `notifySubscribers` was synchronous and the cascade
 *   ran inline. See REGRESSION TEST comment below for the trace.
 * - Fix (same PR): `signal._set` auto-batches its notification chain,
 *   and `batch()`'s flush loop keeps batching active so
 *   cascade-notifications enqueue through the pending Set (which
 *   dedupes them) rather than fire inline.
 */
import { batch, computed, effect, signal } from '@pyreon/reactivity'
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

describe('diamond dependency — no double recompute', () => {
  it('one write → terminal computed recomputes exactly once per invalidation', async () => {
    const a = signal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() + 10)
    const d = computed(() => b() + c())

    // Prime: 1 read of d → 3 computeds recompute (d → b, c; b → a; c → a)
    d()
    const after1stRead = perfHarness.snapshot()['reactivity.computedRecompute'] ?? 0

    // Now write a — expect d, b, c to each recompute AT MOST once on next d() read
    a.set(2)
    d()
    const after2ndRead = perfHarness.snapshot()['reactivity.computedRecompute'] ?? 0
    const recomputedCount = after2ndRead - after1stRead

    // The upper bound: b, c, d each recompute exactly once. So 3 new recomputes.
    // If the scheduler were buggy and d ran twice, it'd be 4+.
    expect(
      recomputedCount,
      `one signal write caused ${recomputedCount} computed recomputes; expected ≤ 3 (b, c, d each once)`,
    ).toBeLessThanOrEqual(3)
  })

  /**
   * REGRESSION TEST — was `toBe(7)` before the scheduler fix.
   *
   * Pre-fix: writing to a signal OUTSIDE `batch()` re-fired an apex
   * effect TWICE per write in a diamond dependency because
   * `notifySubscribers` was synchronous and the cascade ran inline:
   *   1. a.set → a's subs (b.recompute, c.recompute) called inline
   *   2. b.recompute → marks b dirty → notifies d.recompute inline
   *   3. d.recompute → marks d dirty → notifies effect inline
   *   4. effect re-runs → reads d() which runs d.fn, reading b() + c()
   *      — d.fn's reads CLEAR b, c, d dirty flags as side effect
   *   5. back to step 1's loop: c.recompute runs, sees c clean, marks
   *      dirty, notifies d.recompute
   *   6. d.recompute sees d clean (cleared in step 4), marks dirty,
   *      notifies effect → effect fires AGAIN
   *
   * Fix shipped in the same PR: `signal._set` wraps the notify chain
   * in `batch()`, and `batch()`'s flush loop keeps `batchDepth ≥ 1`
   * during flush so cascade-notifications route through the pending
   * Set (which dedupes them) rather than firing inline.
   *
   * Caught by this probe. Without the rig, this bug would have kept
   * silently costing 2× effect runs for every diamond-shaped dep graph.
   */
  it('effect fires ONCE per diamond write (regression test for scheduler fix)', async () => {
    const a = signal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() + 10)
    const d = computed(() => b() + c())

    const outcome = await perfHarness.record('diamond-effect', () => {
      effect(() => {
        d()
      })
      a.set(2)
      a.set(3)
      a.set(4)
    })
    // 1 initial + 3 writes = 4. Was 7 before the fix (each write re-fired
    // the apex effect twice because of inline cascade notifications).
    expect(outcome.after['reactivity.effectRun']).toBe(4)
  })

  it('same diamond shape inside batch() — equivalent count to auto-batched writes', async () => {
    const a = signal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() + 10)
    const d = computed(() => b() + c())

    const outcome = await perfHarness.record('diamond-effect-batched', () => {
      effect(() => {
        d()
      })
      batch(() => {
        a.set(2)
      })
      batch(() => {
        a.set(3)
      })
      batch(() => {
        a.set(4)
      })
    })
    expect(outcome.after['reactivity.effectRun']).toBe(4)
  })
})
