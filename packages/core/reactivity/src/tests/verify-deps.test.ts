/**
 * Verify-mode dep reuse (versioned dep tracking adapted to Pyreon's
 * array/Set architecture — see tracking.ts `runVerify` docs).
 *
 * Steady-state re-runs of effects/computeds no longer tear down + rebuild
 * their dep subscriptions; they VERIFY the previous run's dep list
 * positionally. These tests lock:
 *
 *  1. Steady-state correctness — same deps re-fire across many runs.
 *  2. Divergence — a branch flip unsubscribes the stale dep + subscribes
 *     the new one (the stale signal must NOT re-fire the effect).
 *  3. Shrink — a run that reads FEWER deps unsubscribes the tail.
 *  4. Duplicate-read aliasing — the shrink/divergence tail-delete must not
 *     strip a confirmed prefix position that aliases the same Set.
 *  5. Reorder — a read-order change keeps BOTH deps live.
 *  6. computedLazy exactness — a re-evaluated lazy computed drops deps from
 *     branches it no longer reads (the pre-verify skip-mode path left them
 *     subscribed forever) and records newly-read deps so dispose() removes
 *     them.
 *  7. Regression (pre-existing bug, fixed by the frame refactor): a NESTED
 *     effect() creation no longer clobbers the outer effect's onCleanup
 *     collection window.
 *  8. Regression (pre-existing bug, fixed by the frame refactor): an effect
 *     that reads a signal AFTER triggering a dirty computed's FIRST
 *     evaluation still records that dep (the old trackWithLocalDeps nulled
 *     the collector instead of restoring the outer frame's).
 */
import { describe, expect, it } from 'vitest'

import { computed } from '../computed'
import { effect, onCleanup, setErrorHandler } from '../effect'
import { signal } from '../signal'

// Internal shape for white-box subscriber assertions.
interface HostInternals {
  _s: Set<() => void> | null
}
const subCount = (s: unknown): number => ((s as HostInternals)._s?.size ?? 0)

