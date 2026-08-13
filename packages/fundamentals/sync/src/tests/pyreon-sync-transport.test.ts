import { describe, expect, it } from 'vitest'
import { PyreonCrdtDoc } from '../crdt/pyreon-adapter'
import { type SyncChannel, connectPyreonSync, webSocketChannel } from '../crdt/pyreon-sync-transport'
import { syncedSignal } from '../synced-signal'

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

  // The full app-facing stack, all pure-JS: syncedSignal (reactive bridge) over
  // the pyreonAdapter engine over the transport. This is exactly what a native
  // JS runtime hosts — signal.set → CRDT → wire → CRDT → observer → peer signal.
  it('END-TO-END: syncedSignal over pyreonAdapter propagates across peers', () => {
    const docA = new PyreonCrdtDoc('a1')
    const docB = new PyreonCrdtDoc('b1')
    const titleA = syncedSignal<string>({ doc: docA, key: 'title', initial: '' })
    const titleB = syncedSignal<string>({ doc: docB, key: 'title', initial: '' })
    const pair = memoryPair()
    connectPyreonSync(docA, pair.a)
    connectPyreonSync(docB, pair.b)
    pair.open()

    titleA.set('Roadmap')
    expect(titleB()).toBe('Roadmap') // signal→CRDT→wire→CRDT→observer→signal

    titleB.set('Shipped')
    expect(titleA()).toBe('Shipped') // and back
  })
})

describe('webSocketChannel — WebSocket resolution', () => {
  class FakeWS {
    static last: FakeWS | undefined
    onmessage: ((ev: { data?: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    sent: string[] = []
    closed = false
    constructor(public url: string) {
      FakeWS.last = this
    }
    send(d: string): void {
      this.sent.push(d)
    }
    close(): void {
      this.closed = true
    }
  }

  it('builds a channel over an injected WebSocket impl and wires send/onMessage/onOpen/close', () => {
    const ch = webSocketChannel('ws://relay', FakeWS as unknown as new (url: string) => object as never)
    const ws = FakeWS.last!
    let opened = false
    const received: string[] = []
    ch.onOpen(() => {
      opened = true
    })
    ch.onMessage((m) => received.push(m))
    ws.onopen?.() // socket connects
    ws.onmessage?.({ data: 'hello' }) // inbound frame
    ws.onmessage?.({ data: undefined }) // nullish data → coerced to '' (the ?? branch)
    ch.send('frame')
    ch.close()
    expect(opened).toBe(true)
    expect(received).toEqual(['hello', ''])
    expect(ws.sent).toEqual(['frame'])
    expect(ws.closed).toBe(true)
  })

  it('uses globalThis.WebSocket when no impl is injected', () => {
    const g = globalThis as { WebSocket?: unknown }
    const saved = g.WebSocket
    try {
      g.WebSocket = FakeWS
      const ch = webSocketChannel('ws://global')
      expect(FakeWS.last?.url).toBe('ws://global')
      ch.close()
    } finally {
      if (saved === undefined) delete g.WebSocket
      else g.WebSocket = saved
    }
  })

  it('throws a clear [Pyreon] error when no WebSocket impl is available', () => {
    const saved = (globalThis as { WebSocket?: unknown }).WebSocket
    try {
      delete (globalThis as { WebSocket?: unknown }).WebSocket
      expect(() => webSocketChannel('ws://relay')).toThrow(/\[Pyreon\] sync: no WebSocket/)
    } finally {
      if (saved !== undefined) (globalThis as { WebSocket?: unknown }).WebSocket = saved
    }
  })
})
