import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeCrdtDoc, connectFakeDocs } from '../crdt/fake-adapter'
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from '../crdt/types'
import { syncedSignal } from '../synced-signal'

describe('syncedSignal — binding to a CRDT map entry', () => {
  it('seeds `initial` when the key is absent (create-if-missing) and reads it', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
    expect(s()).toBe('Untitled')
    expect(doc.getMap('pyreon').get('title')).toBe('Untitled')
  })

  it('uses the EXISTING CRDT value when the key is present — initial is ignored', () => {
    const doc = new FakeCrdtDoc()
    doc.transact(() => doc.getMap('pyreon').set('title', 'Pre-existing'))
    const s = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
    expect(s()).toBe('Pre-existing') // CRDT is authoritative
  })

  it('reads delegate to the base signal (() and .peek)', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'n', initial: 1 })
    expect(s()).toBe(1)
    expect(s.peek()).toBe(1)
  })

  it('forwards the internal _v field (compiler _bindText/_bindDirect fast-path contract)', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'n', initial: 5 })
    // The compiler reads `source._v` directly, bypassing the call. wrapSignal
    // forwards it to the base signal; a missing _v would render '' / undefined.
    expect((s as unknown as { _v: number })._v).toBe(5)
    s.set(9)
    expect((s as unknown as { _v: number })._v).toBe(9)
  })

  it('a local .set writes ONLY the CRDT, via exactly one transaction (no loop, no double-write)', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    // Count CRDT commits AFTER construction (so the seed isn't counted). If the
    // observer wrote back to the map, this would be 2+ (the genuine no-loop
    // proof — the subscriber count alone can't catch it because Object.is
    // dedupes a redundant base write for scalars).
    const commits = vi.fn()
    doc._onCommit(commits)

    s.set('b')

    expect(commits).toHaveBeenCalledTimes(1)
    expect(s()).toBe('b')
    expect(doc.getMap('pyreon').get('title')).toBe('b')
  })

  it('notifies the base signal exactly once per local write', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    let fires = 0
    s.subscribe(() => fires++)
    s.set('b')
    expect(fires).toBe(1)
    expect(s()).toBe('b')
  })

  it('.update routes through the CRDT', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, key: 'n', initial: 1 })
    s.update((n) => n + 1)
    expect(s()).toBe(2)
    expect(doc.getMap('pyreon').get('n')).toBe(2)
  })

  it('a remote change updates the signal and notifies exactly once, with no echo write back', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    let fires = 0
    s.subscribe(() => fires++)
    const commits = vi.fn()
    doc._onCommit(commits)

    // Simulate an inbound remote change.
    doc.transact(() => map.set('title', 'remote'), REMOTE_ORIGIN)

    expect(s()).toBe('remote')
    expect(fires).toBe(1)
    // Exactly the one remote transaction — the observer did NOT write back
    // (which would produce a second commit + a network echo).
    expect(commits).toHaveBeenCalledTimes(1)
  })

  it('ignores changes to OTHER keys in the same map', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    let fires = 0
    s.subscribe(() => fires++)
    doc.transact(() => map.set('other', 'x'))
    expect(fires).toBe(0)
    expect(s()).toBe('a')
  })

  it('.dispose detaches the observer (a later remote change no longer updates the signal); idempotent', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })
    s.dispose()
    s.dispose() // idempotent — no throw
    doc.transact(() => map.set('title', 'remote'), REMOTE_ORIGIN)
    expect(s()).toBe('a') // observer gone — stale, as designed for a disposed signal
  })

  it('respects a custom map name', () => {
    const doc = new FakeCrdtDoc()
    const s = syncedSignal({ doc, map: 'doc-meta', key: 'title', initial: 'a' })
    s.set('b')
    expect(doc.getMap('doc-meta').get('title')).toBe('b')
    expect(doc.getMap('pyreon').has('title')).toBe(false)
  })
})

describe('syncedSignal — one op → exactly one signal write (perf-counter, P0 acceptance)', () => {
  const sink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
  let saved: ((name: string, n?: number) => void) | undefined

  afterEach(() => {
    if (saved === undefined) delete sink.__pyreon_count__
    else sink.__pyreon_count__ = saved
  })

  it('a remote op fires exactly one reactivity.signalWrite', () => {
    const doc = new FakeCrdtDoc()
    const map = doc.getMap('pyreon')
    const s = syncedSignal({ doc, key: 'title', initial: 'a' })

    saved = sink.__pyreon_count__
    let writes = 0
    sink.__pyreon_count__ = (name) => {
      if (name === 'reactivity.signalWrite') writes++
    }

    doc.transact(() => map.set('title', 'b'), REMOTE_ORIGIN)

    expect(writes).toBe(1) // exactly one base.set drives the (one) DOM update
    expect(s()).toBe('b')
  })
})

describe('syncedSignal — peer convergence + echo prevention (connectFakeDocs)', () => {
  it('a local set on one peer propagates to the other; both converge; no echo loop', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    connectFakeDocs(a, b)
    const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
    const tb = syncedSignal({ doc: b, key: 'title', initial: '' })

    // Guard against an echo loop inflating writes: count peer-a commits.
    const aCommits = vi.fn()
    a._onCommit(aCommits)

    ta.set('hello')

    expect(ta()).toBe('hello')
    expect(tb()).toBe('hello')
    expect(aCommits).toHaveBeenCalledTimes(1) // exactly the local write — no echo back
  })

  it('converges under adversarial alternating writes (last write wins on both peers)', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    connectFakeDocs(a, b)
    const ta = syncedSignal({ doc: a, key: 'n', initial: 0 })
    const tb = syncedSignal({ doc: b, key: 'n', initial: 0 })

    ta.set(1)
    tb.set(2)
    ta.set(3)
    tb.set(4)
    ta.set(5)

    expect(ta()).toBe(5)
    expect(tb()).toBe(5) // both peers agree on the final value
  })

  it('seeds propagate: a peer constructed after a value exists adopts it', () => {
    const a = new FakeCrdtDoc()
    const b = new FakeCrdtDoc()
    connectFakeDocs(a, b)
    const ta = syncedSignal({ doc: a, key: 'title', initial: 'seed-from-a' })
    expect(ta()).toBe('seed-from-a')
    // b received the seed over the relay → a signal built on b adopts it.
    const tb = syncedSignal({ doc: b, key: 'title', initial: 'ignored' })
    expect(tb()).toBe('seed-from-a')
  })

  it('LOCAL_ORIGIN is the default transaction origin for bridge writes', () => {
    const doc = new FakeCrdtDoc()
    const seen: unknown[] = []
    doc._onCommit((_e, origin) => seen.push(origin))
    const s = syncedSignal({ doc, key: 'n', initial: 0 })
    s.set(1)
    // Seed + the set are both LOCAL-origin.
    expect(seen).toEqual([LOCAL_ORIGIN, LOCAL_ORIGIN])
  })
})
