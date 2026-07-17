import { signal } from '@pyreon/reactivity'
import * as Y from 'yjs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type DocTransportSyncState,
  docHasUnsyncedTransport,
  registerDocTransport,
  whenDocSynced,
} from '../crdt/doc-sync'
import { REMOTE_ORIGIN } from '../crdt/types'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { DEFAULT_MAP, syncedSignal } from '../synced-signal'

// Regression lock for issue #2380: `syncedSignal`'s create-if-missing seed used
// to write `map.set(key, initial)` the moment the key was locally absent —
// BEFORE the transport synced. Two fresh peers both seed, and a peer's seed that
// is still causally CONCURRENT with another peer's real `.set()` can clobber that
// real value on a RANDOM-clientId `Y.Map` tie-break (permanently). The fix defers
// the seed until first sync when a transport is attached. These tests prove the
// semantic INDEPENDENT of any timing — the CRDT-level proof the load-dependent
// `ws-relay` integration flake could never give.

/**
 * A minimal controllable transport sync-state — registers on a doc as UNSYNCED,
 * flip `markSynced()` to complete its first "sync round-trip". Mirrors what the
 * real WebSocket transport registers, but with deterministic manual control.
 */
function fakeTransport(doc: ReturnType<typeof createYjsDoc>) {
  const s = signal(false)
  const state: DocTransportSyncState = {
    get synced() {
      return s.peek()
    },
    onSynced(cb) {
      if (s.peek()) {
        cb()
        return () => {}
      }
      const off = s.subscribe(() => {
        if (s.peek()) {
          off()
          cb()
        }
      })
      return off
    },
  }
  const detach = registerDocTransport(doc, state)
  return { markSynced: () => s.set(true), detach, state }
}

describe('#2380 — CRDT-level mechanism (raw Y.Doc, the issue repro)', () => {
  // Verbatim the issue's zero-network repro: a pre-sync double-seed CLOBBERS on
  // one clientId ordering; deferring the seed converges on BOTH orderings.
  function trial(clientIdA: number, clientIdB: number, preSyncSeed: boolean) {
    const a = new Y.Doc()
    a.clientID = clientIdA
    const b = new Y.Doc()
    b.clientID = clientIdB
    if (preSyncSeed) {
      a.getMap('root').set('title', '') // create-if-missing seed, peer A
      b.getMap('root').set('title', '') // create-if-missing seed, peer B
    }
    a.getMap('root').set('title', 'hello over WS') // the meaningful write, still unsynced
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a)) // the handshake finally lands
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    return { a: a.getMap('root').get('title'), b: b.getMap('root').get('title') }
  }

  it('a PRE-SYNC seed clobbers the real value on one clientId ordering', () => {
    // This is the BUG the fix removes — asserted here so the mechanism is documented.
    expect(trial(1, 2, true)).toEqual({ a: '', b: '' }) // A's write LOST
    expect(trial(2, 1, true)).toEqual({ a: 'hello over WS', b: 'hello over WS' })
  })

  it('a DEFERRED seed (none before sync) converges on BOTH orderings', () => {
    expect(trial(1, 2, false)).toEqual({ a: 'hello over WS', b: 'hello over WS' })
    expect(trial(2, 1, false)).toEqual({ a: 'hello over WS', b: 'hello over WS' })
  })
})

