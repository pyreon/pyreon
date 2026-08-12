import { describe, expect, it } from 'vitest'
import { type PyreonCrdtOp, PyreonCrdtDoc } from '../crdt/pyreon-adapter'
import { REMOTE_ORIGIN } from '../crdt/types'

// The pure-TS LWW engine that makes @pyreon/sync multiplatform 1:1: the SAME
// merge math runs on web AND (via PMTC) on iOS/Android, so peers converge over
// one simple protocol. These tests prove the convergence CONTRACT a native peer
// must also satisfy: deterministic LWW, order/duplicate-insensitive merge
// (offline-then-reconnect), and no echo re-broadcast.

/** In-memory transport: relay LOCAL ops A↔B, and do an initial state exchange —
 *  the exact shape the real WebSocket transport implements. */
function connect(a: PyreonCrdtDoc, b: PyreonCrdtDoc): { disconnect: () => void } {
  let connected = true
  const relay = (to: PyreonCrdtDoc) => (ops: readonly PyreonCrdtOp[]) => {
    if (!connected) return
    to.applyOps(ops, REMOTE_ORIGIN)
  }
  const offA = a._onOps(relay(b))
  const offB = b._onOps(relay(a))
  // Initial sync: exchange full state (each register carries its own stamp, so
  // this converges regardless of who is ahead).
  b.applyOps(a.encodeState(), REMOTE_ORIGIN)
  a.applyOps(b.encodeState(), REMOTE_ORIGIN)
  return {
    disconnect() {
      connected = false
      offA()
      offB()
    },
  }
}

const val = (doc: PyreonCrdtDoc, map: string, key: string) => doc.getMap(map).get(key)

describe('PyreonCrdtAdapter — LWW convergence (the multiplatform engine)', () => {
  it('relays a local write to the peer', () => {
    const a = new PyreonCrdtDoc('actor-a')
    const b = new PyreonCrdtDoc('actor-b')
    connect(a, b)
    a.transact(() => a.getMap('m').set('name', 'Alice'))
    expect(val(b, 'm', 'name')).toBe('Alice')
  })

  it('fires the peer observer under REMOTE origin', () => {
    const a = new PyreonCrdtDoc('actor-a')
    const b = new PyreonCrdtDoc('actor-b')
    connect(a, b)
    let seenOrigin: unknown
    b.getMap('m').observe((_keys, origin) => {
      seenOrigin = origin
    })
    a.transact(() => a.getMap('m').set('x', 1))
    expect(seenOrigin).toBe(REMOTE_ORIGIN)
  })

  it('does NOT echo a received update back (no re-broadcast)', () => {
    const a = new PyreonCrdtDoc('actor-a')
    const b = new PyreonCrdtDoc('actor-b')
    connect(a, b)
    let aOpCount = 0
    a._onOps(() => {
      aOpCount++
    })
    b.transact(() => b.getMap('m').set('y', 2)) // B writes → relays to A
    // A merged it but must not re-broadcast (applyOps emits no ops).
    expect(val(a, 'm', 'y')).toBe(2)
    expect(aOpCount).toBe(0)
  })

  it('CONVERGES after concurrent OFFLINE writes — deterministic LWW winner on BOTH', () => {
    const a = new PyreonCrdtDoc('actor-a')
    const b = new PyreonCrdtDoc('actor-z') // 'z' > 'a' → B wins an equal-clock tie
    // Offline: each writes the SAME key independently (concurrent, equal clock 1).
    a.transact(() => a.getMap('m').set('title', 'from-A'))
    b.transact(() => b.getMap('m').set('title', 'from-B'))
    expect(val(a, 'm', 'title')).toBe('from-A')
    expect(val(b, 'm', 'title')).toBe('from-B')
    // Reconnect → exchange state → both converge to the SAME winner (actor 'z').
    connect(a, b)
    expect(val(a, 'm', 'title')).toBe('from-B')
    expect(val(b, 'm', 'title')).toBe('from-B')
    expect(val(a, 'm', 'title')).toBe(val(b, 'm', 'title'))
  })

  it('a later write (higher clock) wins over an earlier one regardless of actor', () => {
    const a = new PyreonCrdtDoc('actor-z') // higher id
    const b = new PyreonCrdtDoc('actor-a')
    connect(a, b)
    a.transact(() => a.getMap('m').set('k', 'first')) // clock 1 (actor z)
    b.transact(() => b.getMap('m').set('k', 'second')) // clock 2 (advanced past 1)
    // Higher clock wins even though actor 'a' < 'z'.
    expect(val(a, 'm', 'k')).toBe('second')
    expect(val(b, 'm', 'k')).toBe('second')
  })

  it('merge is order/duplicate-insensitive (state-based CvRDT)', () => {
    const a = new PyreonCrdtDoc('actor-a')
    const b = new PyreonCrdtDoc('actor-b')
    a.transact(() => a.getMap('m').set('a', 1))
    a.transact(() => a.getMap('m').set('b', 2))
    const state = a.encodeState()
    // Apply the same state TWICE, reversed — must be idempotent + order-free.
    b.applyOps([...state].reverse(), REMOTE_ORIGIN)
    b.applyOps(state, REMOTE_ORIGIN)
    expect(val(b, 'm', 'a')).toBe(1)
    expect(val(b, 'm', 'b')).toBe(2)
    expect(b.getMap('m').keys().sort()).toEqual(['a', 'b'])
  })

  it('an equal-value LWW write is a no-op (no observer fire)', () => {
    const a = new PyreonCrdtDoc('actor-a')
    let fires = 0
    a.getMap('m').observe(() => {
      fires++
    })
    a.transact(() => a.getMap('m').set('k', 'v'))
    a.transact(() => a.getMap('m').set('k', 'v')) // same value → no delta
    expect(fires).toBe(1)
  })
})
