/**
 * REPRODUCTION + REGRESSION — solid-compat leak-class sweep follow-up
 * to #734.
 *
 * 1. `createResource` Class F stale-resolution race (#730 charts/storage
 *    shape) — `fetchPromise` was overwritten on refetch with no signal
 *    to the old promise's handlers. SLOW old + FAST new produced the
 *    OLD value clobbering the NEW.
 *
 * 2. `createStore` per-path signal map (Class C) — `signals.Map<path,
 *    signal>` grew by one entry per UNIQUE read-path string for the
 *    store's lifetime. Dynamic key spaces (dictionaries, pagination,
 *    log streams) leaked one signal per key ever accessed.
 */
import { describe, expect, it } from 'vitest'
import { _STORE_SIGNAL_CACHE, createResource, createStore } from '../index'

describe('createResource — stale-resolution race (#730 Class F shape)', () => {
  it('REGRESSION: slow original + fast refetch — fast result wins, slow ignored', async () => {
    // Two pending promises with manual resolution so we control ordering.
    let resolveSlow: ((v: string) => void) | null = null
    let resolveFast: ((v: string) => void) | null = null
    let callCount = 0
    const fetcher = () => {
      callCount++
      if (callCount === 1) {
        return new Promise<string>((res) => {
          resolveSlow = res
        })
      }
      return new Promise<string>((res) => {
        resolveFast = res
      })
    }

    // Initial value bypasses the Suspense-throw path so the test can
    // read `resource()` while in-flight (the Suspense integration
    // throws the fetchPromise when loading && current === undefined).
    const [resource, { refetch }] = createResource(fetcher, { initialValue: 'INIT' })
    // Call 1 in flight (slow).
    expect(resource.loading).toBe(true)

    // Call 2 starts before slow has settled.
    refetch()
    expect(callCount).toBe(2)

    // Resolve fast FIRST — this is the canonical case the version-track
    // fix protects: the NEWER fetch settles first, but the OLDER fetch
    // is still pending. When OLD eventually resolves, its setData MUST
    // be discarded.
    resolveFast!('FAST')
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(resource()).toBe('FAST')

    // Now the OLD/slow promise resolves. Pre-fix: setData('SLOW')
    // clobbers 'FAST'. Post-fix: version mismatch → discarded.
    resolveSlow!('SLOW')
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    // The critical assertion.
    expect(resource()).toBe('FAST')
  })

  it('REGRESSION: latest value survives a stale rejection', async () => {
    let rejectSlow: ((e: Error) => void) | null = null
    let resolveFast: ((v: string) => void) | null = null
    let callCount = 0
    const fetcher = () => {
      callCount++
      if (callCount === 1) {
        return new Promise<string>((_, rej) => {
          rejectSlow = rej
        })
      }
      return new Promise<string>((res) => {
        resolveFast = res
      })
    }

    const [resource, { refetch }] = createResource(fetcher, { initialValue: 'INIT' })
    refetch()
    resolveFast!('OK')
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(resource()).toBe('OK')
    expect(resource.error).toBeUndefined()

    // Stale rejection arrives. Pre-fix: setError('BOOM') overwrites
    // the successful 'OK' state with an error from a discarded request.
    // Post-fix: version mismatch → discarded.
    rejectSlow!(new Error('BOOM'))
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    expect(resource.error).toBeUndefined()
    expect(resource()).toBe('OK')
  })
})

describe('createStore — subscriber-aware signal eviction (#733 Class C shape)', () => {
  it('REGRESSION: signal map shrinks after subscriber-less reads beyond sweep threshold', () => {
    // Build a store with a large enough surface for the sweep to fire.
    const items: Record<string, number> = {}
    for (let i = 0; i < 500; i++) items[`k${i}`] = i

    const [store, setStore] = createStore({ items })

    // Read 500 distinct paths WITHOUT subscribing — no effect tracks
    // these, so they should all be eligible for eviction.
    for (let i = 0; i < 500; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ;(store.items as Record<string, number>)[`k${i}`]
    }

    // Reach into the internal Map via the @internal debug symbol.
    const cache
      = (store as unknown as Record<symbol, Map<string, unknown> | undefined>)[_STORE_SIGNAL_CACHE]
    if (!cache) throw new Error('store should expose _STORE_SIGNAL_CACHE')
    const beforeSweepSize = cache.size

    // The proxy walk touched ALL 500 leaf paths PLUS the intermediate
    // `items` path. Pre-fix the cache grows unbounded with each unique
    // read. Trigger a write so the sweep fires (post-fix).
    setStore('items', { ...items, kNew: 999 })
    const afterSweepSize = cache.size

    // The critical assertion: the sweep reclaimed the subscriber-less
    // entries. We use a generous bound — anything below 100 proves
    // the bulk of the 500 ad-hoc reads were reclaimed. Pre-fix size
    // grows monotonically (~500+); post-fix drops dramatically.
    expect(beforeSweepSize).toBeGreaterThan(400)
    expect(afterSweepSize).toBeLessThan(100)

    // Correctness check: each subsequent read returns the current
    // value (signals lazily re-created after eviction).
    for (let i = 0; i < 10; i++) {
      expect((store.items as Record<string, number>)[`k${i}`]).toBe(i)
    }
    expect((store.items as Record<string, number>).kNew).toBe(999)
  })

  it('REGRESSION: actively-subscribed signals survive the sweep (correctness preserved)', async () => {
    const { effect } = await import('@pyreon/reactivity')
    const items: Record<string, number> = {}
    for (let i = 0; i < 300; i++) items[`k${i}`] = i

    const [store, setStore] = createStore({ items })

    // ONE signal is actively tracked by an effect.
    let observed = 0
    const dispose = effect(() => {
      observed = (store.items as Record<string, number>).k0 ?? -1
    })
    expect(observed).toBe(0)

    // Generate cache pressure by reading many paths without subscribing.
    for (let i = 1; i < 300; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ;(store.items as Record<string, number>)[`k${i}`]
    }

    // Trigger a write so the sweep fires.
    setStore('items', { ...items, k0: 42 })

    // The actively-tracked signal MUST survive — the effect re-runs.
    // Pre-sweep this passed trivially; the post-sweep correctness
    // guarantee is what this test locks in. If the sweep evicted k0
    // erroneously, observed would still be 0.
    expect(observed).toBe(42)

    dispose?.dispose()
  })
})