describe('#2380 — syncedSignal defers its seed until first sync', () => {
  const disposers: Array<() => void> = []
  afterEach(() => {
    for (const d of disposers.splice(0)) d()
  })

  // The semantic proof through the REAL `syncedSignal` + a controllable transport:
  // with the seed deferred, a fresh peer's default NEVER clobbers the real value,
  // regardless of the random clientId ordering.
  function converge(clientIdA: number, clientIdB: number) {
    const a = createYjsDoc()
    a.yDoc.clientID = clientIdA
    const b = createYjsDoc()
    b.yDoc.clientID = clientIdB
    const ta = fakeTransport(a) // attached, UNSYNCED → seed deferred
    const tb = fakeTransport(b)
    const sa = syncedSignal({ doc: a, key: 'title', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'title', initial: '' })
    disposers.push(sa.dispose, sb.dispose, ta.detach, tb.detach)

    sa.set('hello over WS') // A's real write (writes the CRDT immediately)

    // The sync round-trip: exchange full state, THEN mark synced (the order the
    // real transport uses — apply the peer's update, then flip `synced`).
    Y.applyUpdate(b.yDoc, Y.encodeStateAsUpdate(a.yDoc), REMOTE_ORIGIN)
    Y.applyUpdate(a.yDoc, Y.encodeStateAsUpdate(b.yDoc), REMOTE_ORIGIN)
    ta.markSynced() // A's deferred seed re-checks: 'title' present → skip
    tb.markSynced() // B's deferred seed re-checks: 'title' present → skip

    return { a: sa(), b: sb() }
  }

  it('a fresh peer default does NOT clobber a real value — clientId (1,2)', () => {
    expect(converge(1, 2)).toEqual({ a: 'hello over WS', b: 'hello over WS' })
  })

  it('a fresh peer default does NOT clobber a real value — clientId (2,1)', () => {
    expect(converge(2, 1)).toEqual({ a: 'hello over WS', b: 'hello over WS' })
  })

  it('DEFERS the CRDT write while the transport is unsynced (optimistic local value)', () => {
    const doc = createYjsDoc()
    const t = fakeTransport(doc)
    const s = syncedSignal({ doc, key: 'title', initial: 'draft' })
    disposers.push(s.dispose, t.detach)

    // Optimistic read shows `initial`, but the CRDT has NOT been written yet.
    expect(s()).toBe('draft')
    expect(doc.getMap(DEFAULT_MAP).has('title')).toBe(false)

    // On sync (empty room), the seed lands.
    t.markSynced()
    expect(doc.getMap(DEFAULT_MAP).has('title')).toBe(true)
    expect(doc.getMap(DEFAULT_MAP).get('title')).toBe('draft')
    expect(s()).toBe('draft')
  })

  it('does NOT seed when a peer value arrived DURING sync', () => {
    const doc = createYjsDoc()
    const t = fakeTransport(doc)
    const s = syncedSignal({ doc, key: 'title', initial: 'my-default' })
    disposers.push(s.dispose, t.detach)

    // A peer value lands before sync completes (as the transport's applyUpdate
    // would): the observer populates `base`.
    doc.transact(() => doc.getMap(DEFAULT_MAP).set('title', 'from-peer'), REMOTE_ORIGIN)
    expect(s()).toBe('from-peer')

    // Sync completes → the deferred seed re-checks, finds the key present, SKIPS.
    t.markSynced()
    expect(doc.getMap(DEFAULT_MAP).get('title')).toBe('from-peer') // not clobbered
    expect(s()).toBe('from-peer')
  })

  it('cancels the pending seed when disposed BEFORE sync (no write after dispose)', () => {
    const doc = createYjsDoc()
    const t = fakeTransport(doc)
    const s = syncedSignal({ doc, key: 'title', initial: 'draft' })
    disposers.push(t.detach)

    expect(doc.getMap(DEFAULT_MAP).has('title')).toBe(false)
    s.dispose() // dispose before the transport ever syncs
    t.markSynced() // would have fired the deferred seed — but it was canceled
    expect(doc.getMap(DEFAULT_MAP).has('title')).toBe(false) // no write after dispose
  })

  it('seeds IMMEDIATELY when no transport is attached (provably alone)', () => {
    const doc = createYjsDoc()
    const s = syncedSignal({ doc, key: 'title', initial: 'solo' })
    disposers.push(s.dispose)
    // No transport → the immediate branch: written synchronously at construction.
    expect(doc.getMap(DEFAULT_MAP).get('title')).toBe('solo')
  })

  it('seeds IMMEDIATELY when the attached transport is ALREADY synced', () => {
    const doc = createYjsDoc()
    const t = fakeTransport(doc)
    t.markSynced() // synced BEFORE the signal is constructed
    const s = syncedSignal({ doc, key: 'title', initial: 'ready' })
    disposers.push(s.dispose, t.detach)
    expect(doc.getMap(DEFAULT_MAP).get('title')).toBe('ready') // immediate seed
  })
})

describe('#2380 — doc↔transport sync seam', () => {
  it('a doc with no transport reports "synced/alone"', () => {
    const doc = createYjsDoc()
    expect(docHasUnsyncedTransport(doc)).toBe(false)
    // whenDocSynced fires synchronously when there is nothing to wait for.
    let fired = false
    const cancel = whenDocSynced(doc, () => {
      fired = true
    })
    expect(fired).toBe(true)
    expect(() => cancel()).not.toThrow() // the no-op cancel is safe to call
  })

  it('reports an unsynced transport, and fires whenDocSynced once it syncs', () => {
    const doc = createYjsDoc()
    const s = signal(false)
    const detach = registerDocTransport(doc, {
      get synced() {
        return s.peek()
      },
      onSynced(cb) {
        if (s.peek()) {
          cb()
          return () => {}
        }
        return s.subscribe(() => {
          if (s.peek()) cb()
        })
      },
    })
    expect(docHasUnsyncedTransport(doc)).toBe(true)

    let fired = false
    whenDocSynced(doc, () => {
      fired = true
    })
    expect(fired).toBe(false) // deferred — the transport is not synced yet
    s.set(true)
    expect(fired).toBe(true)
    expect(docHasUnsyncedTransport(doc)).toBe(false)
    detach()
  })

  it('whenDocSynced cancel drops the pending callback', () => {
    const doc = createYjsDoc()
    const s = signal(false)
    registerDocTransport(doc, {
      get synced() {
        return s.peek()
      },
      onSynced(cb) {
        return s.subscribe(() => {
          if (s.peek()) cb()
        })
      },
    })
    let fired = false
    const cancel = whenDocSynced(doc, () => {
      fired = true
    })
    cancel()
    cancel() // idempotent — a second cancel is a no-op
    s.set(true)
    expect(fired).toBe(false) // canceled before sync → never fires
  })

  it('waits for MULTIPLE unsynced transports (WS + BroadcastChannel case)', () => {
    const doc = createYjsDoc()
    const s1 = signal(false)
    const s2 = signal(false)
    const mk = (s: ReturnType<typeof signal<boolean>>): DocTransportSyncState => ({
      get synced() {
        return s.peek()
      },
      onSynced(cb) {
        if (s.peek()) {
          cb()
          return () => {}
        }
        return s.subscribe(() => {
          if (s.peek()) cb()
        })
      },
    })
    registerDocTransport(doc, mk(s1))
    registerDocTransport(doc, mk(s2))

    let fired = false
    whenDocSynced(doc, () => {
      fired = true
    })
    s1.set(true)
    expect(fired).toBe(false) // one still unsynced
    s2.set(true)
    expect(fired).toBe(true) // both synced → fire
    // A stray re-notify from an already-synced transport after we're done is a
    // no-op (the `if (done) return` guard) — never re-fires cb.
    let fires = 0
    whenDocSynced(doc, () => fires++) // already synced → fires once, synchronously
    expect(fires).toBe(1)
    s1.trigger()
    expect(fires).toBe(1)
  })
})
