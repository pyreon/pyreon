import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import {
  QueryClientProvider,
  type UseSSEResult,
  type UseSubscriptionResult,
  useSSE,
  useSubscription,
} from '../index'
import { computeReconnectDelay } from '../reconnect'

// ─── Minimal WebSocket / EventSource doubles ─────────────────────────────────

type Listener = ((event: unknown) => void) | null

let sockets: FakeWS[] = []
class FakeWS {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = 0
  onopen: Listener = null
  onmessage: Listener = null
  onclose: Listener = null
  onerror: Listener = null
  close = vi.fn(() => {
    this.readyState = 3
  })
  send = vi.fn()
  constructor(public url: string) {
    sockets.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.({ type: 'open' })
  }
  message(data: string) {
    this.onmessage?.({ type: 'message', data })
  }
  drop() {
    this.readyState = 3
    this.onclose?.({ type: 'close', code: 1006 })
  }
}

let sources: FakeES[] = []
class FakeES {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = 0
  onopen: Listener = null
  onmessage: Listener = null
  onerror: Listener = null
  close = vi.fn(() => {
    this.readyState = 2
  })
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  constructor(public url: string) {
    sources.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.({ type: 'open' })
  }
  message(data: string) {
    this.onmessage?.({ type: 'message', data, lastEventId: '' })
  }
  fail() {
    this.readyState = 2
    this.onerror?.({ type: 'error' })
  }
}

const OriginalWS = globalThis.WebSocket
const OriginalES = globalThis.EventSource
beforeAll(() => {
  ;(globalThis as { WebSocket: unknown }).WebSocket = FakeWS
  ;(globalThis as { EventSource: unknown }).EventSource = FakeES
})
afterAll(() => {
  globalThis.WebSocket = OriginalWS
  globalThis.EventSource = OriginalES
})
beforeEach(() => {
  sockets = []
  sources = []
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function withProvider(component: () => void): () => void {
  const client = new QueryClient()
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <QueryClientProvider client={client}>
      {() => {
        component()
        return null
      }}
    </QueryClientProvider>,
    el,
  )
  return () => {
    unmount()
    el.remove()
  }
}

/** The delays passed to setTimeout from here on. */
function captureDelays(): number[] {
  const delays: number[] = []
  const real = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0)
    return real(fn, ms)
  }) as typeof setTimeout)
  return delays
}

// ─── Backoff ─────────────────────────────────────────────────────────────────

describe('computeReconnectDelay', () => {
  it('grows exponentially, is capped, and is jittered into [cap/2, cap]', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    expect(computeReconnectDelay(0, 1000, 30_000)).toBe(1000)
    expect(computeReconnectDelay(3, 1000, 30_000)).toBe(8000)
    expect(computeReconnectDelay(60, 1000, 30_000)).toBe(30_000)
    // 2 ** 1100 is Infinity — still capped, still a finite timer.
    expect(computeReconnectDelay(1100, 1000, 30_000)).toBe(30_000)

    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeReconnectDelay(60, 1000, 30_000)).toBe(15_000)
  })
})

describe('useSubscription — reconnect backoff', () => {
  it('with unlimited attempts, the delay never exceeds maxReconnectDelay', () => {
    vi.useFakeTimers()
    const delays = captureDelays()
    const unmount = withProvider(() => {
      useSubscription({
        url: 'wss://x',
        onMessage: () => {},
        reconnectDelay: 1000,
        maxReconnectAttempts: 0,
        maxReconnectDelay: 5000,
      })
    })

    // 40 consecutive failures: uncapped, 1000 * 2**39 overflows the 2^31-1 ms
    // setTimeout limit, which fires IMMEDIATELY — a reconnect storm.
    for (let i = 0; i < 40; i++) {
      sockets.at(-1)!.drop()
      vi.advanceTimersByTime(5000)
    }

    expect(sockets.length).toBe(41)
    expect(Math.max(...delays)).toBeLessThanOrEqual(5000)
    unmount()
  })
})

