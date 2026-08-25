import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { FakeCrdtDoc, connectFakeDocs } from '../crdt/fake-adapter'
import { observeMapKey } from '../crdt/map-dispatch'
import { type CrdtDoc, type CrdtMap, REMOTE_ORIGIN } from '../crdt/types'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedSignal } from '../synced-signal'
import { syncedStore } from '../synced-store'

/**
 * Regression locks for the per-(doc, map) dispatcher observer (`observeMapKey`)
 * that replaced N raw per-field `map.observe` calls in `syncedSignal` /
 * `syncedStore`.
 *
 * The four load-bearing specs (bisect-verified — see the PR notes):
 *   1. a local write converges without echoing (one base write, no wire echo)
 *   2. a remote apply reaches the RIGHT field's signal (and only that field)
 *   3. two stores over one doc are independent (disposing one leaves the
 *      other's observation intact — the shared observer survives)
 *   4. N fields → 1 engine observer per map (count-asserted, fake AND Yjs)
 */

/**
 * Wrap a CrdtDoc so every map counts its ACTIVE observers — the engine-neutral
 * probe for "how many `observe` registrations does the bridge really install".
 * Wrapped maps are memoized per name: the dispatcher registry keys on CrdtMap
 * object identity, so `getMap('x') === getMap('x')` must hold through the
 * wrapper exactly as the CrdtDoc contract promises.
 */
function countingDoc(inner: CrdtDoc): { doc: CrdtDoc; active: (mapName: string) => number } {
  const counts = new Map<string, number>()
  const wrapped = new Map<string, CrdtMap>()
  const doc: CrdtDoc = {
    getMap(name) {
      let m = wrapped.get(name)
      if (!m) {
        const real = inner.getMap(name)
        m = {
          get: (k) => real.get(k),
          set: (k, v) => real.set(k, v),
          has: (k) => real.has(k),
          keys: () => real.keys(),
          observe(cb) {
            counts.set(name, (counts.get(name) ?? 0) + 1)
            const off = real.observe(cb)
            let done = false
            return () => {
              if (done) return
              done = true
              counts.set(name, (counts.get(name) ?? 0) - 1)
              off()
            }
          },
        }
        wrapped.set(name, m)
      }
      return m
    },
    transact: (fn, origin) => inner.transact(fn, origin),
    destroy: () => inner.destroy(),
  }
  return { doc, active: (mapName) => counts.get(mapName) ?? 0 }
}

const twentyFields = (): Record<string, number> => {
  const initial: Record<string, number> = {}
  for (let i = 0; i < 20; i++) initial[`f${i}`] = i
  return initial
}

