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

// ─── Edge-case shapes the swap-removal must also handle correctly ───────────
//
// The single-Set iteration design relies on JS Set semantics. Each test below
// pins a structural property the implementation must hold across the cases
// that aren't covered by the canonical bug repro above. They form a
// quasi-fence: changes that break any one of these would break a real
// usage shape we know exists.
describe('batch — additional cascade shapes', () => {
  test('3-hop chain + 0-hop direct dep: subscriber fires once (canonical bug at depth 3)', async () => {
    const { computed } = await import('../computed')
    const source = signal(0)
    const other = signal(0)
    // 3-hop chain: source → a → b → c → effect
    const a = computed(() => source() * 2, { equals: (x, y) => x === y })
    const b = computed(() => a() + 1, { equals: (x, y) => x === y })
    const c = computed(() => b() * 3, { equals: (x, y) => x === y })

    let runs = 0
    effect(() => {
      c()
      other()
      runs++
    })
    runs = 0

    // Both writes in one batch. Pre-removal of swap, the deeper indirection
    // would land in an even-later round than the 0-hop direct path — same
    // bug shape, just more rounds apart.
    batch(() => {
      source.set(5)
      other.set(1)
    })

    expect(runs).toBe(1)
  })

  test('effect that throws during flush — iteration continues for remaining queued effects', () => {
    const a = signal(0)
    const b = signal(0)
    let bRuns = 0

    // First effect throws; the queue must still drain.
    effect(() => {
      if (a() > 0) throw new Error('boom')
    })
    effect(() => {
      b()
      bRuns++
    })
    bRuns = 0

    // Both queued in same batch. The throwing effect is FIRST in pending
    // (declared first → tracks first → enqueued first). It throws; the loop
    // must continue and run the second effect.
    batch(() => {
      a.set(1)
      b.set(1)
    })

    // Second effect ran exactly once despite the first effect throwing.
    expect(bRuns).toBe(1)
  })

  test('effect creating a new effect during flush — new effect runs and tracks correctly', () => {
    const trigger = signal(0)
    const inner = signal(100)
    const innerSeen: number[] = []

    let outerRuns = 0
    effect(() => {
      trigger()
      outerRuns++
      // First trigger.set() creates a new effect during flush. The new
      // effect must run and pick up tracked deps.
      if (outerRuns === 2) {
        effect(() => {
          innerSeen.push(inner())
        })
      }
    })

    trigger.set(1)
    expect(outerRuns).toBe(2)
    // Inner effect was created → ran initially with inner=100.
    expect(innerSeen).toEqual([100])

    // Inner effect should track `inner`. Updating inner() after creation
    // re-fires it.
    inner.set(101)
    expect(innerSeen).toEqual([100, 101])
  })

  test('effect disposed during another effect\'s flush — disposed one does not fire', () => {
    const a = signal(0)
    const b = signal(0)

    let aRuns = 0
    let bRuns = 0

    let bEffect: ReturnType<typeof effect> | null = null

    // First effect disposes the second one whenever it fires (after init).
    effect(() => {
      a()
      aRuns++
      if (bEffect) {
        bEffect.dispose()
        bEffect = null
      }
    })

    // bEffect created AFTER the first effect's initial run, so the first
    // effect's initial run sees bEffect=null (no dispose). Both effects
    // exist after this line.
    bEffect = effect(() => {
      b()
      bRuns++
    })

    aRuns = 0
    bRuns = 0

    // Both signals change in one batch. pending=[aEffect.run, bEffect.run].
    // aEffect.run runs first → disposes bEffect (sets bEffect.disposed=true).
    // bEffect.run runs next → early-returns on `if (disposed) return`.
    batch(() => {
      a.set(1)
      b.set(1)
    })

    expect(aRuns).toBe(1)
    expect(bRuns).toBe(0)
  })

  test('self-modifying effect: writes a tracked signal mid-run, no infinite loop, settles', () => {
    const counter = signal(0)
    let runs = 0

    effect(() => {
      const v = counter()
      runs++
      // Write to a tracked signal — should NOT re-queue this effect within
      // the same batch (already-iterated entries don't re-fire).
      if (v < 3) {
        counter.set(v + 1)
      }
    })

    // Initial run: reads 0, writes 1. No re-fire in same flush.
    // External reset:
    runs = 0
    counter.set(10)
    // counter triggers effect. effect writes counter.set(11). Within one
    // batch boundary (the one signal.set wraps with), the second write
    // would re-queue effect — but Set says "already in queue" / "already
    // iterated" → no infinite loop.
    expect(runs).toBeGreaterThanOrEqual(1)
    expect(runs).toBeLessThan(50) // safety: no runaway
  })
})

