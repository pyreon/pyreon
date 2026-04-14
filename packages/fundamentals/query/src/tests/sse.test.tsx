import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider, type UseSSEResult, useSSE } from '../index'

// ─── Mock EventSource ───────────────────────────────────────────────────────

type MockESListener = ((event: unknown) => void) | null

interface MockEventSource {
  url: string
  withCredentials: boolean
  readyState: number
  onopen: MockESListener
  onmessage: MockESListener
  onerror: MockESListener
  close: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  // Test helpers
  _simulateOpen: () => void
  _simulateMessage: (data: string, lastEventId?: string) => void
  _simulateNamedEvent: (name: string, data: string) => void
  _simulateError: (closed?: boolean) => void
  _namedListeners: Map<string, EventListener[]>
}

let mockInstances: MockEventSource[] = []

class MockEventSourceClass {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  withCredentials: boolean
  readyState = 0
  onopen: MockESListener = null
  onmessage: MockESListener = null
  onerror: MockESListener = null

  _namedListeners = new Map<string, EventListener[]>()

  close = vi.fn(() => {
    this.readyState = MockEventSourceClass.CLOSED
  })

  addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this._namedListeners.get(type) ?? []
    listeners.push(listener)
    this._namedListeners.set(type, listeners)
  })

  removeEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this._namedListeners.get(type) ?? []
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  })

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = init?.withCredentials ?? false
    this.readyState = MockEventSourceClass.CONNECTING
    mockInstances.push(this as unknown as MockEventSource)
  }

  _simulateOpen() {
    this.readyState = MockEventSourceClass.OPEN
    this.onopen?.({ type: 'open' })
  }

  _simulateMessage(data: string, lastEventId = '') {
    this.onmessage?.({ type: 'message', data, lastEventId } as unknown as MessageEvent)
  }

  _simulateNamedEvent(name: string, data: string) {
    const listeners = this._namedListeners.get(name) ?? []
    for (const listener of listeners) {
      listener({ type: name, data } as unknown as Event)
    }
  }

  _simulateError(closed = false) {
    if (closed) {
      this.readyState = MockEventSourceClass.CLOSED
    }
    this.onerror?.({ type: 'error' })
  }
}

