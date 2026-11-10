/**
 * KNOWN BUGS on today's core, found by `differential-fuzz.test.ts` while this
 * suite was written (present on `main` before and after #4240).
 *
 * Each is written as the CORRECT behaviour inside `test.fails`, so the file
 * passes while the bug exists and turns red the moment a change fixes it:
 * then replace `test.fails` with `test` and set REACTIVITY_FUZZ_STRICT=1 as the
 * fuzz default. The fuzz counts each class as a metric
 * (`staleAfterEffectWrite`, `extraEffectRuns`, `leakAfterExtraRun`).
 *
 * Public API only.
 */
import { computed, effect, effectScope, signal } from '../../index'

describe('B1 — an effect re-queued from a tier-1 refresh after its pass is dropped (lost update)', () => {
  // Effect E runs in pass 1; effect W, later in the same pass, writes `o`,
  // which re-dirties the computed E reads. The computed is refreshed in tier 1
  // AFTER the pass, re-queues E for the NEXT pass (E already ran in this one),
  // and the drain loop exits because the current-pass queue is empty: E is
  // stranded on the old value until something else changes. Violates C2/C3
  // (effects see settled values) and C9 (cross-pass re-run).
  test.fails('B1: the reader of a computed re-dirtied by a later effect in the same pass sees the final value', () => {
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
  test.fails('B2: an effect that starts reading a stale computed runs once for the write that made it read it', () => {
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

  test.fails('B2: an effect created over a stale computed runs once at creation', () => {
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
  test.fails('B3: scope.stop() disposes every inner effect', () => {
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
