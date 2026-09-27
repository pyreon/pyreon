import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, isClient, signal } from '@pyreon/reactivity'
import type { QueryClient } from '@tanstack/query-core'
import { useQueryClient } from './query-client'
import { computeReconnectDelay, DEFAULT_MAX_RECONNECT_DELAY } from './reconnect'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SSEStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'failed'

export interface UseSSEOptions<T = string> {
  /** EventSource URL — can be a signal for reactive URLs */
  url: string | (() => string)
  /** Named event type(s) to listen for — if omitted, listens to generic `message` events */
  events?: string | string[]
  /** Parse raw event data — e.g. `JSON.parse` for automatic deserialization */
  parse?: (raw: string) => T
  /** Whether the SSE connection is enabled — default: true */
  enabled?: boolean | (() => boolean)
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
  /** Whether to send cookies with the request — default: false */
  withCredentials?: boolean
  /**
   * Seed for `lastEventId()` — used when resuming an SSE stream across a
   * component remount (or from `useStorage`-backed persistence). Browser
   * `EventSource` only auto-resumes within a SINGLE instance lifetime;
   * a fresh hook starts the ID at `''` unless seeded here. The standard
   * server-cooperation pattern is to read it from a URL query param:
   *
   * ```ts
   * const lastId = useStorage('chat-last-id', '')
   * const sse = useSSE({
   *   url: () => `/api/events?lastId=${lastId() || ''}`,
   *   initialLastEventId: lastId,
   *   onMessage: (msg) => lastId.set(msg.id),
   * })
   * ```
   *
   * Accepts a string or accessor. Read once at mount; subsequent changes
   * are ignored (use the reactive `url` for runtime overrides).
   */
  initialLastEventId?: string | (() => string)
  /** Called when a message is received — use queryClient to invalidate or update cache */
  onMessage?: (data: T, queryClient: QueryClient) => void
  /** Called when the EventSource connection opens */
  onOpen?: (event: Event) => void
  /** Called when a connection error occurs */
  onError?: (event: Event) => void
}

export interface UseSSEResult<T> {
  /** Last received message data */
  data: Signal<T | null>
  /** Current connection status */
  status: Signal<SSEStatus>
  /**
   * Last error: the connection's error `Event`, or the `Error` thrown by
   * `parse` for a malformed message. Cleared by the next good message.
   */
  error: Signal<Event | Error | null>
  /** Last `id` field received from the server (per SSE spec) */
  lastEventId: () => string
  /** EventSource readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED */
  readyState: () => number
  /** Manually close the connection */
  close: () => void
  /** Manually reconnect */
  reconnect: () => void
}

// ─── useSSE ─────────────────────────────────────────────────────────────────

/**
 * Reactive Server-Sent Events hook that integrates with TanStack Query.
 * Automatically manages connection lifecycle, reconnection, and cleanup.
 *
 * Use the `onMessage` callback to invalidate or update query cache
 * when the server pushes data.
 *
 * @example
 * ```ts
 * const sse = useSSE({
 *   url: '/api/events',
 *   parse: JSON.parse,
 *   onMessage: (data, queryClient) => {
 *     if (data.type === 'order-updated') {
 *       queryClient.invalidateQueries({ queryKey: ['orders'] })
 *     }
 *   },
 * })
 * // sse.data()    — last received message (parsed)
 * // sse.status()  — 'connecting' | 'connected' | 'disconnected' | 'error'
 * // sse.error()   — last error event or null
 * ```
 */