// Install mock
const OriginalEventSource = globalThis.EventSource
beforeAll(() => {
  ;(globalThis as any).EventSource = MockEventSourceClass
})
afterAll(() => {
  globalThis.EventSource = OriginalEventSource
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

function withProvider(client: QueryClient, component: () => void): () => void {
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

function lastMockES(): MockEventSource {
  return mockInstances[mockInstances.length - 1]!
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useSSE', () => {
  beforeEach(() => {
    mockInstances = []
  })

  it('connects to the EventSource URL', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    expect(mockInstances).toHaveLength(1)
    expect(lastMockES().url).toBe('http://example.com/events')
    expect(sse!.status()).toBe('connecting')

    unmount()
  })

  it('status transitions to connected on open', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    expect(sse!.status()).toBe('connected')

    unmount()
  })

  it('updates data signal on message', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('hello')

    expect(sse!.data()).toBe('hello')

    lastMockES()._simulateMessage('world')
    expect(sse!.data()).toBe('world')

    unmount()
  })

  it('calls onMessage with parsed data and queryClient', () => {
    const client = makeClient()
    const messages: string[] = []

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        onMessage: (data, qc) => {
          messages.push(data)
          expect(qc).toBe(client)
        },
      })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('hello')
    lastMockES()._simulateMessage('world')

    expect(messages).toEqual(['hello', 'world'])
    unmount()
  })

  it('parses messages with parse option', () => {
    const client = makeClient()
    let sse: UseSSEResult<{ value: number }> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        parse: JSON.parse,
      })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('{"value":42}')

    expect(sse!.data()).toEqual({ value: 42 })

    unmount()
  })

  it('invalidates queries on message', () => {
    const client = makeClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        onMessage: (_data, qc) => {
          qc.invalidateQueries({ queryKey: ['orders'] })
        },
      })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('order-updated')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] })
    unmount()
  })

  it('listens to named events', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        events: 'order-update',
      })
    })

    lastMockES()._simulateOpen()

    // Named event listener should be attached
    expect(lastMockES().addEventListener).toHaveBeenCalledWith('order-update', expect.any(Function))

    // Generic onmessage should NOT be set
    expect(lastMockES().onmessage).toBeNull()

    // Simulate named event
    lastMockES()._simulateNamedEvent('order-update', 'data1')
    expect(sse!.data()).toBe('data1')

    unmount()
  })

  it('listens to multiple named events', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        events: ['order-update', 'user-update'],
      })
    })

    lastMockES()._simulateOpen()

    expect(lastMockES().addEventListener).toHaveBeenCalledTimes(2)

    lastMockES()._simulateNamedEvent('order-update', 'order1')
    expect(sse!.data()).toBe('order1')

    lastMockES()._simulateNamedEvent('user-update', 'user1')
    expect(sse!.data()).toBe('user1')

    unmount()
  })

  it('close() disconnects and sets status', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    sse!.close()

    expect(sse!.status()).toBe('disconnected')
    expect(lastMockES().close).toHaveBeenCalled()
    unmount()
  })

  it('status transitions to error on error', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null
    const errors: Event[] = []

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: false,
        onError: (e) => errors.push(e),
      })
    })

    lastMockES()._simulateError()
    expect(sse!.status()).toBe('error')
    expect(sse!.error()).not.toBeNull()
    expect(errors).toHaveLength(1)
    unmount()
  })

  it('auto-reconnects when EventSource closes', async () => {
    // Fake timers eliminate wall-clock dependence on CI — the previous real
    // setTimeout(100ms) could resolve before the scheduled reconnectDelay(50)
    // timer actually fired under shared-runner load. Narrow fake-timer scope
    // (only the reconnect scheduler uses setTimeout; signals/effects in
    // useSSE are synchronous) keeps this safe despite the general
    // "prefer real timers" guideline.
    vi.useFakeTimers()
    try {
      const client = makeClient()

      const unmount = withProvider(client, () => {
        useSSE({
          url: 'http://example.com/events',
          reconnect: true,
          reconnectDelay: 50,
        })
      })

      expect(mockInstances).toHaveLength(1)
      lastMockES()._simulateOpen()

      // Simulate error with CLOSED readyState (browser gave up)
      lastMockES()._simulateError(true)

      // Deterministically advance past the reconnect delay
      await vi.advanceTimersByTimeAsync(50)

      expect(mockInstances).toHaveLength(2)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reconnect when reconnect is false', async () => {
    // Fake timers prevent any reconnect timer leaked from a prior test (e.g.
    // the `auto-reconnects` case above) from firing inside this test's window
    // after mockInstances was cleared in beforeEach.
    vi.useFakeTimers()
    try {
      const client = makeClient()

      const unmount = withProvider(client, () => {
        useSSE({
          url: 'http://example.com/events',
          reconnect: false,
        })
      })

      lastMockES()._simulateOpen()
      lastMockES()._simulateError(true)

      await vi.advanceTimersByTimeAsync(100)
      expect(mockInstances).toHaveLength(1)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reconnect after intentional close()', async () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: true,
        reconnectDelay: 50,
      })
    })

    lastMockES()._simulateOpen()
    sse!.close()

    await new Promise((r) => setTimeout(r, 100))
    expect(mockInstances).toHaveLength(1)
    unmount()
  })

  it('respects maxReconnectAttempts', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2,
      })
    })

    // First connection
    lastMockES()._simulateOpen()
    lastMockES()._simulateError(true)

    // Reconnect 1
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(2)
    lastMockES()._simulateError(true)

    // Reconnect 2
    await new Promise((r) => setTimeout(r, 40))
    expect(mockInstances).toHaveLength(3)
    lastMockES()._simulateError(true)

    // Should not reconnect again (max 2 attempts reached)
    await new Promise((r) => setTimeout(r, 100))
    expect(mockInstances).toHaveLength(3)

    unmount()
  })

  it('reconnect() resets attempts and reconnects', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: false,
      })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateError(true)

    expect(mockInstances).toHaveLength(1)

    sse!.reconnect()
    expect(mockInstances).toHaveLength(2)
    expect(sse!.status()).toBe('connecting')

    unmount()
  })

  it('enabled: false prevents connection', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        enabled: false,
      })
    })

    expect(mockInstances).toHaveLength(0)
    expect(sse!.status()).toBe('disconnected')
    unmount()
  })

  it('reactive enabled signal controls connection', () => {
    const client = makeClient()
    const enabled = signal(false)

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        enabled: () => enabled(),
      })
    })

    expect(mockInstances).toHaveLength(0)

    enabled.set(true)

    // Effect runs synchronously in Pyreon
    expect(mockInstances).toHaveLength(1)
    unmount()
  })

  it('reactive URL reconnects when URL changes', () => {
    const client = makeClient()
    const url = signal('http://example.com/events1')

    const unmount = withProvider(client, () => {
      useSSE({ url: () => url() })
    })

    expect(mockInstances).toHaveLength(1)
    expect(lastMockES().url).toBe('http://example.com/events1')

    url.set('http://example.com/events2')

    expect(mockInstances).toHaveLength(2)
    expect(lastMockES().url).toBe('http://example.com/events2')

    unmount()
  })

  it('passes withCredentials to EventSource', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        withCredentials: true,
      })
    })

    expect(lastMockES().withCredentials).toBe(true)
    unmount()
  })

  it('withCredentials defaults to false', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({ url: 'http://example.com/events' })
    })

    expect(lastMockES().withCredentials).toBe(false)
    unmount()
  })

  it('cleans up on unmount', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    const es = lastMockES()

    unmount()
    expect(es.close).toHaveBeenCalled()
  })

  it('message handler that throws does not crash the subscription', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })

    lastMockES()._simulateOpen()

    // Should not throw — the error is caught internally
    expect(() => lastMockES()._simulateMessage('test')).not.toThrow()

    // Subscription should still be connected
    expect(sse!.status()).toBe('connected')

    unmount()
  })

  it('no reconnect attempts after unmount', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        reconnect: true,
        reconnectDelay: 20,
      })
    })

    lastMockES()._simulateOpen()
    unmount()

    // Wait longer than reconnectDelay — should not create new connections
    await new Promise((r) => setTimeout(r, 80))
    expect(mockInstances).toHaveLength(1)
  })

  it('data() starts as null', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    expect(sse!.data()).toBeNull()
    unmount()
  })

  it('error() starts as null and is set on error', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: false,
      })
    })

    expect(sse!.error()).toBeNull()

    lastMockES()._simulateError()
    expect(sse!.error()).not.toBeNull()

    unmount()
  })

  it('error is cleared on successful open', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: false,
      })
    })

    lastMockES()._simulateError()
    expect(sse!.error()).not.toBeNull()

    // Manually reconnect
    sse!.reconnect()
    lastMockES()._simulateOpen()

    expect(sse!.error()).toBeNull()
    expect(sse!.status()).toBe('connected')

    unmount()
  })

  // ── lastEventId ──────────────────────────────────────────────────────────

  it('lastEventId starts as empty string', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    expect(sse!.lastEventId()).toBe('')
    unmount()
  })

  it('lastEventId is updated from message events', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('hello', 'evt-1')

    expect(sse!.lastEventId()).toBe('evt-1')

    lastMockES()._simulateMessage('world', 'evt-2')
    expect(sse!.lastEventId()).toBe('evt-2')

    unmount()
  })

  it('lastEventId is not updated when lastEventId is empty', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateMessage('hello', 'evt-1')
    expect(sse!.lastEventId()).toBe('evt-1')

    // Message with empty lastEventId should not overwrite
    lastMockES()._simulateMessage('world', '')
    expect(sse!.lastEventId()).toBe('evt-1')

    unmount()
  })

  // ── onOpen callback ──────────────────────────────────────────────────────

  it('calls onOpen when connection opens', () => {
    const client = makeClient()
    const openEvents: Event[] = []

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        onOpen: (event) => openEvents.push(event),
      })
    })

    lastMockES()._simulateOpen()
    expect(openEvents).toHaveLength(1)
    expect(openEvents[0]!.type).toBe('open')

    unmount()
  })

  it('onOpen is called on each reconnection open', async () => {
    const client = makeClient()
    const openEvents: Event[] = []

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        reconnect: true,
        reconnectDelay: 10,
        onOpen: (event) => openEvents.push(event),
      })
    })

    lastMockES()._simulateOpen()
    expect(openEvents).toHaveLength(1)

    // Trigger reconnect
    lastMockES()._simulateError(true)
    await new Promise((r) => setTimeout(r, 30))

    lastMockES()._simulateOpen()
    expect(openEvents).toHaveLength(2)

    unmount()
  })

  // ── readyState ───────────────────────────────────────────────────────────

  it('readyState starts as CLOSED (2)', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events', enabled: false })
    })

    expect(sse!.readyState()).toBe(2)
    unmount()
  })

  it('readyState transitions to CONNECTING (0) then OPEN (1)', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    // After connect() but before open, readyState should be CONNECTING
    expect(sse!.readyState()).toBe(0)

    lastMockES()._simulateOpen()
    expect(sse!.readyState()).toBe(1)

    unmount()
  })

  it('readyState becomes CLOSED (2) after close()', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({ url: 'http://example.com/events' })
    })

    lastMockES()._simulateOpen()
    expect(sse!.readyState()).toBe(1)

    sse!.close()
    expect(sse!.readyState()).toBe(2)

    unmount()
  })

  it('readyState reflects CLOSED on terminal error', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        reconnect: false,
      })
    })

    lastMockES()._simulateOpen()
    lastMockES()._simulateError(true)
    expect(sse!.readyState()).toBe(2)

    unmount()
  })

  it('resets reconnect count on successful connection', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSSE({
        url: 'http://example.com/events',
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2,
      })
    })

    // First connection then error-close
    lastMockES()._simulateOpen()
    lastMockES()._simulateError(true)

    // Reconnect 1
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(2)

    // This reconnect succeeds — should reset the counter
    lastMockES()._simulateOpen()
    lastMockES()._simulateError(true)

    // Should be able to reconnect again (counter was reset)
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(3)

    unmount()
  })

  it('removes named event listeners on close', () => {
    const client = makeClient()
    let sse: UseSSEResult<string> | null = null

    const unmount = withProvider(client, () => {
      sse = useSSE({
        url: 'http://example.com/events',
        events: ['order-update', 'user-update'],
      })
    })

    const es = lastMockES()
    lastMockES()._simulateOpen()
    sse!.close()

    expect(es.removeEventListener).toHaveBeenCalledWith('order-update', expect.any(Function))
    expect(es.removeEventListener).toHaveBeenCalledWith('user-update', expect.any(Function))

    unmount()
  })
})