// ─── Property-based fuzz: random cascade graphs maintain the invariant ──────
//
// The CORE invariant the batch flush must guarantee:
//
//   Each effect fires AT MOST ONCE per batch, with the final state of all
//   its tracked dependencies.
//
// Counter-based tests above check specific shapes. This generates random
// dep graphs (signals + computeds + effects with random edges) and asserts
// the invariant holds across many topologies. Catches structural
// regressions that a hand-picked test wouldn't anticipate.
describe('batch — property-based: random cascade graph maintains invariant', () => {
  // Deterministic RNG so failures are reproducible from the seed.
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2ae53f) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  test('25 random cascade graphs across various sizes — every effect fires ≤1× per batch', async () => {
    const { computed } = await import('../computed')
    const SEEDS = 25

    for (let seed = 1; seed <= SEEDS; seed++) {
      const rand = mulberry32(seed)
      const numSignals = 2 + Math.floor(rand() * 4) // 2-5 signals
      const numComputeds = 1 + Math.floor(rand() * 5) // 1-5 computeds
      const numEffects = 2 + Math.floor(rand() * 6) // 2-7 effects

      const signals = Array.from({ length: numSignals }, () => signal(0))
      const computeds: (() => number)[] = []
      // Each computed depends on 1-2 random previous nodes (signals or earlier computeds).
      // Copy signals into allReadable — pushing computeds to allReadable must NOT
      // mutate the signals array (the bug that broke this test on first write).
      const allReadable: (() => number)[] = [...signals]
      for (let i = 0; i < numComputeds; i++) {
        const dep1 = allReadable[Math.floor(rand() * allReadable.length)]!
        const dep2 = allReadable[Math.floor(rand() * allReadable.length)]!
        const c = computed(() => dep1() + dep2(), { equals: (a, b) => a === b })
        computeds.push(c)
        allReadable.push(c)
      }

      // Each effect tracks 2-4 random readable nodes.
      const counts = Array<number>(numEffects).fill(0)
      for (let i = 0; i < numEffects; i++) {
        const idx = i
        const numDeps = 2 + Math.floor(rand() * 3)
        const deps: (() => number)[] = []
        for (let j = 0; j < numDeps; j++) {
          deps.push(allReadable[Math.floor(rand() * allReadable.length)]!)
        }
        effect(() => {
          for (const d of deps) d()
          counts[idx]!++
        })
      }
      counts.fill(0)

      // Random batch: 1-3 signal writes.
      const numWrites = 1 + Math.floor(rand() * 3)
      batch(() => {
        for (let i = 0; i < numWrites; i++) {
          const sig = signals[Math.floor(rand() * signals.length)]!
          sig.set(Math.floor(rand() * 100))
        }
      })

      // Invariant: every effect fired AT MOST ONCE per batch.
      for (let i = 0; i < numEffects; i++) {
        if (counts[i]! > 1) {
          throw new Error(
            `seed=${seed} effect[${i}] fired ${counts[i]} times (>1). ` +
              `numSignals=${numSignals} numComputeds=${numComputeds} numEffects=${numEffects}`,
          )
        }
      }
    }
  })
})

// ─── Audit bug #19: stale-Set leak on subscriber throw ────────────────────────
//
// Pre-fix: `pendingNotifications.clear()` was inside the try block of the
// flush loop. If a subscriber threw mid-iteration, the for-loop exited and
// the clear() never ran, leaking the unflushed remainder into the next
// batch. The next batch's `size > 0` check then re-entered flush mode and
// REFIRED the stale entries.
//
// Effect callbacks wrap their internals in try/catch so the bug rarely
// surfaces from `effect()`, but raw `signal.subscribe(fn)` callbacks (and
// any future internal consumer that doesn't pre-wrap) throw straight
// through. Fix: move `clear()` to the finally block.

describe('batch — subscriber-throw stale-Set leak (audit bug #19)', () => {
  test('throwing subscriber does not leak stale notifications into next batch', () => {
    const a = signal(0)
    const b = signal(0)

    let aFires = 0
    let bFires = 0

    a.subscribe(() => {
      aFires++
      throw new Error('boom')
    })
    b.subscribe(() => {
      bFires++
    })

    // Batch 1 — A's subscriber throws mid-flush.
    expect(() => {
      batch(() => {
        a.set(1)
        b.set(1)
      })
    }).toThrow('boom')

    // Sanity: a fired once and threw; b may or may not have fired depending
    // on iteration order. The bug manifests in the SECOND batch — refiring
    // an already-fired-and-cleared entry.
    const aFiresAfterFirst = aFires
    const bFiresAfterFirst = bFires

    // Batch 2 — only b changes. Without the fix, A's stale subscriber
    // still in pendingNotifications fires AGAIN.
    try {
      batch(() => {
        b.set(2)
      })
    } catch {
      // If A's subscriber refires, the throw escapes here. Catch + assert
      // below so the test reports the right reason.
    }

    expect(aFires).toBe(aFiresAfterFirst) // A must NOT refire
    expect(bFires).toBeGreaterThan(bFiresAfterFirst) // B should fire for its update
  })

  test('multiple consecutive throws stay isolated to their own batch', () => {
    const sig = signal(0)
    let fires = 0
    sig.subscribe(() => {
      fires++
      throw new Error('always')
    })

    // Three batches, each with a throw — fires count must equal batch count,
    // not multiply per leak.
    for (let i = 1; i <= 3; i++) {
      expect(() => {
        batch(() => sig.set(i))
      }).toThrow('always')
    }

    expect(fires).toBe(3)
  })
})