describe('useSSE — reconnect backoff', () => {
  it('with unlimited attempts, the delay never exceeds maxReconnectDelay', () => {
    vi.useFakeTimers()
    const delays = captureDelays()
    const unmount = withProvider(() => {
      useSSE({ url: '/e', reconnectDelay: 1000, maxReconnectAttempts: 0, maxReconnectDelay: 5000 })
    })
    for (let i = 0; i < 40; i++) {
      sources.at(-1)!.fail()
      vi.advanceTimersByTime(5000)
    }
    expect(sources.length).toBe(41)
    expect(Math.max(...delays)).toBeLessThanOrEqual(5000)
    unmount()
  })
})

// ─── Errors are not swallowed ────────────────────────────────────────────────

describe('useSSE — parse + handler errors', () => {
  it('a parse failure surfaces on error() and keeps the previous data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let sse: UseSSEResult<{ n: number }> | null = null
    const unmount = withProvider(() => {
      sse = useSSE({ url: '/e', parse: JSON.parse })
    })
    sources[0]!.open()
    sources[0]!.message('{"n":1}')
    sources[0]!.message('{not json')

    expect(sse!.data()).toEqual({ n: 1 })
    expect(sse!.error()).toBeInstanceOf(SyntaxError)

    // The next good message clears it.
    sources[0]!.message('{"n":2}')
    expect(sse!.error()).toBeNull()
    unmount()
  })

  it('a throwing onMessage is reported in dev, not swallowed', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = withProvider(() => {
      useSSE({
        url: '/e',
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })
    sources[0]!.open()
    expect(() => sources[0]!.message('x')).not.toThrow()
    expect(report).toHaveBeenCalledWith(
      expect.stringMatching(/\[Pyreon\] useSSE.*onMessage/),
      expect.objectContaining({ message: 'handler boom' }),
    )
    unmount()
  })
})

describe('useSubscription — handler errors', () => {
  it('a throwing onMessage is reported in dev, not swallowed', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = withProvider(() => {
      useSubscription({
        url: 'wss://x',
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })
    sockets[0]!.open()
    expect(() => sockets[0]!.message('x')).not.toThrow()
    expect(report).toHaveBeenCalledWith(
      expect.stringMatching(/\[Pyreon\] useSubscription.*onMessage/),
      expect.objectContaining({ message: 'handler boom' }),
    )
    unmount()
  })

  it('is silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = withProvider(() => {
      useSubscription({
        url: 'wss://x',
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })
    sockets[0]!.open()
    sockets[0]!.message('x')
    expect(report).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    unmount()
  })
})

// ─── Exhausted attempts + online recovery ────────────────────────────────────

describe('useSubscription — giving up, and coming back online', () => {
  it("reports 'failed' once reconnect attempts run out", () => {
    vi.useFakeTimers()
    let sub: UseSubscriptionResult | null = null
    const unmount = withProvider(() => {
      sub = useSubscription({ url: 'wss://x', onMessage: () => {}, maxReconnectAttempts: 2 })
    })
    for (let i = 0; i < 3; i++) {
      sockets.at(-1)!.drop()
      vi.advanceTimersByTime(60_000)
    }
    expect(sockets).toHaveLength(3)
    expect(sub!.status()).toBe('failed')
    unmount()
  })

  it('reconnects when the browser comes back online', () => {
    vi.useFakeTimers()
    let sub: UseSubscriptionResult | null = null
    const unmount = withProvider(() => {
      sub = useSubscription({ url: 'wss://x', onMessage: () => {}, maxReconnectAttempts: 1 })
    })
    sockets.at(-1)!.drop()
    vi.advanceTimersByTime(60_000)
    sockets.at(-1)!.drop()
    expect(sub!.status()).toBe('failed')

    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(3)
    expect(sub!.status()).toBe('connecting')
    unmount()
  })

  it('does not reconnect on online after an explicit close()', () => {
    let sub: UseSubscriptionResult | null = null
    const unmount = withProvider(() => {
      sub = useSubscription({ url: 'wss://x', onMessage: () => {} })
    })
    sub!.close()
    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(1)
    unmount()
  })

  it('an online event while connected does nothing', () => {
    const unmount = withProvider(() => {
      useSubscription({ url: 'wss://x', onMessage: () => {} })
    })
    sockets[0]!.open()
    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(1)
    unmount()
  })

  it('detaches the online listener on unmount', () => {
    const unmount = withProvider(() => {
      useSubscription({ url: 'wss://x', onMessage: () => {}, maxReconnectAttempts: 1 })
    })
    unmount()
    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(1)
  })
})

