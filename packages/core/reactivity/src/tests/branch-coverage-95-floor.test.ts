/**
 * Branch coverage to lift @pyreon/reactivity above MINIMUM_BRANCH_FLOOR=95.
 * Targets:
 *  - signal post-promotion first-subscriber dispose (line 228)
 *  - computed post-promotion direct-subscriber dispose (lines 202, 342)
 *  - prod-mode (NODE_ENV='production') false arms in computed/effect/signal
 *  - batch notify outside-of-batch arm (line 251 false arm)
 *
 * NO v8-ignore annotations.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { signal, computed, effect, batch, createSelector, renderEffect } from '../index'

// Internal probe — `computed`/`signal` expose `.direct()` for the lightest
// possible subscriber (no read). The Computed type does not advertise it in
// the public type, so cast narrowly.
type WithDirect = { direct(updater: () => void): () => void }
const probeDirect = <T>(thing: T): WithDirect => thing as unknown as WithDirect

// ─── signal post-promotion first-subscriber dispose (line 228) ──────────────

describe('signal — post-promotion first-subscriber dispose (line 228)', () => {
  it('disposing first subscriber AFTER 2nd-sub promotion goes through Set.delete', () => {
    const s = signal(0)
    // subscriber 1 → installs into _d1 (inline slot)
    let fired1 = 0
    const dispose1 = probeDirect(s).direct(() => {
      fired1 += 1
    })
    // subscriber 2 → promotes _d1 to _d Set, then adds itself
    let fired2 = 0
    const dispose2 = probeDirect(s).direct(() => {
      fired2 += 1
    })
    // Now _d is a Set containing both. Dispose 1 → hits `else if (self._d) self._d.delete(updater)`.
    dispose1()
    s.set(7)
    expect(fired2).toBeGreaterThan(0)
    const after = fired1
    s.set(8)
    expect(fired1).toBe(after) // sub 1 detached
    dispose2()
  })

  it('idempotent dispose: calling disposer twice on lone subscriber falls through both arms (line 228 falsy)', () => {
    // Subscribe ONLY ONE subscriber, then dispose it twice.
    // First dispose: _d1 === updater → set _d1 = null
    // Second dispose: _d1 === updater? null === updater → false. _d is null → else-if falsy arm.
    const s = signal(0)
    let fired = 0
    const dispose = probeDirect(s).direct(() => {
      fired += 1
    })
    s.set(1) // sub fires
    const initialFire = fired
    dispose()
    dispose() // second call — exercises the line 228 else-if falsy arm
    s.set(2)
    expect(fired).toBe(initialFire) // sub fully detached
  })
})

describe('computed — post-promotion direct-subscriber dispose (lines 202, 342)', () => {
  it('idempotent dispose: calling disposer twice on lone subscriber falls through both arms (line 202 falsy)', () => {
    const src = signal(1)
    const c = computed(() => src() * 2)
    expect(c()).toBe(2)
    let fired = 0
    const dispose = probeDirect(c).direct(() => {
      fired += 1
    })
    src.set(3)
    expect(c()).toBe(6)
    const initial = fired
    dispose()
    dispose() // second call — exercises line 202 / 342 else-if falsy arm
    src.set(4)
    expect(c()).toBe(8)
    expect(fired).toBe(initial) // disposed
  })

  it('disposing first direct subscriber AFTER 2nd promotion uses directFns.delete', () => {
    const src = signal(1)
    const c = computed(() => src() * 2)
    expect(c()).toBe(2)
    // 1st subscriber via .direct → directFn1
    let fired1 = 0
    const dispose1 = probeDirect(c).direct(() => {
      fired1 += 1
    })
    // 2nd subscriber → promotes directFn1 → directFns Set
    let fired2 = 0
    const dispose2 = probeDirect(c).direct(() => {
      fired2 += 1
    })
    // Dispose 1 after promotion → reaches `else if (directFns)` arm.
    dispose1()
    src.set(5)
    expect(c()).toBe(10)
    expect(fired2).toBeGreaterThan(0)
    const after = fired1
    src.set(7)
    expect(c()).toBe(14)
    expect(fired1).toBe(after)
    dispose2()
  })
})

// ─── Production-mode (NODE_ENV='production') arms ────────────────────────────

describe('reactivity in NODE_ENV=production — devtools-gate false arms', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('confirms NODE_ENV mutation visible at runtime', () => {
    expect(process.env.NODE_ENV).toBe('production')
  })

  it('signal creates without counter/devtools side effects in prod', () => {
    expect(process.env.NODE_ENV).toBe('production')
    const s = signal(0)
    s.set(1)
    expect(s()).toBe(1)
  })

  it('computed creates + recomputes without dev counters in prod', () => {
    const src = signal(2)
    const c = computed(() => src() * 3)
    expect(c()).toBe(6)
    src.set(4)
    expect(c()).toBe(12)
  })

  it('computed with explicit equals (computedWithEquals path) in prod (lines 268, 292, 358 false arms)', () => {
    const src = signal({ v: 1 })
    const c = computed(() => ({ v: src().v * 2 }), {
      equals: (a, b) => a.v === b.v, // explicit equals → computedWithEquals path
    })
    expect(c().v).toBe(2)
    src.set({ v: 5 })
    expect(c().v).toBe(10)
    // Force a recompute via subscriber + change
    let fired = 0
    const dispose = probeDirect(c).direct(() => {
      fired += 1
    })
    src.set({ v: 7 })
    expect(c().v).toBe(14)
    expect(fired).toBeGreaterThan(0)
    dispose()
  })

  it('computed with equals — no-fire on equal result (line 275 equals-true arm)', () => {
    const src = signal(2)
    let invocations = 0
    const c = computed(
      () => {
        invocations += 1
        return Math.floor(src() / 2)
      },
      { equals: (a, b) => a === b },
    )
    expect(c()).toBe(1) // floor(2/2)
    src.set(3) // floor(3/2) = 1 → equals, no notify
    expect(c()).toBe(1)
    src.set(4) // floor(4/2) = 2 → different
    expect(c()).toBe(2)
    expect(invocations).toBeGreaterThanOrEqual(3)
  })

  it('effect runs without dev counters in prod', () => {
    const src = signal(0)
    const seen: number[] = []
    const e = effect(() => {
      seen.push(src())
    })
    src.set(1)
    src.set(2)
    expect(seen).toEqual([0, 1, 2])
    e.dispose()
  })

  it('batched effects flush correctly in prod (no MAX_PASSES warn path)', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    const e = effect(() => {
      runs += 1
      a()
      b()
    })
    runs = 0
    batch(() => {
      a.set(1)
      b.set(2)
    })
    expect(runs).toBe(1)
    e.dispose()
  })

  it('computed eager recompute via direct subscriber in prod', () => {
    const src = signal(10)
    const c = computed(() => src() + 1)
    // Force initial materialization so the computed registers as a
    // dependency on src. Direct-only subscribe without a read doesn't
    // wire up the cascade.
    expect(c()).toBe(11)
    let fired = 0
    const dispose = probeDirect(c).direct(() => {
      fired += 1
    })
    src.set(20)
    expect(c()).toBe(21)
    expect(fired).toBeGreaterThan(0)
    dispose()
  })

  it('signal direct subscriber fires in prod (no devtools fire-recording)', () => {
    const s = signal(0)
    let fired = 0
    const dispose = probeDirect(s).direct(() => {
      fired += 1
    })
    s.set(7)
    expect(fired).toBeGreaterThan(0)
    dispose()
  })
})

// ─── createSelector — host miss vs bucket-exists path (line 155 false arm) ──

describe('createSelector — host miss + bucket exists (line 155 false arm)', () => {
  it('reading selector with value already in subs (subscribed first) goes through bucket-exists arm', () => {
    const src = signal<string>('a')
    const sel = createSelector(src)
    // Subscribe FIRST — populates subs.get(value) with a Set.
    const dispose = sel.subscribe('a', () => {})
    // Now READ the selector with same value — `hosts.get(value)` is undefined
    // (host never created via .subscribe()), so the `if (!host)` block runs.
    // Inside: `subs.get(value)` is the bucket created during .subscribe() →
    // `if (!bucket)` is false → arm 1 (skip set-creation) covered.
    expect(sel('a')).toBe(true)
    expect(sel('b')).toBe(false)
    dispose()
  })
})

// ─── renderEffect disposed-during-batch (line 453 truthy arm) ───────────────

describe('renderEffect — dispose during batch hits disposed-early-return (line 453 truthy arm)', () => {
  it('signal write + dispose inside same batch → run sees disposed=true on flush', () => {
    const src = signal(0)
    let runs = 0
    const dispose = renderEffect(() => {
      runs += 1
      src()
    })
    // First run during setup
    expect(runs).toBeGreaterThan(0)
    const initial = runs
    batch(() => {
      src.set(1) // enqueues run() for flush
      dispose() // disposed = true; deps detached
    })
    // After flush: if run was enqueued before dispose detached, it fires
    // with disposed=true → early-returns. Either way no further runs.
    src.set(2)
    expect(runs).toBe(initial)
  })
})

// ─── notify outside batch arm (line 251 false arm) ──────────────────────────

describe('signal notify outside batch (line 251 false arm)', () => {
  it('direct subscriber fires synchronously when not batching', () => {
    const s = signal(0)
    let fired = 0
    const dispose = probeDirect(s).direct(() => {
      fired += 1
    })
    // OUTSIDE batch — notifyDirect should iterate updaters synchronously.
    s.set(7)
    expect(fired).toBeGreaterThan(0)
    dispose()
  })

  it('direct subscriber fires via batch path when batching', () => {
    const s = signal(0)
    let fired = 0
    const dispose = probeDirect(s).direct(() => {
      fired += 1
    })
    batch(() => {
      s.set(1)
      s.set(2)
    })
    expect(fired).toBeGreaterThan(0)
    dispose()
  })
})
