import { onUnmount } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import { batch, effect, signal } from "@pyreon/reactivity"
import type { QueryClient } from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

// ─── Types ───────────────────────────────────────────────────────────────────

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error"

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
  /** Initial reconnect delay in ms — doubles on each retry, default: 1000 */
  reconnectDelay?: number
  /** Maximum reconnect attempts — default: 10, 0 = unlimited */
  maxReconnectAttempts?: number
  /** Whether to send cookies with the request — default: false */
  withCredentials?: boolean
  /** Called when a message is received — use queryClient to invalidate or update cache */
  onMessage?: (data: T, queryClient: QueryClient) => void
  /** Called when a connection error occurs */
  onError?: (event: Event) => void
}

export interface UseSSEResult<T> {
  /** Last received message data */
  data: Signal<T | null>
  /** Current connection status */
  status: Signal<SSEStatus>
  /** Last error event */
  error: Signal<Event | null>
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
  const status = signal<SSEStatus>("disconnected")
  const error = signal<Event | null>(null)

  let es: EventSource | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  const reconnectEnabled = options.reconnect !== false
  const baseDelay = options.reconnectDelay ?? 1000
  const maxAttempts = options.maxReconnectAttempts ?? 10
  const eventNames = options.events
    ? Array.isArray(options.events)
      ? options.events
      : [options.events]
    : null

  function getUrl(): string {
    return typeof options.url === "function" ? options.url() : options.url
  }

  function isEnabled(): boolean {
    if (options.enabled === undefined) return true
    return typeof options.enabled === "function" ? options.enabled() : options.enabled
  }

  function handleMessage(event: MessageEvent): void {
    try {
      const parsed = options.parse ? options.parse(event.data as string) : (event.data as T)
      batch(() => {
        data.set(parsed)
        error.set(null)
      })
      options.onMessage?.(parsed, queryClient)
    } catch {
      // Message handler errors should not crash the subscription
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
    status.set("error")
    error.set(event)
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

  function connect(): void {
    // Clean up existing connection
    if (es) {
      removeListeners(es)
      es.close()
      es = null
    }

    if (!isEnabled()) {
      status.set("disconnected")
      return
    }

    status.set("connecting")

    try {
      es = new EventSource(getUrl(), {
        withCredentials: options.withCredentials ?? false,
      })
    } catch {
      status.set("error")
      scheduleReconnect()
      return
    }

    es.onopen = () => {
      batch(() => {
        status.set("connected")
        error.set(null)
        reconnectAttempts = 0
      })
    }

    attachListeners(es)
    es.onerror = handleError
  }

  function scheduleReconnect(): void {
    if (!reconnectEnabled) return
    if (maxAttempts > 0 && reconnectAttempts >= maxAttempts) return

    const delay = baseDelay * 2 ** reconnectAttempts
    reconnectAttempts++

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!intentionalClose && isEnabled()) {
        connect()
      }
    }, delay)
  }

  function close(): void {
    intentionalClose = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (es) {
      removeListeners(es)
      es.close()
      es = null
    }
    status.set("disconnected")
  }

  function manualReconnect(): void {
    intentionalClose = false
    reconnectAttempts = 0
    connect()
  }

  // Track reactive URL and enabled state
  effect(() => {
    // Read reactive values to subscribe to changes
    if (typeof options.url === "function") options.url()
    if (typeof options.enabled === "function") options.enabled()

    intentionalClose = false
    reconnectAttempts = 0
    connect()
  })

  // Cleanup on unmount
  onUnmount(() => close())

  return {
    data,
    status,
    error,
    close,
    reconnect: manualReconnect,
  }
}
