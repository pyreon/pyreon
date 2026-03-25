import { onUnmount } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import { batch, effect, signal } from "@pyreon/reactivity"
import type { QueryClient } from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "connecting" | "connected" | "disconnected" | "error"

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
  /** Initial reconnect delay in ms — doubles on each retry, default: 1000 */
  reconnectDelay?: number
  /** Maximum reconnect attempts — default: 10, 0 = unlimited */
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
  const status = signal<SubscriptionStatus>("disconnected")

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  const reconnectEnabled = options.reconnect !== false
  const baseDelay = options.reconnectDelay ?? 1000
  const maxAttempts = options.maxReconnectAttempts ?? 10

  function getUrl(): string {
    return typeof options.url === "function" ? options.url() : options.url
  }

  function isEnabled(): boolean {
    if (options.enabled === undefined) return true
    return typeof options.enabled === "function" ? options.enabled() : options.enabled
  }

  function connect(): void {
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }

    if (!isEnabled()) {
      status.set("disconnected")
      return
    }

    status.set("connecting")

    try {
      ws = options.protocols ? new WebSocket(getUrl(), options.protocols) : new WebSocket(getUrl())
    } catch {
      status.set("error")
      scheduleReconnect()
      return
    }

    ws.onopen = (event) => {
      batch(() => {
        status.set("connected")
        reconnectAttempts = 0
      })
      options.onOpen?.(event)
    }

    ws.onmessage = (event) => {
      try {
        options.onMessage(event, queryClient)
      } catch {
        // Message handler errors should not crash the subscription
      }
    }

    ws.onclose = (event) => {
      status.set("disconnected")
      options.onClose?.(event)

      if (!intentionalClose && reconnectEnabled) {
        scheduleReconnect()
      }
    }

    ws.onerror = (event) => {
      status.set("error")
      options.onError?.(event)
    }
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

  function send(data: string | Blob | BufferSource): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  function close(): void {
    intentionalClose = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
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
    status,
    send,
    close,
    reconnect: manualReconnect,
  }
}
