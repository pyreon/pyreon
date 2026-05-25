/**
 * Coverage-hardening suite for @pyreon/reactivity.
 *
 * The reactivity core is the foundation every other Pyreon package depends
 * on. Its branch coverage had drifted to 87.38% — below the 90% global
 * threshold (the package's own `bun run test` exited non-zero) — leaving
 * error-handler branches, batching/non-batching dual paths, the
 * snapshot-restore DI hook, and the MAX_PASSES infinite-loop guard
 * unexercised. Each test here asserts real observable behaviour of one of
 * those previously-uncovered branches; none games coverage.
 */
import { accessInternal } from '@pyreon/test-utils'
import { batch } from '../batch'
import { Cell } from '../cell'
import { computed } from '../computed'
import { createSelector } from '../createSelector'
import {
  type ReactiveSnapshotCapture,
  effect,
  renderEffect,
  setErrorHandler,
  setSnapshotCapture,
  _bind,
} from '../effect'
import { clearReactiveTrace, getReactiveTrace } from '../reactive-trace'
import { signal } from '../signal'

// ── effect.ts: error handler on a throwing inner effect during disposal ──────

describe('effect — inner-effect disposal error handling', () => {
  test('a throwing inner-effect cleanup is routed to the error handler, not swallowed', () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const trigger = signal(0)
    let inner: ReturnType<typeof effect> | undefined

    const outer = effect(() => {
      trigger() // re-runs outer → runCleanup disposes the inner effect
      inner = effect(() => {})
      // Make the inner effect's dispose throw so the catch + _errorHandler
      // branch in runCleanup (effect.ts:183-190) is exercised.
      const orig = inner.dispose
      inner.dispose = () => {
        orig()
        throw new Error('inner-dispose-boom')
      }
    })

    trigger.set(1) // outer re-runs → runCleanup → inner.dispose() throws

    expect(caught).toHaveLength(1)
    expect((caught[0] as Error).message).toBe('inner-dispose-boom')

    outer.dispose()
    setErrorHandler((_err) => {})
  })
})

// ── effect.ts: snapshot-restore DI hook (setSnapshotCapture) ─────────────────

describe('effect — snapshot-capture restore branch', () => {
  afterEach(() => setSnapshotCapture(null))

  test('effect / _bind / renderEffect route re-runs through capture.restore', () => {
    const restoreCalls: string[] = []
    const hook: ReactiveSnapshotCapture = {
      capture: () => ({ tag: 'snap' }),
      restore: (snap, fn) => {
        restoreCalls.push((snap as { tag: string }).tag)
        return fn()
      },
    }
    setSnapshotCapture(hook)

    const s = signal(0)
    let effRuns = 0
    let bindRuns = 0
    let reRuns = 0

    const eff = effect(() => {
      s()
      effRuns++
    })
    const bindStop = _bind(() => {
      s()
      bindRuns++
    })
    const reStop = renderEffect(() => {
      s()
      reRuns++
    })

    // First runs do NOT restore (synchronous mount stack already correct).
    expect(restoreCalls).toEqual([])

    s.set(1) // every effect re-runs — each goes through capture.restore

    expect(effRuns).toBe(2)
    expect(bindRuns).toBe(2)
    expect(reRuns).toBe(2)
    // Three re-runs, each restored against the captured snapshot.
    expect(restoreCalls).toEqual(['snap', 'snap', 'snap'])

    eff.dispose()
    bindStop()
    reStop()
  })
})

// ── effect.ts: multi-dep renderEffect cleanup (deps.length > 1) ──────────────

describe('effect — renderEffect multi-dependency cleanup', () => {
  test('disposing a renderEffect with >1 tracked signal unsubscribes from all', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0

    const stop = renderEffect(() => {
      a()
      b()
      runs++
    })
    expect(runs).toBe(1)

    a.set(1)
    b.set(1)
    expect(runs).toBe(3)

    stop() // deps.length === 2 → the `for (const s of deps)` cleanup branch

    a.set(2)
    b.set(2)
    expect(runs).toBe(3) // no further runs — fully unsubscribed
  })
})

// ── batch.ts: MAX_PASSES infinite re-enqueue guard ──────────────────────────

describe('batch — MAX_PASSES guard on a non-converging effect', () => {
  test('an effect that unconditionally re-writes a signal it reads is capped, warned, and the queue is cleared', () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(args.join(' '))
    }

    const s = signal(0)
    let runs = 0
    const eff = effect(() => {
      const v = s()
      runs++
      // Always writes a new value → never converges → trips MAX_PASSES.
      s.set(v + 1)
    })

    try {
      // The initial run already self-schedules; force a flush via batch.
      batch(() => {
        s.set(1)
      })
    } finally {
      console.warn = origWarn
    }

    // Capped: tier-2 stops after MAX_PASSES (32) — NOT an unbounded loop.
    expect(runs).toBeGreaterThan(1)
    expect(runs).toBeLessThan(200)
    expect(warns.some((w) => w.includes('MAX_PASSES'))).toBe(true)

    eff.dispose()

    // Queue was cleared on the trip — a fresh, converging batch works.
    const t = signal(0)
    let tRuns = 0
    const eff2 = effect(() => {
      t()
      tRuns++
    })
    batch(() => t.set(1))
    expect(tRuns).toBe(2)
    eff2.dispose()
  })
})