describe('syncedStore dispatcher observer', () => {
  it('(1) a local write converges without echoing — one base write, no wire echo', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    const link = connectFakeDocs(a, b)
    const sa = syncedStore({ title: '', count: 0 }, { doc: a })
    const sb = syncedStore({ title: '', count: 0 }, { doc: b })

    let titleFiresA = 0
    let countFiresA = 0
    sa.title.subscribe(() => titleFiresA++)
    sa.count.subscribe(() => countFiresA++)
    const forwardsBefore = link.forwards()

    sa.title.set('hello')

    // Converged on both peers…
    expect(sa.title()).toBe('hello')
    expect(sb.title()).toBe('hello')
    // …with exactly ONE base write on the originating field (the dispatcher
    // routes the commit to the title handler once; the observer's re-report of
    // the value base already holds would be an Object.is no-op, and no second
    // dispatch happens), zero on the sibling field…
    expect(titleFiresA).toBe(1)
    expect(countFiresA).toBe(0)
    // …and exactly one wire forward: B's remote-origin commit is never echoed
    // back to A (transport-level loop prevention, untouched by the dispatcher).
    expect(link.forwards() - forwardsBefore).toBe(1)
  })

  it('(2) a remote apply reaches the RIGHT field signal — and only that field', () => {
    const doc = new FakeCrdtDoc()
    const store = syncedStore({ title: 'a', count: 0, done: false }, { doc })
    let titleFires = 0
    let countFires = 0
    let doneFires = 0
    store.title.subscribe(() => titleFires++)
    store.count.subscribe(() => countFires++)
    store.done.subscribe(() => doneFires++)

    doc.transact(() => {
      doc.getMap('pyreon').set('count', 42)
    }, REMOTE_ORIGIN)

    expect(store.count()).toBe(42)
    expect(countFires).toBe(1)
    expect(titleFires).toBe(0)
    expect(doneFires).toBe(0)
  })

  it('(2b) a multi-key remote transaction updates every touched field once', () => {
    const doc = new FakeCrdtDoc()
    const store = syncedStore({ title: 'a', count: 0, done: false }, { doc })
    let titleFires = 0
    let doneFires = 0
    store.title.subscribe(() => titleFires++)
    store.done.subscribe(() => doneFires++)

    doc.transact(() => {
      const map = doc.getMap('pyreon')
      map.set('title', 'remote')
      map.set('done', true)
    }, REMOTE_ORIGIN)

    expect(store.title()).toBe('remote')
    expect(store.done()).toBe(true)
    expect(titleFires).toBe(1)
    expect(doneFires).toBe(1)
  })

  it('(3) two stores over one doc are independent — disposing one leaves the other observing', () => {
    const inner = new FakeCrdtDoc()
    const { doc, active } = countingDoc(inner)
    const a = syncedStore({ title: '', count: 0 }, { doc })
    const b = syncedStore({ title: '', count: 0 }, { doc })

    // Both stores share the SAME single observer per map.
    expect(active('pyreon')).toBe(1)

    a.dispose()

    // A's handlers are gone but the shared observer must survive for B.
    expect(active('pyreon')).toBe(1)

    doc.transact(() => {
      doc.getMap('pyreon').set('title', 'still-alive')
    }, REMOTE_ORIGIN)

    expect(b.title()).toBe('still-alive')
    expect(a.title()).toBe('') // disposed store no longer applies changes

    // Last handlers gone → the shared observer detaches (no leak).
    b.dispose()
    expect(active('pyreon')).toBe(0)
    expect(active('pyreon:defaults')).toBe(0)
  })

  it('(3b) both stores fire for the same key while both are live', () => {
    const doc = new FakeCrdtDoc()
    const a = syncedStore({ title: '' }, { doc })
    const b = syncedStore({ title: '' }, { doc })

    a.title.set('shared')

    expect(a.title()).toBe('shared')
    expect(b.title()).toBe('shared')
  })

  it('(4) N fields install ONE observer per map, not N (fake engine, counted)', () => {
    const inner = new FakeCrdtDoc()
    const { doc, active } = countingDoc(inner)
    const store = syncedStore(twentyFields(), { doc })

    // Pre-dispatcher this was 20 + 20 (one per field on the data map AND the
    // defaults map). The dispatcher collapses each map to one.
    expect(active('pyreon')).toBe(1)
    expect(active('pyreon:defaults')).toBe(1)

    // Routing still works at N fields: one write reaches exactly its field.
    let f7Fires = 0
    let f8Fires = 0
    store.f7!.subscribe(() => f7Fires++)
    store.f8!.subscribe(() => f8Fires++)
    store.f7!.set(700)
    expect(store.f7!()).toBe(700)
    expect(f7Fires).toBe(1)
    expect(f8Fires).toBe(0)

    store.dispose()
    expect(active('pyreon')).toBe(0)
    expect(active('pyreon:defaults')).toBe(0)
  })

  it('(4b) N fields install ONE Y.Map observer on the REAL engine', () => {
    const doc = createYjsDoc()
    // Yjs keeps observe handlers on the type's internal event-handler list —
    // the narrow internal read is the whole point of this spec (counting the
    // REAL engine's handler registrations, not the seam's).
    const handlerCount = (name: string): number =>
      (doc.yDoc.getMap(name) as unknown as { _eH: { l: unknown[] } })._eH.l.length

    const store = syncedStore(twentyFields(), { doc })
    expect(handlerCount('pyreon')).toBe(1)
    expect(handlerCount('pyreon:defaults')).toBe(1)

    // Real-engine remote apply routes to the right field.
    const update = (() => {
      const src = new Y.Doc()
      src.getMap('pyreon').set('f3', 999)
      return Y.encodeStateAsUpdate(src)
    })()
    Y.applyUpdate(doc.yDoc, update, REMOTE_ORIGIN)
    expect(store.f3!()).toBe(999)

    store.dispose()
    expect(handlerCount('pyreon')).toBe(0)
    expect(handlerCount('pyreon:defaults')).toBe(0)
    doc.destroy()
  })

  it('disposing ONE field keeps the shared observer for the rest', () => {
    const inner = new FakeCrdtDoc()
    const { doc, active } = countingDoc(inner)
    const store = syncedStore({ title: 'a', count: 0 }, { doc })

    store.title.dispose()
    expect(active('pyreon')).toBe(1)

    doc.transact(() => {
      doc.getMap('pyreon').set('count', 5)
      doc.getMap('pyreon').set('title', 'ignored')
    }, REMOTE_ORIGIN)

    expect(store.count()).toBe(5)
    expect(store.title()).toBe('a') // disposed field stays frozen

    store.dispose() // idempotent over the already-disposed title
    expect(active('pyreon')).toBe(0)
  })

  it('a signal created AFTER the store routes through the existing dispatcher', () => {
    const inner = new FakeCrdtDoc()
    const { doc, active } = countingDoc(inner)
    const store = syncedStore({ title: 'a' }, { doc })
    expect(active('pyreon')).toBe(1)

    // Late field on the SAME map: no second engine observer, still routed.
    const late = syncedSignal<number>({ doc, key: 'late', initial: 0 })
    expect(active('pyreon')).toBe(1)

    doc.transact(() => {
      doc.getMap('pyreon').set('late', 123)
    }, REMOTE_ORIGIN)
    expect(late()).toBe(123)

    late.dispose()
    expect(active('pyreon')).toBe(1) // store still holds handlers
    store.dispose()
    expect(active('pyreon')).toBe(0)
  })

  it('observeMapKey: duplicate registration of the same fn is a no-op whose off releases nothing', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    let fires = 0
    const handler = () => fires++
    const off1 = observeMapKey(map, 'k', handler)
    const offDup = observeMapKey(map, 'k', handler)

    map.set('k', 1)
    expect(fires).toBe(1) // set semantics — never double-fired

    offDup() // releases nothing…
    map.set('k', 2)
    expect(fires).toBe(2) // …the real registration still fires

    off1()
    off1() // idempotent
    map.set('k', 3)
    expect(fires).toBe(2)
  })

  it('observeMapKey: a handler disposed mid-dispatch by a sibling still fires once (snapshot parity)', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const fired: string[] = []
    // eslint-style hoist: offB is assigned before any dispatch can run (the
    // first write happens after both registrations).
    let offB: () => void = () => {}
    const offA = observeMapKey(map, 'k', () => {
      fired.push('a')
      offB() // dispose the sibling registration mid-dispatch
    })
    offB = observeMapKey(map, 'k', () => {
      fired.push('b')
    })

    map.set('k', 1)
    // Parity with the raw-observer engines: b was registered when the
    // transaction committed, so it fires once even though a disposed it.
    expect(fired).toEqual(['a', 'b'])

    map.set('k', 2)
    expect(fired).toEqual(['a', 'b', 'a']) // b is gone for later commits

    offA()
  })
})
