/**
 * Regression locks for the reactivity hardening fixes from the deep-analysis
 * pass (leak + silent-prod-failure findings):
 *   1. `scope.stop()` releases `_parent` + `_contexts` (a disposed scope no
 *      longer retains its owner chain + context Map → GC + leak fix).
 *   2. `createSelector` drops a promoted key's bucket when its last subscriber
 *      leaves (the empty-Set unbounded-growth leak) — behavior-preservation +
 *      re-subscribe correctness.
 *   3. The `MAX_PASSES` drop is surfaced in PRODUCTION (was dev-only → silent
 *      prod corruption).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { batch } from '../batch'
import { createSelector } from '../createSelector'
import { effect } from '../effect'
import { EffectScope } from '../scope'
import { signal } from '../signal'

describe('analysis hardening — scope.stop() releases owner-chain + contexts', () => {
  it('nulls _parent and _contexts on stop()', () => {
    const parent = new EffectScope()
    const child = new EffectScope()
    child._parent = parent
    parent.provideContext(Symbol('a'), 1)
    child.provideContext(Symbol('b'), 2)
    expect(child._parent).toBe(parent)
    expect(child._contexts).not.toBe(null)

    child.stop()
    expect(child._parent).toBe(null) // owner-chain reference released
    expect(child._contexts).toBe(null) // context Map released

    parent.stop()
    expect(parent._contexts).toBe(null)
  })
})

describe('analysis hardening — createSelector promoted-key cleanup', () => {
  it('drops a promoted key once its last subscriber unsubscribes (no leak, re-subscribe works)', () => {
    const sel = signal('a')
    const isSel = createSelector(sel)
    // Two subscribers for the SAME key → promotes the bucket to a Set.
    const seen: string[] = []
    const offA = isSel.subscribe('a', (m) => seen.push(`A:${m}`))
    const offB = isSel.subscribe('a', (m) => seen.push(`B:${m}`))
    // Both fire on a change away from + back to 'a'.
    sel.set('b')
    sel.set('a')
    expect(seen).toContain('A:false')
    expect(seen).toContain('B:false')
    expect(seen).toContain('A:true')
    expect(seen).toContain('B:true')
    // Unsubscribe BOTH — the promoted Set empties; the key must not linger.
    offA()
    offB()
    // Re-subscribing the same key after full teardown still works correctly
    // (would also work with a lingering empty Set, but this guards the path).
    const seen2: string[] = []
    const offC = isSel.subscribe('a', (m) => seen2.push(`C:${m}`))
    expect(seen2).toEqual(['C:true']) // initial inline call, current === 'a'
    sel.set('z')
    expect(seen2).toContain('C:false')
    offC()
    isSel.dispose()
  })
})

describe('analysis hardening — MAX_PASSES surfaces in production', () => {
  const prevEnv = process.env.NODE_ENV
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevEnv
    vi.restoreAllMocks()
  })

  it('logs a console.error when the flush exceeds MAX_PASSES in production', () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = signal(0)
    // An unguarded self-writing effect: reads `s`, writes `s+1` every run →
    // re-enqueues itself forever → trips the MAX_PASSES(32) cap, which drops the
    // queue (terminating) and now ALSO errors in production.
    const e = effect(() => {
      const v = s()
      s.set(v + 1)
    })
    // The cap dropped the queue, so this converges (no hang) after ~32 passes.
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0]?.[0])).toContain('MAX_PASSES')
    e.dispose()
  })

  it('does NOT error on a normal converging batch in production', () => {
    process.env.NODE_ENV = 'production'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = signal(0)
    const seen: number[] = []
    const e = effect(() => {
      seen.push(a())
    })
    batch(() => {
      a.set(1)
      a.set(2)
    })
    expect(spy).not.toHaveBeenCalled() // no MAX_PASSES trip on healthy graphs
    e.dispose()
  })
})