// ── computed.ts: error handler + direct-updater registration ────────────────

describe('computed — error handler and direct updaters', () => {
  test('a throwing computed routes the error to the handler and stays readable', () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const src = signal(0)
    const c = computed(() => {
      if (src() === 1) throw new Error('compute-boom')
      return src() * 10
    })

    expect(c()).toBe(0)
    src.set(1)
    // Recompute throws → _errorHandler branch (computed.ts:203-204) fires.
    void c()
    expect(caught.some((e) => (e as Error).message === 'compute-boom')).toBe(true)

    src.set(2)
    expect(c()).toBe(20) // recovers cleanly after the throwing input passes

    setErrorHandler((_err) => {})
  })

  test('computed.direct registers / fires / unsubscribes a direct updater and exposes _d', () => {
    const src = signal(1)
    const c = computed(() => src() * 2)
    void c() // initialize

    const seen: number[] = []
    const unsub = c.direct(() => seen.push(c()))

    // `_d` getter (computed.ts:243-247) exposes the live direct-updater set.
    expect(accessInternal<{ _d: Set<unknown> }>(c)._d.size).toBe(1)

    src.set(5)
    expect(seen).toEqual([10])

    unsub()
    expect(accessInternal<{ _d: Set<unknown> }>(c)._d.size).toBe(0)
    src.set(7)
    expect(seen).toEqual([10]) // no further direct notifications
  })
})

// ── signal.ts: notifyDirect non-batching path ───────────────────────────────

describe('signal — direct updater non-batching notification', () => {
  test('signal.direct updater fires synchronously on a non-batched set', () => {
    const s = signal(0)
    const seen: number[] = []
    const unsub = s.direct(() => seen.push(s()))

    s.set(1) // non-batched → `for (const fn of updaters) fn()` (signal.ts:186)
    s.set(2)
    expect(seen).toEqual([1, 2])

    unsub()
    s.set(3)
    expect(seen).toEqual([1, 2])
  })
})

// ── createSelector.ts: single-bucket notify + selection change ──────────────

describe('createSelector — bucket notification branches', () => {
  test('selecting / deselecting notifies only the two affected single-entry buckets', () => {
    const selected = signal('a')
    const isSelected = createSelector(selected)

    const aRuns: number[] = []
    const bRuns: number[] = []
    const aStop = renderEffect(() => {
      aRuns.push(isSelected('a') ? 1 : 0)
    })
    const bStop = renderEffect(() => {
      bRuns.push(isSelected('b') ? 1 : 0)
    })

    expect(aRuns).toEqual([1])
    expect(bRuns).toEqual([0])

    // 'a' → 'b': old bucket ('a', size 1) + new bucket ('b', size 1) each
    // hit the `bucket.size === 1` fast path (createSelector.ts:10-13).
    selected.set('b')
    expect(aRuns).toEqual([1, 0])
    expect(bRuns).toEqual([0, 1])

    // Selecting an unobserved value: no bucket for it → no spurious notifies.
    selected.set('c')
    expect(aRuns).toEqual([1, 0])
    expect(bRuns).toEqual([0, 1, 0])

    aStop()
    bStop()
    isSelected.dispose()
    // Idempotent dispose.
    isSelected.dispose()
  })

  test('multi-subscriber bucket uses the iteration-capped loop', () => {
    const selected = signal('x')
    const isSelected = createSelector(selected)
    const hits: string[] = []

    // Three subscribers all querying 'x' → bucket size 3 → capped-loop path.
    const stops = [1, 2, 3].map((n) =>
      renderEffect(() => {
        if (isSelected('x')) hits.push(`s${n}`)
      }),
    )
    expect(hits).toEqual(['s1', 's2', 's3'])

    selected.set('y') // old bucket 'x' has 3 entries → multi-entry branch
    selected.set('x')
    expect(hits).toEqual(['s1', 's2', 's3', 's1', 's2', 's3'])

    stops.forEach((s) => s())
    isSelected.dispose()
  })
})

// ── cell.ts: listener → Set promotion when a single listener already exists ──

describe('Cell — single-listener promotion to Set', () => {
  test('a second subscribe promotes the lazy _l slot into a Set (cell.ts:49)', () => {
    const c = new Cell(0)
    const seen: string[] = []
    // First subscribe: stored in the single-listener `_l` fast-path slot.
    const off1 = c.subscribe(() => seen.push('a'))
    // Second subscribe: `!this._s` is true AND `this._l` is set → the
    // promotion branch `this._s.add(this._l); this._l = null` runs.
    const off2 = c.subscribe(() => seen.push('b'))

    c.set(1)
    expect(seen).toEqual(['a', 'b'])

    off1() // unsubscribe the promoted listener from the Set
    c.set(2)
    expect(seen).toEqual(['a', 'b', 'b'])
    off2()
    c.set(3)
    expect(seen).toEqual(['a', 'b', 'b'])
  })
})