export function useSSE<T = string>(options: UseSSEOptions<T>): UseSSEResult<T> {
  const queryClient = useQueryClient()
  const data = signal<T | null>(null)
  const status = signal<SSEStatus>('disconnected')
  const error = signal<Event | Error | null>(null)
  // Seed the lastEventId from `initialLastEventId` so consumers can resume
  // a stream across remount. EventSource has no API to set
  // a Last-Event-ID header on the FIRST connection — server cooperation
  // (URL query param) is required. The seed makes the value available
  // immediately so the consumer's `url` function can read it.
  const initialId =
    typeof options.initialLastEventId === 'function'
      ? options.initialLastEventId()
      : (options.initialLastEventId ?? '')
  const lastEventId = signal(initialId)
  const readyState = signal<number>(2) // Start as CLOSED until connected

  let es: EventSource | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  const reconnectEnabled = options.reconnect !== false
  const baseDelay = options.reconnectDelay ?? 1000
  const maxAttempts = options.maxReconnectAttempts ?? 10
  const maxDelay = options.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY
  const eventNames = options.events
    ? Array.isArray(options.events)
      ? options.events
      : [options.events]
    : null

  function getUrl(): string {
    return typeof options.url === 'function' ? options.url() : options.url
  }

  function isEnabled(): boolean {
    if (options.enabled === undefined) return true
    return typeof options.enabled === 'function' ? options.enabled() : options.enabled
  }

  function handleMessage(event: MessageEvent): void {
    // Track lastEventId from the SSE spec
    if (event.lastEventId !== undefined && event.lastEventId !== '') {
      lastEventId.set(event.lastEventId)
    }

    let parsed: T
    try {
      parsed = options.parse ? options.parse(event.data as string) : (event.data as T)
    } catch (err) {
      // A malformed payload is a real, observable failure: surface it on
      // `error()` (keeping the last good `data()`), instead of dropping it.
      error.set(err instanceof Error ? err : new Error(String(err)))
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] useSSE: parse() threw for an incoming message:', err)
      }
      return
    }

    batch(() => {
      data.set(parsed)
      error.set(null)
    })

    try {
      options.onMessage?.(parsed, queryClient)
    } catch (err) {
      // A throwing handler must not take the stream down — but swallowing it
      // silently hides real bugs. Report it in dev.
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] useSSE: the onMessage handler threw:', err)
      }
    }
  }

  function attachListeners(source: EventSource): void {
    if (eventNames) {
      for (const name of eventNames) {
        source.addEventListener(name, handleMessage as EventListener)
      }
    } else {
      source.onmessage = handleMessage
    }
  }

  function removeListeners(source: EventSource): void {
    source.onopen = null
    source.onmessage = null
    source.onerror = null

    if (eventNames) {
      for (const name of eventNames) {
        source.removeEventListener(name, handleMessage as EventListener)
      }
    }
  }

  function handleError(event: Event): void {
    // batch() so consumers reading any 2 of {status, error, readyState}
    // (typical: a UI showing connection state + error message) get
    // notified once per error event, not three times. Fires on every
    // EventSource error.
    batch(() => {
      status.set('error')
      error.set(event)
      readyState.set(es?.readyState ?? EventSource.CLOSED)
    })
    options.onError?.(event)

    // EventSource auto-reconnects for transient errors, but if readyState is CLOSED
    // the browser has given up and we need to handle reconnection ourselves
    if (es?.readyState === EventSource.CLOSED) {
      removeListeners(es)
      es.close()
      es = null
      if (!intentionalClose && reconnectEnabled) {
        scheduleReconnect()
      }
    }
  }

  // Cancel any pending reconnect timer. Called before (re)connecting and
  // before scheduling a fresh reconnect, so a stale timer can never fire a
  // spurious extra connect() after the EventSource has already been
  // re-established (reactive url change, manualReconnect, or a rapid error).
  function clearReconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function connect(): void {
    // A connect supersedes any pending reconnect — drop the orphan timer.
    clearReconnect()
    // Clean up existing connection
    if (es) {
      removeListeners(es)
      es.close()
      es = null
    }

    if (!isEnabled()) {
      status.set('disconnected')
      return
    }

    status.set('connecting')

    try {
      es = new EventSource(getUrl(), {
        withCredentials: options.withCredentials ?? false,
      })
      readyState.set(EventSource.CONNECTING)
    } catch {
      // batch() the EventSource-construction-failure path: 3 sets fire
      // sequentially (status('connecting') from before the try, then
      // status('error') + readyState(CLOSED) here in catch). Without
      // batch, a subscriber bound to both status + readyState gets
      // notified twice per failed connect. Hot path on flaky networks.
      batch(() => {
        status.set('error')
        readyState.set(EventSource.CLOSED)
      })
      scheduleReconnect()
      return
    }

    es.onopen = (event: Event) => {
      batch(() => {
        status.set('connected')
        error.set(null)
        readyState.set(EventSource.OPEN)
        reconnectAttempts = 0
      })
      options.onOpen?.(event)
    }

    attachListeners(es)
    es.onerror = handleError
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
    // second error would otherwise orphan the first timer).
    clearReconnect()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!intentionalClose && isEnabled()) {
        connect()
      }
    }, delay)
  }

  function close(): void {
    intentionalClose = true
    clearReconnect()
    if (es) {
      removeListeners(es)
      es.close()
      es = null
    }
    status.set('disconnected')
    readyState.set(EventSource.CLOSED)
  }

  function manualReconnect(): void {
    intentionalClose = false
    reconnectAttempts = 0
    connect()
  }

  // Track reactive URL and enabled state — reconnect when either changes.
  // Respect intentionalClose: if the user explicitly called close(), a
  // later change to a tracked signal (reactive `url`/`enabled` — the
  // documented pattern) must NOT silently flip the stream back on
  // against their intent. Mirrors useSubscription. Use manualReconnect()
  // to resume after an explicit close.
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
    data,
    status,
    error,
    lastEventId: () => lastEventId(),
    readyState: () => readyState(),
    close,
    reconnect: manualReconnect,
  }
}