describe('verify-mode dep reuse — effects', () => {
  it('steady state: same deps re-fire across many re-runs', () => {
    const a = signal(0)
    const b = signal(10)
    let runs = 0
    let sum = -1
    const fx = effect(() => {
      runs++
      sum = a() + b()
    })
    for (let i = 1; i <= 20; i++) a.set(i)
    for (let i = 1; i <= 20; i++) b.set(10 + i)
    expect(runs).toBe(41)
    expect(sum).toBe(20 + 30)
    // Membership is stable — exactly one subscriber on each signal.
    expect(subCount(a)).toBe(1)
    expect(subCount(b)).toBe(1)
    fx.dispose()
    expect(subCount(a)).toBe(0)
    expect(subCount(b)).toBe(0)
  })

  it('divergence: branch flip unsubscribes the stale dep and tracks the new one', () => {
    const cond = signal(true)
    const a = signal('a')
    const b = signal('b')
    let runs = 0
    let seen = ''
    const fx = effect(() => {
      runs++
      seen = cond() ? a() : b()
    })
    expect(runs).toBe(1)
    expect(seen).toBe('a')

    cond.set(false) // diverges at position 1 (a → b)
    expect(runs).toBe(2)
    expect(seen).toBe('b')
    // Stale dep `a` must be unsubscribed — writing it must NOT re-run.
    expect(subCount(a)).toBe(0)
    a.set('a2')
    expect(runs).toBe(2)
    // New dep `b` is live.
    b.set('b2')
    expect(runs).toBe(3)
    expect(seen).toBe('b2')

    // Flip back — the reverse divergence.
    cond.set(true)
    expect(seen).toBe('a2')
    expect(subCount(b)).toBe(0)
    b.set('b3')
    expect(runs).toBe(4) // unchanged by b
    a.set('a3')
    expect(seen).toBe('a3')
    fx.dispose()
  })

  it('shrink: a run that reads fewer deps unsubscribes the tail', () => {
    const gate = signal(true)
    const extra = signal(0)
    let runs = 0
    const fx = effect(() => {
      runs++
      if (gate()) extra()
    })
    expect(subCount(extra)).toBe(1)
    gate.set(false) // this run reads ONLY gate — tail (extra) must go
    expect(runs).toBe(2)
    expect(subCount(extra)).toBe(0)
    extra.set(1)
    expect(runs).toBe(2)
    fx.dispose()
  })

  it('duplicate-read aliasing: shrinking from a duplicated dep keeps the confirmed read live', () => {
    const twice = signal(true)
    const a = signal(1)
    let runs = 0
    let sum = 0
    const fx = effect(() => {
      runs++
      // First run reads `a` TWICE → deps = [gate._s, a._s, a._s].
      // After the flip, `a` is read ONCE → the tail delete removes the
      // aliased Set; the prefix repair must re-add the owner or `a` would
      // silently stop firing this effect.
      sum = twice() ? a() + a() : a()
    })
    expect(sum).toBe(2)
    twice.set(false)
    expect(runs).toBe(2)
    expect(sum).toBe(1)
    // `a` must still be subscribed (read at a confirmed position).
    expect(subCount(a)).toBe(1)
    a.set(5)
    expect(runs).toBe(3)
    expect(sum).toBe(5)
    fx.dispose()
  })

  it('reorder: a read-order change keeps both deps live', () => {
    const flip = signal(false)
    const a = signal(1)
    const b = signal(100)
    let value = 0
    const fx = effect(() => {
      // Order flips between [a, b] and [b, a] — positional verify diverges
      // at index 1; both must stay subscribed.
      value = flip() ? b() - a() : a() - b()
    })
    expect(value).toBe(1 - 100)
    flip.set(true)
    expect(value).toBe(100 - 1)
    a.set(2)
    expect(value).toBe(100 - 2)
    b.set(200)
    expect(value).toBe(200 - 2)
    expect(subCount(a)).toBe(1)
    expect(subCount(b)).toBe(1)
    fx.dispose()
    expect(subCount(a)).toBe(0)
    expect(subCount(b)).toBe(0)
  })

  it('growth: a run that reads MORE deps subscribes the new tail', () => {
    const more = signal(false)
    const a = signal(1)
    const b = signal(2)
    let sum = 0
    const fx = effect(() => {
      sum = more() ? a() + b() : a()
    })
    expect(subCount(b)).toBe(0)
    more.set(true)
    expect(sum).toBe(3)
    b.set(10)
    expect(sum).toBe(11)
    fx.dispose()
    expect(subCount(a)).toBe(0)
    expect(subCount(b)).toBe(0)
  })
})

