/**
 * Regressions for bugs the differential fuzz found on the core while the
 * contract suite was written (present on `main` before and after #4240):
 *
 *  - B1 a lost update: an effect re-queued between two effect passes was
 *    parked in the next-pass queue after its promotion and never ran;
 *  - B2 an extra run: the reader whose pull re-evaluated a changed computed was
 *    re-queued for the value it was reading;
 *  - B3 a leaked inner effect: a run re-entered by its own write lost the
 *    nested run's inner effects (and cleanups) to the enclosing run.
 *
 * The fuzz asserts the matching metrics are zero (`REACTIVITY_FUZZ_STRICT`,
 * on by default). Public API only.
 */
import { computed, effect, effectScope, onCleanup, signal } from '../../index'
import { captureErrors } from './_helpers'

describe('B1 — an effect re-queued from a tier-1 refresh after its pass is dropped (lost update)', () => {
  // Effect E runs in pass 1; effect W, later in the same pass, writes `o`,
  // which re-dirties the computed E reads. The computed is refreshed in tier 1
  // AFTER the pass, re-queues E for the NEXT pass (E already ran in this one),
  // and the drain loop exits because the current-pass queue is empty: E is
  // stranded on the old value until something else changes. Violates C2/C3
  // (effects see settled values) and C9 (cross-pass re-run).
  test('B1: the reader of a computed re-dirtied by a later effect in the same pass sees the final value', () => {
    const s = signal(0)
    const o = signal(0)
    const c = computed(() => s() + o())
    const seen: number[] = []
    effect(() => {
      s()
      seen.push(c())
    })
    effect(() => {
      o.set(s() * 10)
    })
    s.set(1)
    expect(c()).toBe(11)
    expect(seen.at(-1)).toBe(11) // today: 1
  })
})

describe('B2 — the first read of a stale computed re-queues the reader (extra run)', () => {
  // A computed that changed while nobody observed it is evaluated on the
  // effect's first read of it; the effect subscribes BEFORE the evaluation,
  // so the computed's change notification re-queues the effect that is
  // reading it. The effect runs twice for one change (C1/C2: once).
  test('B2: an effect that starts reading a stale computed runs once for the write that made it read it', () => {
    const s = signal(0)
    const c = computed(() => s() * 2)
    expect(c()).toBe(0)
    const flag = signal(false)
    let runs = 0
    effect(() => {
      runs++
      if (flag()) c()
    })
    s.set(1) // c is stale, unobserved
    flag.set(true)
    expect(runs).toBe(2) // today: 3
  })

  test('B2: an effect created over a stale computed runs once at creation', () => {
    const s = signal(0)
    const c = computed(() => s() * 2)
    expect(c()).toBe(0)
    s.set(1)
    let runs = 0
    effect(() => {
      runs++
      c()
    })
    expect(runs).toBe(1) // today: 2
  })
})

describe('B3 — the nested duplicate first run (B2) leaks an inner effect', () => {
  // The duplicate run happens NESTED inside the first run; both create an
  // inner effect, and the outer keeps only the second one's list, so the
  // first inner effect is never disposed — not on re-run, not on scope.stop().
  // Violates C12 (inner effects are owned and disposed).
  test('B3: scope.stop() disposes every inner effect', () => {
    const s = signal(0)
    const t = signal(0)
    const c = computed(() => s())
    c()
    s.set(1) // c is stale, unobserved
    const scope = effectScope()
    scope.runInScope(() =>
      effect(() => {
        c()
        effect(() => {
          t()
        })
      }),
    )
    scope.stop()
    expect(t.debug().subscriberCount).toBe(0) // today: 1
  })
})

describe("B3 — a run re-entered by its own write keeps the nested run's inner effects and cleanups", () => {
  // Independent of B2: the first run writes a signal it read, so the effect
  // re-runs NESTED inside its first run (today's order; design D9 changes it).
  test('B3: every inner effect and cleanup of both runs is disposed by scope.stop()', () => {
    const s = signal(0)
    const t = signal(0)
    const log: string[] = []
    const scope = effectScope()
    scope.runInScope(() =>
      effect(() => {
        const v = s()
        effect(() => {
          t()
        })
        onCleanup(() => log.push(`cleanup${v}`))
        if (v === 0) s.set(1)
        return () => log.push(`ret${v}`)
      }),
    )
    expect(t.debug().subscriberCount).toBe(2)
    scope.stop()
    expect(t.debug().subscriberCount).toBe(0)
    expect(log.sort()).toEqual(['cleanup0', 'cleanup1', 'ret0', 'ret1'])
  })
})

describe('C11/C10 — onCleanup registered before a throw in the same run still runs', () => {
  test('C11: the cleanup runs before the next run and on dispose', () => {
    const cap = captureErrors()
    try {
      const s = signal(0)
      const log: string[] = []
      const e = effect(() => {
        const v = s()
        onCleanup(() => log.push(`c${v}`))
        if (v === 1) throw new Error('after onCleanup')
      })
      s.set(1) // run 1 registers c1, then throws
      s.set(2)
      expect(log).toEqual(['c0', 'c1'])
      e.dispose()
      expect(log).toEqual(['c0', 'c1', 'c2'])
      expect(cap.errors).toHaveLength(1)
    } finally {
      cap.restore()
    }
  })
})

describe('B2 boundary — a reader that already read the computed earlier in the run still re-runs', () => {
  // Only the FIRST read of a changed computed in a run is the value the reader
  // is about to use; an earlier read saw the old value, so the run is stale.
  test('B2: read c, write its source, read c again → one more run with the new value', () => {
    const s = signal(0)
    const c = computed(() => s() * 10)
    const seen: Array<[number, number]> = []
    let writes = 0
    effect(() => {
      const before = c()
      // `s` itself is NOT read here, so only the computed can re-queue the run.
      if (before === 10 && writes === 0) {
        writes++
        s.set(2)
      }
      seen.push([before, c()])
    })
    s.set(1)
    expect(seen.at(-1)).toEqual([20, 20])
    expect(seen.length).toBe(3)
  })
})

describe('B3 — chained returned cleanups of a re-entered run', () => {
  test('B3: a throwing first cleanup is reported and the second still runs', () => {
    const cap = captureErrors()
    try {
      const s = signal(0)
      const log: string[] = []
      const e = effect(() => {
        const v = s()
        if (v === 0) s.set(1)
        return () => {
          log.push(`ret${v}`)
          if (v === 1) throw new Error('nested cleanup')
        }
      })
      e.dispose()
      expect(log.sort()).toEqual(['ret0', 'ret1'])
      expect(cap.errors).toHaveLength(1)
    } finally {
      cap.restore()
    }
  })
})

describe('B2 — fan-out shapes', () => {
  test("B2: the reader is skipped, the computed's other subscribers are still notified", () => {
    for (const others of [1, 2]) {
      const s = signal(0)
      const c = computed(() => s() * 2)
      expect(c()).toBe(0) // evaluated once, so a later change is a real change
      const otherRuns = Array.from({ length: others }, () => 0)
      const flag = signal(false)
      let runs = 0
      effect(() => {
        runs++
        if (flag()) c()
      })
      s.set(1) // c is stale: nobody reads it yet
      for (let k = 0; k < others; k++)
        effect(() => {
          if (flag()) {
            c()
            otherRuns[k]!++
          }
        })
      flag.set(true)
      expect(runs).toBe(2)
      expect(otherRuns).toEqual(otherRuns.map(() => 1))
      s.set(2)
      expect(runs).toBe(3)
      expect(otherRuns).toEqual(otherRuns.map(() => 2))
    }
  })
})
