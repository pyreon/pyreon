import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createActorId,
  type PyreonCrdtOp,
  PyreonCrdtAdapter,
  PyreonCrdtDoc,
  pyreonAdapter,
} from '../crdt/pyreon-adapter'
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

describe('public factories', () => {
  it('pyreonAdapter() creates docs with a fresh actor; createDoc round-trips', () => {
    const adapter = pyreonAdapter()
    expect(adapter).toBeInstanceOf(PyreonCrdtAdapter)
    const doc = adapter.createDoc()
    doc.transact(() => doc.getMap('m').set('k', 'v'))
    expect(doc.getMap('m').get('k')).toBe('v')
  })

  it('pyreonAdapter(actor) uses the given actor as the LWW tie-breaker', () => {
    // Equal-clock concurrent write: higher actor wins deterministically.
    const a = pyreonAdapter('a1').createDoc() as PyreonCrdtDoc
    const b = pyreonAdapter('z9').createDoc() as PyreonCrdtDoc
    a.transact(() => a.getMap('doc').set('t', 'from-A'))
    b.transact(() => b.getMap('doc').set('t', 'from-B'))
    connect(a, b) // reconnect → exchange state → converge on the deterministic winner
    expect(a.getMap('doc').get('t')).toBe('from-B') // z9 > a1
    expect(b.getMap('doc').get('t')).toBe('from-B')
  })

  it('createActorId returns a non-empty unique id', () => {
    const id1 = createActorId()
    const id2 = createActorId()
    expect(id1).toBeTruthy()
    expect(typeof id1).toBe('string')
    expect(id1).not.toBe(id2)
  })

  it('createActorId falls back to a timestamp id when crypto.randomUUID is absent', () => {
    vi.stubGlobal('crypto', {}) // no randomUUID → fallback branch
    try {
      expect(createActorId()).toMatch(/^a-/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a direct map.set() (no explicit transact) auto-wraps and still writes + fires', () => {
    const a = new PyreonCrdtDoc('a1')
    let fired = 0
    a.getMap('m').observe(() => {
      fired++
    })
    a.getMap('m').set('k', 'v') // depth 0 → _applyLocalWrite auto-wraps in a transact
    expect(a.getMap('m').get('k')).toBe('v')
    expect(fired).toBe(1)
  })

  it('applyOps is a no-op mid-local-transaction (defensive depth guard)', () => {
    const a = new PyreonCrdtDoc('a1')
    const b = new PyreonCrdtDoc('b1')
    b.transact(() => b.getMap('m').set('k', 'peer'))
    const remoteOps = b.encodeState()
    // Inside a local transact, depth !== 0 → the remote merge is refused.
    a.transact(() => {
      a.getMap('m').set('local', 1)
      a.applyOps(remoteOps, REMOTE_ORIGIN) // depth !== 0 → guarded → ignored
    })
    expect(a.getMap('m').get('k')).toBeUndefined() // remote op was NOT merged
    expect(a.getMap('m').get('local')).toBe(1)
  })

  it('nested transact commits once at the outer boundary (inner depth !== 0)', () => {
    const a = new PyreonCrdtDoc('a1')
    let relays = 0
    a._onOps(() => {
      relays++
    })
    a.transact(() => {
      a.getMap('m').set('a', 1)
      a.transact(() => a.getMap('m').set('b', 2)) // nested → depth 2, no re-commit here
    })
    expect(a.getMap('m').get('a')).toBe(1)
    expect(a.getMap('m').get('b')).toBe(2)
    expect(relays).toBe(1) // ONE commit at the outer boundary, both writes in it
  })

  it('a destroyed doc ignores further transact/applyOps (no throw, no writes)', () => {
    const a = new PyreonCrdtDoc('a1')
    a.transact(() => a.getMap('m').set('k', 'v'))
    a.destroy()
    expect(() => a.transact(() => a.getMap('m').set('k2', 'v2'))).not.toThrow()
    expect(() =>
      a.applyOps([{ map: 'm', key: 'x', value: 1, clock: 9, actor: 'z' }], REMOTE_ORIGIN),
    ).not.toThrow()
    expect(a.getMap('m').get('k2')).toBeUndefined() // destroyed → guarded, nothing landed
  })
})

describe('createActorId — collision resistance (regression)', () => {
  const realCrypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: realCrypto,
      configurable: true,
      writable: true,
    })
  })

  /** Force the LAST-RESORT branch: no randomUUID, no getRandomValues. */
  function useLastResortBranch() {
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
      writable: true,
    })
  }

  it('never repeats within a process, even with Date.now() frozen', () => {
    // The pre-fix form was `a-${Date.now()}-${Math.random()}`. Freezing the
    // clock leaves ONLY Math.random() separating ids — the exact birthday
    // collision the catalog names. The monotonic counter makes it impossible.
    useLastResortBranch()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      const ids = new Set<string>()
      for (let i = 0; i < 10_000; i++) ids.add(createActorId())
      expect(ids.size).toBe(10_000)
    } finally {
      spy.mockRestore()
    }
  })

  it('still never repeats when Math.random() is degenerate', () => {
    // A hostile/broken Math.random is survivable because the counter alone
    // separates same-process ids — random only has to separate PROCESSES.
    useLastResortBranch()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) ids.add(createActorId())
      expect(ids.size).toBe(1000)
    } finally {
      now.mockRestore()
      rnd.mockRestore()
    }
  })

  it('prefers crypto.randomUUID when available', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'uuid-from-crypto' },
      configurable: true,
      writable: true,
    })
    expect(createActorId()).toBe('uuid-from-crypto')
  })

  it('uses getRandomValues when randomUUID is absent (non-secure context)', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (a: Uint8Array) => {
          a.fill(0xab)
          return a
        },
      },
      configurable: true,
      writable: true,
    })
    expect(createActorId()).toBe(`a-${'ab'.repeat(16)}`)
  })
})
