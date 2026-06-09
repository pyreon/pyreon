import { describe, expect, it, vi } from 'vitest'
import {
  connectFakeDocs,
  FakeCrdtAdapter,
  FakeCrdtDoc,
} from '../crdt/fake-adapter'
import {
  type CrdtOrigin,
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
} from '../crdt/types'

describe('FakeCrdtAdapter', () => {
  it('createDoc returns a fresh FakeCrdtDoc', () => {
    const doc = new FakeCrdtAdapter().createDoc()
    expect(doc).toBeInstanceOf(FakeCrdtDoc)
  })

  it('getMap returns the SAME map for the same name', () => {
    const doc = new FakeCrdtDoc()
    expect(doc.getMap('a')).toBe(doc.getMap('a'))
    expect(doc.getMap('a')).not.toBe(doc.getMap('b'))
  })
})

describe('FakeCrdtDoc — transactions + observers', () => {
  it('batches multiple sets in one transact → observer fires once with all changed keys', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const fired: Array<{ keys: string[]; origin: CrdtOrigin }> = []
    map.observe((keys, origin) => fired.push({ keys: [...keys].sort(), origin }))

    doc.transact(() => {
      map.set('a', 1)
      map.set('b', 2)
    }, LOCAL_ORIGIN)

    expect(fired).toEqual([{ keys: ['a', 'b'], origin: LOCAL_ORIGIN }])
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
  })

  it('propagates the transaction origin to observers', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const custom = Symbol('custom')
    const seen: CrdtOrigin[] = []
    map.observe((_keys, origin) => seen.push(origin))

    doc.transact(() => map.set('a', 1), REMOTE_ORIGIN)
    doc.transact(() => map.set('a', 2), custom)

    expect(seen).toEqual([REMOTE_ORIGIN, custom])
  })

  it('a write to the SAME value is a no-op (no observer fire, no commit entry)', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    doc.transact(() => map.set('a', 1))
    const mapObs = vi.fn()
    const commitObs = vi.fn()
    map.observe(mapObs)
    doc._onCommit(commitObs)

    doc.transact(() => map.set('a', 1)) // same value

    expect(mapObs).not.toHaveBeenCalled()
    expect(commitObs).not.toHaveBeenCalled()
  })

  it('a bare set outside transact auto-wraps in an implicit local transaction', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const obs = vi.fn()
    map.observe(obs)

    map.set('a', 42) // no transact wrapper

    expect(map.get('a')).toBe(42)
    expect(obs).toHaveBeenCalledTimes(1)
    expect(obs).toHaveBeenCalledWith(new Set(['a']), LOCAL_ORIGIN)
  })

  it('nested transact flattens — outer origin wins, observers fire once', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const fired: CrdtOrigin[] = []
    map.observe((_k, origin) => fired.push(origin))

    doc.transact(() => {
      map.set('a', 1)
      doc.transact(() => map.set('b', 2), REMOTE_ORIGIN) // inner origin ignored
    }, LOCAL_ORIGIN)

    expect(fired).toEqual([LOCAL_ORIGIN]) // one fire, outer origin
  })

  it('an empty transaction fires nothing', () => {
    const doc = new FakeCrdtDoc()
    const obs = vi.fn()
    doc._onCommit(obs)
    doc.transact(() => {})
    expect(obs).not.toHaveBeenCalled()
  })

  it('has / keys / get reflect current state', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    expect(map.has('a')).toBe(false)
    expect(map.get('a')).toBeUndefined()
    expect(map.keys()).toEqual([])
    doc.transact(() => {
      map.set('a', 1)
      map.set('b', 2)
    })
    expect(map.has('a')).toBe(true)
    expect(map.keys().sort()).toEqual(['a', 'b'])
  })

  it('_onCommit fires with the flat (mapName, key, value) list + origin', () => {
    const doc = new FakeCrdtDoc()
    const m1 = doc.getMap('one')
    const m2 = doc.getMap('two')
    const commits: Array<{ entries: unknown; origin: CrdtOrigin }> = []
    doc._onCommit((entries, origin) => commits.push({ entries: [...entries], origin }))

    doc.transact(() => {
      m1.set('a', 1)
      m2.set('b', 2)
    }, LOCAL_ORIGIN)

    expect(commits).toEqual([
      {
        entries: [
          { mapName: 'one', key: 'a', value: 1 },
          { mapName: 'two', key: 'b', value: 2 },
        ],
        origin: LOCAL_ORIGIN,
      },
    ])
  })

  it('observer disposer removes the observer', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const obs = vi.fn()
    const off = map.observe(obs)
    doc.transact(() => map.set('a', 1))
    off()
    doc.transact(() => map.set('a', 2))
    expect(obs).toHaveBeenCalledTimes(1)
  })

  it('destroy is idempotent and stops further transactions', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('m')
    const obs = vi.fn()
    map.observe(obs)
    doc.destroy()
    doc.destroy() // idempotent — no throw
    doc.transact(() => map.set('a', 1)) // no-op after destroy
    expect(obs).not.toHaveBeenCalled()
  })
})

describe('connectFakeDocs — peer relay + echo prevention', () => {
  it('relays a local commit to the peer under REMOTE origin', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    connectFakeDocs(a, b)
    const bMap = b.getMap('m')
    const seen: CrdtOrigin[] = []
    bMap.observe((_k, origin) => seen.push(origin))

    a.getMap('m').set('x', 1)

    expect(bMap.get('x')).toBe(1)
    expect(seen).toEqual([REMOTE_ORIGIN])
  })

  it('does NOT re-forward a received update — exactly one forward per local write (echo prevention)', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    const link = connectFakeDocs(a, b)

    a.getMap('m').set('x', 1) // one local write on a

    // The relay forwards a→b once. b's resulting commit is REMOTE-origin, so
    // the origin guard suppresses the echo back to a. Without the guard this
    // would be 2 (the b→a re-forward). This is the load-bearing guard check —
    // a commit-count assertion can't catch it because the fake's LWW no-op
    // halts the round-trip regardless of the guard.
    expect(link.forwards()).toBe(1)
    expect(b.getMap('m').get('x')).toBe(1)
  })

  it('disconnect stops relaying', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    const { disconnect } = connectFakeDocs(a, b)
    a.getMap('m').set('x', 1)
    expect(b.getMap('m').get('x')).toBe(1)

    disconnect()
    a.getMap('m').set('x', 2)
    expect(b.getMap('m').get('x')).toBe(1) // unchanged after disconnect
  })
})
