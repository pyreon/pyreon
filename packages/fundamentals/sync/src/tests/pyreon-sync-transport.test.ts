import { describe, expect, it } from 'vitest'
import { PyreonCrdtDoc } from '../crdt/pyreon-adapter'
import { type SyncChannel, connectPyreonSync } from '../crdt/pyreon-sync-transport'

// The pure-JS client transport that runs identically on web and in a native JS
// runtime. These prove the wire-level sync (JSON op exchange) converges — the
// same contract a native peer satisfies.

/** Two in-memory channels wired as a bidirectional pair (a forwarding relay
 *  stand-in): a message A sends arrives at B and vice versa. `open()` fires both
 *  `onOpen` handlers (call AFTER both docs are connected). */
function memoryPair(): { a: SyncChannel; b: SyncChannel; open: () => void } {
  let aMsg: ((d: string) => void) | undefined
  let bMsg: ((d: string) => void) | undefined
  let aOpen: (() => void) | undefined
  let bOpen: (() => void) | undefined
  let live = true
  const a: SyncChannel = {
    send: (d) => {
      if (live) bMsg?.(d)
    },
    onMessage: (cb) => (aMsg = cb),
    onOpen: (cb) => (aOpen = cb),
    close: () => (live = false),
  }
  const b: SyncChannel = {
    send: (d) => {
      if (live) aMsg?.(d)
    },
    onMessage: (cb) => (bMsg = cb),
    onOpen: (cb) => (bOpen = cb),
    close: () => (live = false),
  }
  return {
    a,
    b,
    open: () => {
      aOpen?.()
      bOpen?.()
    },
  }
}

const get = (d: PyreonCrdtDoc, m: string, k: string) => d.getMap(m).get(k)

describe('pyreon sync transport — wire-level convergence', () => {
  it('exchanges initial state on open (a pre-existing write reaches the peer)', () => {
    const a = new PyreonCrdtDoc('a1')
    const b = new PyreonCrdtDoc('b1')
    a.transact(() => a.getMap('m').set('x', 'hello')) // before connect → in A's state dump
    const pair = memoryPair()
    connectPyreonSync(a, pair.a)
    connectPyreonSync(b, pair.b)
    pair.open()
    expect(get(b, 'm', 'x')).toBe('hello')
  })

  it('relays live local writes after open (both directions)', () => {
    const a = new PyreonCrdtDoc('a1')
    const b = new PyreonCrdtDoc('b1')
    const pair = memoryPair()
    connectPyreonSync(a, pair.a)
    connectPyreonSync(b, pair.b)
    pair.open()
    a.transact(() => a.getMap('m').set('fromA', 1))
    b.transact(() => b.getMap('m').set('fromB', 2))
    expect(get(b, 'm', 'fromA')).toBe(1)
    expect(get(a, 'm', 'fromB')).toBe(2)
  })

  it('CONVERGES after concurrent offline writes (reconnect → deterministic winner on both)', () => {
    const a = new PyreonCrdtDoc('a1')
    const b = new PyreonCrdtDoc('z9') // 'z9' > 'a1' → B wins an equal-clock tie
    // Offline (not connected): each writes the same key.
    a.transact(() => a.getMap('doc').set('title', 'from-A'))
    b.transact(() => b.getMap('doc').set('title', 'from-B'))
    // Connect + open → state exchange converges to the SAME winner on both.
    const pair = memoryPair()
    connectPyreonSync(a, pair.a)
    connectPyreonSync(b, pair.b)
    pair.open()
    expect(get(a, 'doc', 'title')).toBe('from-B')
    expect(get(b, 'doc', 'title')).toBe('from-B')
    expect(get(a, 'doc', 'title')).toBe(get(b, 'doc', 'title'))
  })

  it('ignores a malformed inbound message (never throws)', () => {
    const a = new PyreonCrdtDoc('a1')
    let onMsg: ((d: string) => void) | undefined
    const ch: SyncChannel = {
      send: () => {},
      onMessage: (cb) => (onMsg = cb),
      onOpen: () => {},
      close: () => {},
    }
    connectPyreonSync(a, ch)
    expect(() => onMsg?.('not json{')).not.toThrow()
    expect(() => onMsg?.('{"nope":1}')).not.toThrow()
  })

  it('does not re-broadcast a received update (no echo)', () => {
    const a = new PyreonCrdtDoc('a1')
    const b = new PyreonCrdtDoc('b1')
    const pair = memoryPair()
    let aSends = 0
    // wrap A's send to count outbound frames
    const countingA: SyncChannel = {
      send: (d) => {
        aSends++
        pair.a.send(d)
      },
      onMessage: (cb) => pair.a.onMessage(cb),
      onOpen: (cb) => pair.a.onOpen(cb),
      close: () => pair.a.close(),
    }
    connectPyreonSync(a, countingA)
    connectPyreonSync(b, pair.b)
    pair.open() // A sends its (empty) state = 1 frame
    const afterOpen = aSends
    b.transact(() => b.getMap('m').set('y', 2)) // B writes → A merges
    // A must NOT emit a frame for the merge it received.
    expect(get(a, 'm', 'y')).toBe(2)
    expect(aSends).toBe(afterOpen)
  })
})
