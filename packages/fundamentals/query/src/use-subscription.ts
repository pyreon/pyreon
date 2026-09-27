import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, isClient, signal } from '@pyreon/reactivity'
import type { QueryClient } from '@tanstack/query-core'
import { useQueryClient } from './query-client'
import { computeReconnectDelay, DEFAULT_MAX_RECONNECT_DELAY } from './reconnect'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'failed'

export interface UseSubscriptionOptions {
  /** WebSocket URL — can be a signal for reactive URLs */
  url: string | (() => string)
  /** WebSocket sub-protocols */
  protocols?: string | string[]
  /** Called when a message is received — use queryClient to invalidate or update cache */
  onMessage: (event: MessageEvent, queryClient: QueryClient) => void
  /** Called when the connection opens */
  onOpen?: (event: Event) => void
  /** Called when the connection closes */
  onClose?: (event: CloseEvent) => void
  /** Called when a connection error occurs */
  onError?: (event: Event) => void
  /** Whether to automatically reconnect — default: true */
  reconnect?: boolean
  /** Initial reconnect delay in ms — doubles on each retry (jittered), default: 1000 */
  reconnectDelay?: number
  /** Ceiling for the reconnect delay in ms — default: 30000 */
  maxReconnectDelay?: number
  /**
   * Maximum reconnect attempts — default: 10, 0 = unlimited. When they run
   * out, `status()` becomes `'failed'`; a browser `online` event (or
   * `reconnect()`) starts over.
   */
  maxReconnectAttempts?: number
  /** Whether the subscription is enabled — default: true */
  enabled?: boolean | (() => boolean)
}

export interface UseSubscriptionResult {
  /** Current connection status */
  status: Signal<SubscriptionStatus>
  /** Send data through the WebSocket */
  send: (data: string | Blob | BufferSource) => void
  /** Manually close the connection */
  close: () => void
  /** Manually reconnect */
  reconnect: () => void
}

// ─── useSubscription ─────────────────────────────────────────────────────────

/**
 * Reactive WebSocket subscription that integrates with TanStack Query.
 * Automatically manages connection lifecycle, reconnection, and cleanup.
 *
 * Use the `onMessage` callback to invalidate or update query cache
 * when the server pushes data.
 *
 * @example
 * ```ts
 * const sub = useSubscription({
 *   url: 'wss://api.example.com/ws',
 *   onMessage: (event, queryClient) => {
 *     const data = JSON.parse(event.data)
 *     if (data.type === 'order-updated') {
 *       queryClient.invalidateQueries({ queryKey: ['orders'] })
 *     }
 *   },
 * })
 * // sub.status() — 'connecting' | 'connected' | 'disconnected' | 'error'
 * // sub.send(JSON.stringify({ type: 'subscribe', channel: 'orders' }))
 * ```
 */
export function useSubscription(options: UseSubscriptionOptions): UseSubscriptionResult {
  const queryClient = useQueryClient()
  const status = signal<SubscriptionStatus>('disconnected')

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  const reconnectEnabled = options.reconnect !== false
  const baseDelay = options.reconnectDelay ?? 1000
  const maxAttempts = options.maxReconnectAttempts ?? 10
  const maxDelay = options.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY

  function getUrl(): string {
    return typeof options.url === 'function' ? options.url() : options.url
  }

  function isEnabled(): boolean {
    if (options.enabled === undefined) return true
    return typeof options.enabled === 'function' ? options.enabled() : options.enabled
  }

  // Cancel any pending reconnect timer. Called before (re)connecting and
  // before scheduling a fresh reconnect, so a stale timer can never fire a
  // spurious extra connect() after the socket has already been re-established
  // (reactive url/enabled change, manualReconnect, or a rapid second close).
  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function connect(): void {
    if (typeof WebSocket === 'undefined') return
    // A connect supersedes any pending reconnect — drop the orphan timer.
    clearReconnect()
    if (ws) {
      // Drop the handlers BEFORE closing. `close()` only starts the closing
      // handshake — the socket sits in CLOSING and a frame already buffered
      // can still be delivered, firing a handler that writes into a scope
      // this teardown has just disposed. Nulling first removes the handler,
      // and a later event then has nothing to call.
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }

    if (!isEnabled()) {
      status.set('disconnected')
      return
    }

    status.set('connecting')

    try {
      ws = options.protocols ? new WebSocket(getUrl(), options.protocols) : new WebSocket(getUrl())
    } catch {
      status.set('error')
      scheduleReconnect()
      return
    }

    ws.onopen = (event) => {
      batch(() => {
        status.set('connected')
        reconnectAttempts = 0
      })
      options.onOpen?.(event)
    }

    ws.onmessage = (event) => {
      try {
        options.onMessage(event, queryClient)
      } catch (err) {
        // A throwing handler must not take the socket down — but swallowing it
        // silently hides real bugs (a JSON.parse on a malformed frame, a bad
        // cache update). Report it in dev.
        if (process.env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console
          console.error('[Pyreon] useSubscription: the onMessage handler threw:', err)
        }
      }
    }

    ws.onclose = (event) => {
      status.set('disconnected')
      options.onClose?.(event)

      if (!intentionalClose && reconnectEnabled) {
        scheduleReconnect()
      }
    }

    ws.onerror = (event) => {
      status.set('error')
      options.onError?.(event)
    }
  }

  function scheduleReconnect(): void {
    if (!reconnectEnabled) return
    if (maxAttempts > 0 && reconnectAttempts >= maxAttempts) {
      // Out of attempts: say so, distinctly from a transient 'error' /
      // 'disconnected' that is about to be retried.
      status.set('failed')
      return
    }

    const delay = computeReconnectDelay(reconnectAttempts, baseDelay, maxDelay)
    reconnectAttempts++

    // Clear a prior pending timer before overwriting the handle (a rapid
    // second close/error would otherwise orphan the first timer).
    clearReconnect()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!intentionalClose && isEnabled()) {
        connect()
      }
    }, delay)
  }

  function send(data: string | Blob | BufferSource): void {
    if (typeof WebSocket === 'undefined') return
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  function close(): void {
    if (typeof WebSocket === 'undefined') return
    intentionalClose = true
    clearReconnect()
    if (ws) {
      // Handlers first, then close — see the note in `connect()`.
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
    }
    status.set('disconnected')
  }

  function manualReconnect(): void {
    intentionalClose = false
    reconnectAttempts = 0
    connect()
  }

  // Track reactive URL and enabled state — reconnect when either changes.
  // Respect intentionalClose: if user explicitly called close(), don't
  // auto-reconnect just because a dependency signal changed.
  effect(() => {
    if (typeof options.url === 'function') options.url()
    if (typeof options.enabled === 'function') options.enabled()

    if (intentionalClose) return
    reconnectAttempts = 0
    connect()
  })

  // Coming back online is the moment a dead connection is worth another try —
  // including after attempts ran out ('failed'). A connection that is live, or
  // one the caller closed on purpose, is left alone.
  const onOnline = (): void => {
    if (intentionalClose || !isEnabled()) return
    const s = status.peek()
    if (s === 'connected' || s === 'connecting') return
    reconnectAttempts = 0
    connect()
  }
  if (isClient) window.addEventListener('online', onOnline)

  // Cleanup on unmount
  onUnmount(() => {
    if (isClient) window.removeEventListener('online', onOnline)
    close()
  })

  return {
    status,
    send,
    close,
    reconnect: manualReconnect,
  }
}
