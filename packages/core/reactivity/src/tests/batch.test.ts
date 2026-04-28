import { batch, nextTick } from '../batch'
import { effect } from '../effect'
import { signal } from '../signal'

describe('batch', () => {
  test('defers notifications until end of batch', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    effect(() => {
      a()
      b()
      runs++
    })
    expect(runs).toBe(1) // initial run

    batch(() => {
      a.set(10)
      b.set(20)
    })
    // should only re-run once despite two updates
    expect(runs).toBe(2)
  })

  test('effect sees final values after batch', () => {
    const s = signal(0)
    let seen = 0
    effect(() => {
      seen = s()
    })
    batch(() => {
      s.set(1)
      s.set(2)
      s.set(3)
    })
    expect(seen).toBe(3)
  })

  test('nested batches flush at outermost end', () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      batch(() => {
        s.set(1)
        s.set(2)
      })
      s.set(3)
    })
    expect(runs).toBe(2)
  })

  test('batch propagates exceptions and still flushes', () => {
    const s = signal(0)
    let seen = 0
    effect(() => {
      seen = s()
    })
    expect(seen).toBe(0)

    expect(() => {
      batch(() => {
        s.set(42)
        throw new Error('boom')
      })
    }).toThrow('boom')

    // The batch should still have flushed notifications in the finally block
    expect(seen).toBe(42)
  })

  test('batch with no signal changes is a no-op', () => {
    let runs = 0
    const s = signal(0)
    effect(() => {
      s()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      // no updates
    })
    expect(runs).toBe(1)
  })

  test('batch deduplicates same subscriber across multiple signals', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    effect(() => {
      a()
      b()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      a.set(10)
      b.set(20)
      a.set(100) // same signal updated again
    })
    // Effect should only run once despite 3 updates
    expect(runs).toBe(2)
  })

  test('notifications enqueued during flush land in alternate set', () => {
    const a = signal(0)
    const b = signal(0)
    const log: string[] = []

    effect(() => {
      const val = a()
      log.push(`a=${val}`)
      // When a changes, update b inside the effect (enqueue during flush)
      if (val > 0) b.set(val * 10)
    })
    effect(() => {
      log.push(`b=${b()}`)
    })

    batch(() => {
      a.set(1)
    })

    expect(log).toContain('a=1')
    expect(log).toContain('b=10')
  })

  test('nextTick resolves after microtasks flush', async () => {
    const s = signal(0)
    let seen = 0
    effect(() => {
      seen = s()
    })

    s.set(42)
    await nextTick()
    expect(seen).toBe(42)
  })
})

// ─── Regression: cascade-depth-asymmetry double-fire ─────────────────────────
//
// Pre-fix: batch flush used two pre-allocated Sets (setA, setB) swapped on
// each round. Cascade notifications enqueued during round 1 went to setB and
// were processed in round 2. When a single subscriber had BOTH a 0-hop signal
// dependency AND a 1-hop indirection (computed, createSelector predicate,
// derived signal) and BOTH paths were triggered in the same batch, the
// subscriber was queued in DIFFERENT rounds — once via the direct enqueue
// (round 1) and once via the cascade (round 2). Cross-round Set-dedup didn't
// work because each round used a fresh Set; the subscriber fired twice.
//
// In real usage: list rendering with N items each tracking `isSelected(item.id)`
// plus a shared signal — every batched selection change scaled to O(N)
// wasted re-runs.
//
// Post-fix: single-Set iteration with cascade-during-iteration. Set-dedup
// handles ALL cases (diamond, multi-dep selector, self-modifying effect)
// uniformly — adding an entry already in the Set is a no-op; adding a new
// entry during iteration is visited exactly once.
describe('batch — cascade-depth-asymmetry dedup (regression)', () => {
  test('subscriber with 0-hop + 1-hop deps both written in batch fires once', async () => {
    const { computed } = await import('../computed')
    const source = signal(1)
    const other = signal(0)
    // 1-hop indirection via a computed (mirrors createSelector's predicate shape)
    const isTarget = computed(() => Object.is(source(), 2), { equals: (a, b) => a === b })

    let runs = 0
    effect(() => {
      isTarget()
      other()
      runs++
    })
    runs = 0

    batch(() => {
      source.set(2)
      other.set(1)
    })

    expect(runs).toBe(1)
  })

  test('diamond cascade still dedupes correctly (a → b, c → d → effect)', async () => {
    const { computed } = await import('../computed')
    const a = signal(0)
    const b = computed(() => a() * 2)
    const c = computed(() => a() + 1)
    const d = computed(() => b() + c())

    let runs = 0
    effect(() => {
      d()
      runs++
    })
    runs = 0

    a.set(5)
    expect(runs).toBe(1)
  })

  // Scale-up of Test 1: 50 list items each tracking the SAME 1-hop indirection
  // (`isTarget` memo) + the same shared signal. This is the real-world list-
  // rendering shape that motivated the fix. Pre-fix: each effect fired 2× →
  // 100 total runs per click. Post-fix: 50 (one per item).
  test('many list-item subscribers all sharing one indirection + shared signal — all fire once', async () => {
    const { computed } = await import('../computed')
    const selectedId = signal(1)
    const other = signal(0)
    const isTarget = computed(() => Object.is(selectedId(), 2), { equals: (a, b) => a === b })

    const counts: number[] = []
    for (let i = 0; i < 50; i++) {
      const idx = i
      counts.push(0)
      effect(() => {
        isTarget()
        other()
        counts[idx]!++
      })
    }
    counts.fill(0)

    batch(() => {
      selectedId.set(2)
      other.set(1)
    })

    const totalRuns = counts.reduce((a, b) => a + b, 0)
    expect(totalRuns).toBe(50)
  })
})