// ── reactive-trace.ts: preview() value-shape branches ───────────────────────

describe('reactive-trace — preview of every value shape', () => {
  beforeEach(() => clearReactiveTrace())

  test('arrays, functions, symbols, bigint, plain objects, named instances, >4 keys, long strings', () => {
    const s = signal<unknown>(null, { name: 'v' })

    s.set([1, 2, 3]) // Array(3)
    s.set(function namedFn() {}) // [Function namedFn]
    s.set(Symbol('sym')) // Symbol(sym)
    s.set(10n) // bigint → String()
    s.set({ a: 1, b: 2 }) // plain object → { a, b }
    class Point {
      x = 1
    }
    s.set(new Point()) // named ctor → "Point { x }"
    s.set({ a: 1, b: 2, c: 3, d: 4, e: 5 }) // >4 keys → trailing ", …"
    s.set('z'.repeat(500)) // long string → truncated with "…"

    const trace = getReactiveTrace()
    const nexts = trace.map((e) => e.next)

    expect(nexts).toContain('Array(3)')
    expect(nexts.some((n) => n!.includes('[Function namedFn]'))).toBe(true)
    expect(nexts.some((n) => n!.includes('Symbol(sym)'))).toBe(true)
    expect(nexts).toContain('10')
    expect(nexts.some((n) => n === '{a, b}' || n === '{ a, b }' || /\{a, b\}/.test(n!))).toBe(true)
    expect(nexts.some((n) => n!.startsWith('Point '))).toBe(true)
    expect(nexts.some((n) => n!.includes('…'))).toBe(true) // both >4-keys and long-string
  })

  test('an object whose Object.keys throws falls back gracefully (no throw, recorded)', () => {
    const s = signal<unknown>(null, { name: 'p' })
    // A revoked Proxy throws on every trap including ownKeys → the inner
    // try/catch returns [] and the outer try/catch keeps preview total.
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(() => s.set(proxy)).not.toThrow()
    expect(getReactiveTrace()).toHaveLength(1)
  })
})

// ── tracking.ts: cleanupEffect WeakMap path + batched single-subscriber ──────

describe('tracking — cleanup + batched single-subscriber', () => {
  test('an effect re-run clears its WeakMap-tracked deps before re-subscribing', () => {
    const a = signal(0)
    const b = signal(100)
    const useA = signal(true)
    let runs = 0

    const eff = effect(() => {
      // Dynamic dependency: switches which signal it tracks. The re-run
      // path goes through cleanupEffect's `for (const sub of deps)` +
      // deps.clear() branch (tracking.ts:72-73).
      if (useA()) a()
      else b()
      runs++
    })
    expect(runs).toBe(1)

    useA.set(false) // re-run, now tracks b not a
    expect(runs).toBe(2)

    a.set(1) // a is no longer a dep → no run
    expect(runs).toBe(2)

    b.set(101) // b IS the dep now → runs
    expect(runs).toBe(3)

    eff.dispose()
  })

  test('a computed with ONE subscriber recomputed under batch enqueues via notifySubscribers (tracking.ts:83)', () => {
    const src = signal(0)
    const c = computed(() => src() * 2)
    const order: string[] = []

    const eff = effect(() => {
      order.push(`run:${c()}`)
    })
    expect(order).toEqual(['run:0'])

    batch(() => {
      src.set(5) // computed.recompute → notifySubscribers(host._s), size 1, batching
      order.push('mid-batch')
    })
    // The single computed-subscriber fired AFTER the batch (enqueued, not inline).
    expect(order).toEqual(['run:0', 'mid-batch', 'run:10'])

    eff.dispose()
  })

  test('a computed with TWO+ subscribers recomputed without batch hits the multi-sub inline loop (tracking.ts:97-102)', () => {
    const src = signal(1)
    const c = computed(() => src() + 1)
    const a: number[] = []
    const b: number[] = []

    const effA = effect(() => {
      a.push(c())
    })
    const effB = effect(() => {
      b.push(c())
    })
    expect(a).toEqual([2])
    expect(b).toEqual([2])

    // Non-batched source change → computed.recompute → notifySubscribers
    // with host._s.size === 2 → the originalSize-capped inline `for` loop.
    src.set(9)
    expect(a).toEqual([2, 10])
    expect(b).toEqual([2, 10])

    effA.dispose()
    effB.dispose()
  })

  test('a single-subscriber signal written inside batch() enqueues (not inline)', () => {
    const s = signal(0)
    const order: string[] = []
    const eff = effect(() => {
      s()
      order.push(`run:${s()}`)
    })
    expect(order).toEqual(['run:0'])

    batch(() => {
      s.set(1)
      order.push('mid-batch') // effect must NOT have run yet (enqueued)
    })

    // tracking.ts:83 — single subscriber under batch → enqueuePendingNotification,
    // so the effect fires AFTER the batch body, not inline at .set().
    expect(order).toEqual(['run:0', 'mid-batch', 'run:1'])

    eff.dispose()
  })
})
