// useWebSocket had no web half — the third hook in this arc with that gap,
// after useGeolocation and useDatabase.
//
// PMTC lowers `useWebSocket(url)` to `PyreonWebSocket` on BOTH native targets
// and synthesizes an auto-connect on mount, so the hook was fully real on iOS
// and Android and did not exist on web. Because PMTC matches hook NAMES and
// never resolves imports, `import { useWebSocket } from '@pyreon/hooks'`
// compiled natively while being unresolvable in any web build — and the
// compiler's own `lowered-hooks-typecheck` fixture writes exactly that import.
//
// These tests assert the SHARED-CODE CONTRACT, not just that the hook works:
// the member names and their semantics have to match `PyreonWebSocket`, or one
// component body cannot read the same fields on three targets.

import { describe, expect, it, vi } from 'vitest'
import { useWebSocket } from '../useWebSocket'

/** Minimal WebSocket double. Only what the hook actually drives. */
class FakeSocket {
  static instances: FakeSocket[] = []
  static readonly OPEN = 1
  static readonly CLOSED = 3
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) {
    FakeSocket.instances.push(this)
  }
  send(t: string) {
    this.sent.push(t)
  }
  close() {
    this.closed = true
    this.readyState = FakeSocket.CLOSED
  }
  // Test drivers
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  deliver(data: unknown) {
    this.onmessage?.({ data })
  }
  fail() {
    this.onerror?.()
  }
}

function withFakeSocket<T>(run: () => T): T {
  const prev = (globalThis as { WebSocket?: unknown }).WebSocket
  FakeSocket.instances = []
  ;(globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket
  try {
    return run()
  } finally {
    ;(globalThis as { WebSocket?: unknown }).WebSocket = prev
  }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]!

describe('useWebSocket — web half', () => {
  it('auto-connects on mount, matching the emitters synthesized connect', () => {
    withFakeSocket(() => {
      useWebSocket('wss://x.dev/feed')
      expect(FakeSocket.instances).toHaveLength(1)
      expect(last().url).toBe('wss://x.dev/feed')
    })
  })

  it('autoConnect:false does not open a socket', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev', { autoConnect: false })
      expect(FakeSocket.instances).toHaveLength(0)
      ws.connect()
      expect(FakeSocket.instances).toHaveLength(1)
    })
  })

  it('isConnected tracks open, and the fields are LIVE getters not frozen values', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      // A component body runs once. If these were plain values captured at
      // return time, every read below would keep the mount-time result.
      expect(ws.isConnected).toBe(false)
      last().open()
      expect(ws.isConnected).toBe(true)
    })
  })

  it('lastMessage and messages mirror the native container', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      last().open()
      expect(ws.lastMessage).toBeNull()
      expect(ws.messages).toEqual([])
      last().deliver('a')
      last().deliver('b')
      expect(ws.lastMessage).toBe('b')
      expect(ws.messages).toEqual(['a', 'b'])
    })
  })

  it('IGNORES a binary frame — the native half is text-only', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      last().open()
      last().deliver(new ArrayBuffer(4))
      // Coercing would yield "[object ArrayBuffer]" — data the native side
      // could never produce, i.e. a target difference disguised as a message.
      expect(ws.messages).toEqual([])
      expect(ws.lastMessage).toBeNull()
    })
  })

  it('send only writes on an OPEN socket', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      ws.send('too-early') // pre-open would throw InvalidStateError natively
      expect(last().sent).toEqual([])
      last().open()
      ws.send('ok')
      expect(last().sent).toEqual(['ok'])
    })
  })

  it('error is a STRING and is cleared on open', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      last().fail()
      // A string, not an Error: the compiler types websocket.error as string,
      // and an interpolated Swift Optional would render Optional("…").
      expect(typeof ws.error).toBe('string')
      expect(ws.error).toContain('[Pyreon]')
      expect(ws.isConnected).toBe(false)
      last().open()
      expect(ws.error).toBeNull()
    })
  })

  it('a synchronous constructor throw does not wedge the lifecycle', () => {
    const prev = (globalThis as { WebSocket?: unknown }).WebSocket
    ;(globalThis as { WebSocket?: unknown }).WebSocket = function () {
      throw new TypeError('bad url')
    }
    try {
      const ws = useWebSocket('not a url')
      expect(ws.error).toContain('[Pyreon]')
      // The real bug this guards: leaving `open` true would make every later
      // connect() a silent no-op, so the socket could never be retried.
      ;(globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket
      FakeSocket.instances = []
      ws.connect()
      expect(FakeSocket.instances).toHaveLength(1)
    } finally {
      ;(globalThis as { WebSocket?: unknown }).WebSocket = prev
    }
  })

  it('close drops handlers BEFORE closing so a late frame cannot write', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      const sock = last()
      sock.open()
      sock.deliver('before')
      ws.close()
      expect(sock.closed).toBe(true)
      // A queued frame arriving after close must not reach a disposed
      // component's signals.
      sock.deliver('after')
      expect(ws.messages).toEqual(['before'])
      expect(ws.isConnected).toBe(false)
    })
  })

  it('close is safe twice, and connect is guarded against double-open', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      expect(FakeSocket.instances).toHaveLength(1)
      ws.connect() // native connect() early-returns on the lifecycle flag
      expect(FakeSocket.instances).toHaveLength(1)
      ws.close()
      expect(() => ws.close()).not.toThrow()
    })
  })

  it('is a no-op when WebSocket is undefined (SSR / non-browser)', () => {
    const prev = (globalThis as { WebSocket?: unknown }).WebSocket
    delete (globalThis as { WebSocket?: unknown }).WebSocket
    try {
      const ws = useWebSocket('wss://x.dev')
      expect(ws.isConnected).toBe(false)
      expect(() => ws.send('x')).not.toThrow()
      expect(() => ws.close()).not.toThrow()
    } finally {
      ;(globalThis as { WebSocket?: unknown }).WebSocket = prev
    }
  })
})

describe('shared-code contract with PyreonWebSocket', () => {
  it('exposes exactly the members the native container does', () => {
    withFakeSocket(() => {
      const ws = useWebSocket('wss://x.dev')
      // Drift here means one component body can no longer read the same
      // fields on web, iOS and Android — which is the entire point.
      for (const member of ['lastMessage', 'messages', 'isConnected', 'error']) {
        expect(member in ws, `missing field ${member}`).toBe(true)
      }
      for (const method of ['connect', 'send', 'close']) {
        expect(typeof (ws as unknown as Record<string, unknown>)[method]).toBe('function')
      }
    })
  })
})
