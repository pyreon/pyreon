import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider, type UseSubscriptionResult, useSubscription } from '../index'

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

type MockWSListener = ((event: unknown) => void) | null

interface MockWebSocket {
  url: string
  protocols?: string | string[]
  readyState: number
  onopen: MockWSListener
  onmessage: MockWSListener
  onclose: MockWSListener
  onerror: MockWSListener
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  // Test helpers
  _simulateOpen: () => void
  _simulateMessage: (data: string) => void
  _simulateClose: (code?: number, reason?: string) => void
  _simulateError: () => void
}

let mockInstances: MockWebSocket[] = []

class MockWebSocketClass {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  protocols?: string | string[]
  readyState = 0
  onopen: MockWSListener = null
  onmessage: MockWSListener = null
  onclose: MockWSListener = null
  onerror: MockWSListener = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocketClass.CLOSED
  })

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    if (protocols != null) this.protocols = protocols
    this.readyState = MockWebSocketClass.CONNECTING
    mockInstances.push(this as unknown as MockWebSocket)
  }

  _simulateOpen() {
    this.readyState = MockWebSocketClass.OPEN
    this.onopen?.({ type: 'open' })
  }

  _simulateMessage(data: string) {
    this.onmessage?.({ type: 'message', data } as unknown as MessageEvent)
  }

  _simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocketClass.CLOSED
    this.onclose?.({ type: 'close', code, reason } as unknown as CloseEvent)
  }

  _simulateError() {
    this.onerror?.({ type: 'error' })
  }
}

// Install mock
const OriginalWebSocket = globalThis.WebSocket
beforeAll(() => {
  ;(globalThis as any).WebSocket = MockWebSocketClass
})
afterAll(() => {
  globalThis.WebSocket = OriginalWebSocket
})

const noop = () => {}

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