describe('verify-mode dep reuse — computeds', () => {
  it('lazy computed: stale branch deps are unsubscribed on re-eval (exact dep list)', () => {
    const cond = signal(true)
    const a = signal('a')
    const b = signal('b')
    const c = computed(() => (cond() ? a() : b()))
    expect(c()).toBe('a')
    expect(subCount(a)).toBe(1)
    expect(subCount(b)).toBe(0)

    cond.set(false)
    expect(c()).toBe('b')
    // The pre-verify skip-mode path left `a` subscribed forever here.
    expect(subCount(a)).toBe(0)
    expect(subCount(b)).toBe(1)
  })

  it('lazy computed: deps read only on a LATER eval are removed by dispose()', () => {
    const cond = signal(true)
    const a = signal('a')
    const b = signal('b')
    const c = computed(() => (cond() ? a() : b()))
    expect(c()).toBe('a')
    cond.set(false)
    expect(c()).toBe('b')
    // `b` was first read on the SECOND eval — the old skip-mode path
    // subscribed it without recording it, so dispose() leaked the
    // subscription. Verify mode records it.
    c.dispose()
    expect(subCount(b)).toBe(0)
    expect(subCount(cond)).toBe(0)
  })

  it('equals computed: steady-state re-evals keep exact deps and equality gating', () => {
    const a = signal(1)
    const b = signal(2)
    let notified = 0
    const c = computed(() => a() + b(), { equals: (p, n) => p === n })
    const fx = effect(() => {
      c()
      notified++
    })
    expect(notified).toBe(1)
    a.set(2) // 4 ≠ 3 → notify
    expect(notified).toBe(2)
    // Write that keeps the sum identical → equality gate suppresses.
    a.set(1)
    b.set(3)
    expect(c()).toBe(4)
    expect(subCount(a)).toBe(1)
    expect(subCount(b)).toBe(1)
    fx.dispose()
    c.dispose()
    expect(subCount(a)).toBe(0)
    expect(subCount(b)).toBe(0)
  })

  it('equals computed: a recompute after a THROWING first read collects deps', () => {
    // First read throws mid-eval (after subscribing to `a`) → `tracked`
    // stays false. The dep fire then routes through recompute's COLLECT
    // branch — the only reachable path where recompute runs untracked.
    const a = signal(1)
    let shouldThrow = true
    const swallowed: unknown[] = []
    setErrorHandler((err) => swallowed.push(err))
    try {
      const c = computed(
        () => {
          const v = a()
          if (shouldThrow) throw new Error('first eval fails')
          return v * 2
        },
        { equals: (p, n) => p === n },
      )
      expect(c()).toBe(undefined) // throwing first read → handled → undefined
      expect(swallowed.length).toBe(1)
      shouldThrow = false
      a.set(5) // fires recompute → collect (tracked=false)
      expect(c()).toBe(10)
      a.set(6) // steady state → verify branch
      expect(c()).toBe(12)
      c.dispose()
    } finally {
      setErrorHandler(() => {})
      setErrorHandler(undefined as unknown as (err: unknown) => void)
    }
  })

  it('effect reading a computed diamond stays correct across many updates', () => {
    const a = signal(0)
    const b = computed(() => a() * 2)
    const c = computed(() => a() * 3)
    const d = computed(() => b() + c())
    const seen: number[] = []
    const fx = effect(() => {
      seen.push(d())
    })
    for (let i = 1; i <= 5; i++) a.set(i)
    expect(seen).toEqual([0, 5, 10, 15, 20, 25])
    fx.dispose()
  })
})

describe('frame-restore regressions (pre-existing bugs fixed by the refactor)', () => {
  it('nested effect() creation does not clobber the outer onCleanup window', () => {
    const s = signal(0)
    let outerCleanups = 0
    let inner: { dispose(): void } | null = null
    const fx = effect(() => {
      s()
      // Creating a nested effect used to NULL the module-level cleanup
      // collector on its run's exit — any onCleanup() registered by the
      // OUTER effect after this line was silently dropped.
      inner = effect(() => {})
      onCleanup(() => {
        outerCleanups++
      })
    })
    expect(outerCleanups).toBe(0)
    s.set(1) // re-run → previous run's cleanup must fire
    expect(outerCleanups).toBe(1)
    fx.dispose()
    expect(outerCleanups).toBe(2)
    expect(inner).not.toBeNull()
  })

  it('a dep read AFTER a dirty computed’s first eval is recorded (dispose removes it)', () => {
    const a = signal(1)
    const tail = signal(10)
    const c = computed(() => a() * 2)
    let sum = 0
    const fx = effect(() => {
      // `c` is dirty + untracked here → its FIRST eval runs inside this
      // effect's run. The old trackWithLocalDeps set the collector to null
      // on exit, so the `tail()` read below was subscribed but NEVER
      // recorded — dispose() couldn't remove it (retained subscription).
      sum = c() + tail()
    })
    expect(sum).toBe(12)
    // Dispose WITHOUT any intervening re-run — the old bug self-healed on
    // the first leaked-dep-triggered re-run (the second run had no nested
    // first-eval, so the read was recorded then), which would mask it here.
    fx.dispose()
    // The load-bearing assertion: the effect's subscription to `tail` is
    // fully removed on dispose.
    expect(subCount(tail)).toBe(0)
    tail.set(30)
    expect(sum).toBe(12)
  })
})
