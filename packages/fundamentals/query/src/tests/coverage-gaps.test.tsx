/**
 * Targeted coverage for behavioral branches not exercised by the main suites.
 * Each test maps to a specific uncovered branch / function and asserts real
 * behavior — no coverage gaming.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  QueryClientProvider,
  QuerySuspense,
  useQuery,
  useQueryErrorResetBoundary,
  useSubscription,
} from '../index'
import { QueryErrorResetBoundary } from '../use-query-error-reset-boundary'

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

const tick = () => new Promise((r) => setTimeout(r, 10))

// ─── QueryErrorResetBoundary — non-function children + fallback reset ─────────

describe('QueryErrorResetBoundary — children + fallback reset', () => {
  it('renders when children is a plain VNode (typeof ch !== "function" branch)', () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)
    // h() passes the VNode child through directly — props.children is a VNode,
    // NOT a function, so the `: ch` else-branch of the typeof check runs.
    const child = h('span', { id: 'boundary-child' }, 'hi') as never
    const unmount = mount(
      h(
        QueryClientProvider,
        { client },
        h(QueryErrorResetBoundary, null, child) as never,
      ) as never,
      el,
    )
    expect(el.querySelector('#boundary-child')?.textContent).toBe('hi')
    unmount()
    el.remove()
  })

  it('fallback reset() invokes the error predicate against errored queries', async () => {
    const client = makeClient()
    let callCount = 0
    let shouldFail = true
    let resetFn: (() => void) | undefined

    // Mount an errored query OUTSIDE any QueryErrorResetBoundary so
    // useQueryErrorResetBoundary takes the client-level fallback path, whose
    // reset() runs refetchQueries with the `query.state.status === 'error'`
    // predicate (anonymous_5@83). The predicate only runs when there is a
    // query to evaluate — hence the errored query must exist first.
    const unmount = withProvider(client, () => {
      // no boundary → fallback reset
      resetFn = useQueryErrorResetBoundary().reset
      useQuery(() => ({
        queryKey: ['fallback-reset'],
        queryFn: async () => {
          callCount++
          if (shouldFail) throw new Error('boom')
          return 'ok'
        },
      }))
    })

    await tick()
    const afterFirst = callCount
    expect(afterFirst).toBeGreaterThan(0)

    shouldFail = false
    resetFn?.()
    await tick()
    // The predicate matched the errored query and refetched it.
    expect(callCount).toBeGreaterThan(afterFirst)
    unmount()
  })
})

// ─── QuerySuspense — non-function children branch ────────────────────────────

describe('QuerySuspense — non-function children', () => {
  it('renders a plain VNode child when all queries succeed (ch ?? null else branch)', async () => {
    const client = makeClient()
    // Pre-populate the cache so the query is immediately successful.
    await client.fetchQuery({ queryKey: ['susp-direct'], queryFn: async () => 'v' })

    const el = document.createElement('div')
    document.body.appendChild(el)

    const unmount = mount(
      h(
        QueryClientProvider,
        { client },
        (() => {
          // A succeeded query-like with non-function children passed via h().
          const q = useQuery(() => ({
            queryKey: ['susp-direct'],
            queryFn: async () => 'v',
          }))
          // children is a plain VNode (not a function), so the
          // `typeof ch === 'function' ? ... : ch` else-branch runs.
          return h(
            QuerySuspense,
            { query: q as never },
            h('span', { id: 'susp-child' }, 'shown') as never,
          ) as never
        }) as never,
      ) as never,
      el,
    )

    await tick()
    expect(el.querySelector('#susp-child')?.textContent).toBe('shown')
    unmount()
    el.remove()
  })
})

// ─── useSubscription — WebSocket-undefined + reactive-close guards ────────────

describe('useSubscription — environment + close guards', () => {
  const OriginalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    // Remove WebSocket so the `typeof WebSocket === 'undefined'` guards run.
    // @ts-expect-error — intentional removal to test SSR/no-WS environments.
    delete globalThis.WebSocket
  })
  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket
  })

  it('no-ops connect/send/close when WebSocket is undefined', () => {
    const client = makeClient()
    let sub: ReturnType<typeof useSubscription> | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: () => {},
      })
    })

    // connect() early-returned (no socket created) → status stays disconnected.
    expect(sub!.status()).toBe('disconnected')
    // send() and close() both hit the `typeof WebSocket === 'undefined'` return.
    expect(() => sub!.send('x')).not.toThrow()
    expect(() => sub!.close()).not.toThrow()
    // unmount → onUnmount close() also no-ops cleanly.
    unmount()
  })
})

describe('useSubscription — effect intentionalClose guard', () => {
  // WebSocket is the happy-dom/global one here — restore default for this block.
  it('reactive signal change after close() does NOT reconnect (effect intentionalClose return)', async () => {
    const client = makeClient()
    const urlSig = signal('wss://example.com/a')
    let sub: ReturnType<typeof useSubscription> | null = null

    const unmount = withProvider(client, () => {
      sub = useSubscription({
        url: () => urlSig(),
        onMessage: () => {},
        reconnect: true,
      })
    })

    // Explicit close sets intentionalClose = true.
    sub!.close()
    // A tracked-signal change re-runs the effect; intentionalClose short-circuits.
    urlSig.set('wss://example.com/b')
    await tick()
    // Still disconnected — the effect's `if (intentionalClose) return` ran.
    expect(sub!.status()).toBe('disconnected')
    unmount()
  })
})

// ─── useSubscription — construct-throw + reconnect-disabled scheduleReconnect ─

describe('useSubscription — construction failure path', () => {
  const OriginalWebSocket = globalThis.WebSocket

  class ThrowingWebSocket {
    static OPEN = 1
    constructor() {
      throw new Error('WebSocket construction failed')
    }
  }

  beforeEach(() => {
    // @ts-expect-error — install a WebSocket whose constructor throws.
    globalThis.WebSocket = ThrowingWebSocket
  })
  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket
  })

  it('construct throw with reconnect:false → status error, scheduleReconnect returns early', () => {
    const client = makeClient()
    let sub: ReturnType<typeof useSubscription> | null = null

    const unmount = withProvider(client, () => {
      // reconnect:false → scheduleReconnect (called from the construct-throw
      // catch) hits `if (!reconnectEnabled) return` true-side.
      sub = useSubscription({
        url: 'wss://example.com/ws',
        onMessage: () => {},
        reconnect: false,
      })
    })

    // catch block ran: status('error') + scheduleReconnect() (no-op).
    expect(sub!.status()).toBe('error')
    unmount()
  })
})

// ─── useSubscription — reconnect timer fires while enabled flips false ────────

describe('useSubscription — reconnect timer false-side', () => {
  const instances: MockWS[] = []
  const OriginalWebSocket = globalThis.WebSocket

  class MockWS {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = MockWS.CONNECTING
    onopen: ((e: unknown) => void) | null = null
    onmessage: ((e: unknown) => void) | null = null
    onclose: ((e: unknown) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    close = vi.fn(() => {
      this.readyState = MockWS.CLOSED
    })
    constructor() {
      instances.push(this as unknown as MockWS)
    }
  }

  beforeEach(() => {
    instances.length = 0
    // @ts-expect-error — install controllable WebSocket mock.
    globalThis.WebSocket = MockWS
  })
  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket
  })

  it('timer fires but isEnabled() is false → connect() NOT re-invoked (176#1)', async () => {
    vi.useFakeTimers()
    try {
      const client = makeClient()
      // A plain (non-signal) closure flag read inside `enabled`. The effect
      // reads it once but never subscribes (it's not a Pyreon signal), so
      // flipping it does NOT re-run the effect — the scheduled reconnect timer
      // survives and fires with isEnabled() now returning false.
      let enabledFlag = true

      const unmount = withProvider(client, () => {
        useSubscription({
          url: 'wss://example.com/ws',
          onMessage: () => {},
          reconnect: true,
          reconnectDelay: 50,
          enabled: () => enabledFlag,
        })
      })

      expect(instances).toHaveLength(1)
      // Simulate a non-intentional close → schedules a reconnect timer.
      const ws = instances[instances.length - 1]!
      ws.readyState = MockWS.CLOSED
      ws.onclose?.({ type: 'close', code: 1006 })

      // Flip enabled false WITHOUT triggering the effect (plain closure var).
      enabledFlag = false

      // Fire the reconnect timer: `!intentionalClose && isEnabled()` is now
      // false → connect() is NOT called, no new socket created.
      await vi.advanceTimersByTimeAsync(50)
      expect(instances).toHaveLength(1)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