function lastMockWS(): MockWebSocket {
  return mockInstances[mockInstances.length - 1]!
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useSubscription', () => {
  beforeEach(() => {
    mockInstances = []
  })

  it('connects to the WebSocket URL', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    expect(mockInstances).toHaveLength(1)
    expect(lastMockWS().url).toBe('wss://example.com/ws')
    expect(sub!.status()).toBe('connecting')

    unmount()
  })

  it('status transitions to connected on open', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    lastMockWS()._simulateOpen()
    expect(sub!.status()).toBe('connected')

    unmount()
  })

  it('calls onMessage with event and queryClient', () => {
    const client = makeClient()
    const messages: string[] = []

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: (event, qc) => {
          messages.push(event.data as string)
          expect(qc).toBe(client)
        },
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateMessage('hello')
    lastMockWS()._simulateMessage('world')

    expect(messages).toEqual(['hello', 'world'])
    unmount()
  })

  it('invalidates queries on message', () => {
    const client = makeClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: (_event, qc) => {
          qc.invalidateQueries({ queryKey: ['orders'] })
        },
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateMessage('order-updated')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] })
    unmount()
  })

  it('send() sends data through WebSocket', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    lastMockWS()._simulateOpen()
    sub!.send('test-message')

    expect(lastMockWS().send).toHaveBeenCalledWith('test-message')
    unmount()
  })

  it('send() is a no-op when not connected', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    // Still connecting — send should not throw
    sub!.send('ignored')
    expect(lastMockWS().send).not.toHaveBeenCalled()
    unmount()
  })

  it('close() disconnects and sets status', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    lastMockWS()._simulateOpen()
    sub!.close()

    expect(sub!.status()).toBe('disconnected')
    expect(lastMockWS().close).toHaveBeenCalled()
    unmount()
  })

  it('status transitions to disconnected on close', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    expect(sub!.status()).toBe('disconnected')
    unmount()
  })

  it('status transitions to error on error', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null
    const errors: Event[] = []

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
        onError: (e) => errors.push(e as Event),
      })
    })

    lastMockWS()._simulateError()
    expect(sub!.status()).toBe('error')
    expect(errors).toHaveLength(1)
    unmount()
  })

  it('calls onOpen callback', () => {
    const client = makeClient()
    let opened = false

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        onOpen: () => {
          opened = true
        },
      })
    })

    lastMockWS()._simulateOpen()
    expect(opened).toBe(true)
    unmount()
  })

  it('calls onClose callback', () => {
    const client = makeClient()
    let closed = false

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
        onClose: () => {
          closed = true
        },
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()
    expect(closed).toBe(true)
    unmount()
  })

  it('auto-reconnects on unexpected close', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 50,
      })
    })

    expect(mockInstances).toHaveLength(1)
    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    // Wait for reconnect
    await new Promise((r) => setTimeout(r, 100))

    expect(mockInstances).toHaveLength(2)
    unmount()
  })

  it('does not reconnect when reconnect is false', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    await new Promise((r) => setTimeout(r, 100))
    expect(mockInstances).toHaveLength(1)
    unmount()
  })

  it('does not reconnect after intentional close()', async () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 50,
      })
    })

    lastMockWS()._simulateOpen()
    sub!.close()

    await new Promise((r) => setTimeout(r, 100))
    expect(mockInstances).toHaveLength(1)
    unmount()
  })

  it('respects maxReconnectAttempts', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2,
      })
    })

    // First connection
    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    // Reconnect 1
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(2)
    lastMockWS()._simulateClose()

    // Reconnect 2
    await new Promise((r) => setTimeout(r, 40))
    expect(mockInstances).toHaveLength(3)
    lastMockWS()._simulateClose()

    // Should not reconnect again (max 2 attempts reached)
    await new Promise((r) => setTimeout(r, 100))
    expect(mockInstances).toHaveLength(3)

    unmount()
  })

  it('reconnect() resets attempts and reconnects', async () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    expect(mockInstances).toHaveLength(1)

    sub!.reconnect()
    expect(mockInstances).toHaveLength(2)
    expect(sub!.status()).toBe('connecting')

    unmount()
  })

  it('enabled: false prevents connection', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        enabled: false,
      })
    })

    expect(mockInstances).toHaveLength(0)
    expect(sub!.status()).toBe('disconnected')
    unmount()
  })

  it('reactive enabled signal controls connection', async () => {
    const client = makeClient()
    const enabled = signal(false)

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
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
    const url = signal('wss://example.com/ws1')

    const unmount = withProvider(client, () => {
      useSubscription({
        url: () => url(),
        onMessage: noop,
      })
    })

    expect(mockInstances).toHaveLength(1)
    expect(lastMockWS().url).toBe('wss://example.com/ws1')

    url.set('wss://example.com/ws2')

    expect(mockInstances).toHaveLength(2)
    expect(lastMockWS().url).toBe('wss://example.com/ws2')

    unmount()
  })

  it('supports WebSocket protocols', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        protocols: ['graphql-ws'],
        onMessage: noop,
      })
    })

    expect(lastMockWS().protocols).toEqual(['graphql-ws'])
    unmount()
  })

  it('cleans up on unmount', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    lastMockWS()._simulateOpen()
    const ws = lastMockWS()

    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  // ─── Error handling & cleanup ──────────────────────────────────────────────

  it('reconnects after connection drop (simulated close)', async () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 20,
      })
    })

    // Establish connection then drop it
    lastMockWS()._simulateOpen()
    expect(sub!.status()).toBe('connected')

    // Simulate unexpected connection drop
    lastMockWS()._simulateClose(1006, 'abnormal closure')

    // Wait for reconnect attempt
    await new Promise((r) => setTimeout(r, 50))

    expect(mockInstances).toHaveLength(2)
    expect(lastMockWS().url).toBe('wss://example.com/ws')
    expect(sub!.status()).toBe('connecting')

    unmount()
  })

  it('message handler that throws does not crash the subscription', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: () => {
          throw new Error('handler boom')
        },
      })
    })

    lastMockWS()._simulateOpen()

    // Should not throw — the error is caught internally
    expect(() => lastMockWS()._simulateMessage('test')).not.toThrow()

    // Subscription should still be connected
    expect(sub!.status()).toBe('connected')

    unmount()
  })

  it('WebSocket is closed on unmount (cleanup)', () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
      })
    })

    lastMockWS()._simulateOpen()
    const ws = lastMockWS()

    expect(ws.readyState).toBe(MockWebSocketClass.OPEN)

    unmount()

    expect(ws.close).toHaveBeenCalled()
    expect(ws.readyState).toBe(MockWebSocketClass.CLOSED)
  })

  it('no reconnect attempts after unmount', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 20,
      })
    })

    lastMockWS()._simulateOpen()
    unmount()

    // Wait longer than reconnectDelay — should not create new connections
    await new Promise((r) => setTimeout(r, 80))
    expect(mockInstances).toHaveLength(1)
  })

  it('send when disconnected does not crash', () => {
    const client = makeClient()
    let sub: UseSubscriptionResult | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: false,
      })
    })

    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    expect(sub!.status()).toBe('disconnected')

    // Should not throw
    expect(() => sub!.send('test')).not.toThrow()
    // The underlying WS send should not have been called (only the one from close)
    expect(lastMockWS().send).not.toHaveBeenCalled()

    unmount()
  })

  it('resets reconnect count on successful connection', async () => {
    const client = makeClient()

    const unmount = withProvider(client, () => {
      useSubscription({
        url: 'wss://example.com/ws',
        onMessage: noop,
        reconnect: true,
        reconnectDelay: 10,
        maxReconnectAttempts: 2,
      })
    })

    // First connection then close
    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    // Reconnect 1
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(2)

    // This reconnect succeeds — should reset the counter
    lastMockWS()._simulateOpen()
    lastMockWS()._simulateClose()

    // Should be able to reconnect again (counter was reset)
    await new Promise((r) => setTimeout(r, 30))
    expect(mockInstances).toHaveLength(3)

    unmount()
  })
})