describe('useSSE — giving up, and coming back online', () => {
  it("reports 'failed' once attempts run out, and recovers on online", () => {
    vi.useFakeTimers()
    let sse: UseSSEResult<string> | null = null
    const unmount = withProvider(() => {
      sse = useSSE({ url: '/e', maxReconnectAttempts: 1 })
    })
    sources.at(-1)!.fail()
    vi.advanceTimersByTime(60_000)
    sources.at(-1)!.fail()
    expect(sources).toHaveLength(2)
    expect(sse!.status()).toBe('failed')

    window.dispatchEvent(new Event('online'))
    expect(sources).toHaveLength(3)
    unmount()
  })
})

describe('online recovery — guards', () => {
  it('does not connect on online while disabled', () => {
    const unmount = withProvider(() => {
      useSubscription({ url: 'wss://x', onMessage: () => {}, enabled: false })
      useSSE({ url: '/e', enabled: false })
    })
    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(0)
    expect(sources).toHaveLength(0)
    unmount()
  })

  it('does not open a second connection while one is still connecting', () => {
    const unmount = withProvider(() => {
      useSubscription({ url: 'wss://x', onMessage: () => {} })
      useSSE({ url: '/e' })
    })
    window.dispatchEvent(new Event('online'))
    expect(sockets).toHaveLength(1)
    expect(sources).toHaveLength(1)
    unmount()
  })
})

describe('useSSE — EventSource construction failure', () => {
  it("retries with backoff and reports 'failed' when attempts run out", () => {
    vi.useFakeTimers()
    const Throwing = class {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 2
      constructor() {
        throw new Error('blocked by CSP')
      }
    }
    ;(globalThis as { EventSource: unknown }).EventSource = Throwing
    try {
      let sse: UseSSEResult<string> | null = null
      const unmount = withProvider(() => {
        sse = useSSE({ url: '/e', maxReconnectAttempts: 2 })
      })
      expect(sse!.status()).toBe('error')
      // A manual reconnect while a retry is pending supersedes it.
      sse!.reconnect()
      vi.advanceTimersByTime(60_000)
      vi.advanceTimersByTime(60_000)
      expect(sse!.status()).toBe('failed')
      unmount()
    } finally {
      ;(globalThis as { EventSource: unknown }).EventSource = FakeES
    }
  })
})

describe('useSSE — error-path edges', () => {
  it('a non-Error thrown by parse is wrapped in an Error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let sse: UseSSEResult<string> | null = null
    const unmount = withProvider(() => {
      sse = useSSE({
        url: '/e',
        parse: () => {
          throw 'bad frame'
        },
      })
    })
    sources[0]!.message('x')
    expect(sse!.error()).toBeInstanceOf(Error)
    expect((sse!.error() as Error).message).toBe('bad frame')
    unmount()
  })

  it('parse and handler failures are silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unmount = withProvider(() => {
      useSSE({
        url: '/e',
        parse: (raw) => {
          if (raw === 'bad') throw new Error('bad')
          return raw
        },
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })
    sources[0]!.message('bad')
    sources[0]!.message('good')
    expect(report).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    unmount()
  })

  it('a construction failure with reconnect: false stays in error, no retry', () => {
    vi.useFakeTimers()
    const Throwing = class {
      static CLOSED = 2
      constructor() {
        throw new Error('blocked')
      }
    }
    ;(globalThis as { EventSource: unknown }).EventSource = Throwing
    try {
      let sse: UseSSEResult<string> | null = null
      const unmount = withProvider(() => {
        sse = useSSE({ url: '/e', reconnect: false })
      })
      vi.advanceTimersByTime(60_000)
      expect(sse!.status()).toBe('error')
      unmount()
    } finally {
      ;(globalThis as { EventSource: unknown }).EventSource = FakeES
    }
  })
})
