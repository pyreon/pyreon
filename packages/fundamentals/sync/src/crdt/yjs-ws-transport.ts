import * as Y from 'yjs'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { REMOTE_ORIGIN } from './types'
import { peekDocAwareness } from './yjs-awareness'
import type { YjsCrdtDoc } from './yjs-adapter'
import {
  MSG_AWARENESS,
  MSG_STATE_VECTOR,
  MSG_UPDATE,
  decodeSyncMessage,
  encodeSyncMessage,
  toBytes,
} from './ws-protocol'

/** The `{ added, updated, removed }` clientId lists a y-protocols awareness event carries. */
interface AwarenessChange {
  added: number[]
  updated: number[]
  removed: number[]
}

type WebSocketCtor = new (url: string) => WebSocket

export interface WebSocketTransportOptions {
  /** Reconnect with exponential backoff after an unexpected close. Default `true`. */
  reconnect?: boolean
  /** Cap on the reconnect backoff, in ms. Default `10_000`. */
  maxBackoffMs?: number
  /**
   * WebSocket implementation. Defaults to `globalThis.WebSocket` (browsers,
   * Node 22+, Bun, Deno). Pass one explicitly on older Node (e.g. the `ws`
   * package's `WebSocket`).
   */
  WebSocketImpl?: WebSocketCtor
  /** Fired after the socket opens and the sync handshake is sent. */
  onConnect?: () => void
  /** Fired on close / error. */
  onDisconnect?: () => void
}

export interface WebSocketTransport {
  /** Close the socket and stop reconnecting. Idempotent. */
  disconnect(): void
  /** Whether the socket is currently open. */
  readonly connected: boolean
}

/**
 * Sync a {@link YjsCrdtDoc} to a relay over WebSocket — the cross-DEVICE
 * transport (vs `connectViaBroadcastChannel`, which is same-origin tabs only).
 * The wire protocol is the same minimal sync handshake (state vector → diff,
 * then live updates) as the other transports:
 *
 * - on open, send our state vector — the relay replies with whatever we're missing;
 * - on receiving a state vector, reply with `encodeStateAsUpdate(doc, theirSv)`;
 * - on receiving an update, `applyUpdate(..., REMOTE)` so it is NOT echoed back;
 * - on a local (non-REMOTE) update, send it.
 *
 * Same echo rule as the other transports — a `REMOTE`-origin update is never
 * re-sent, so there is no loop. Reconnects with exponential backoff by default.
 * Browser-only-safe to IMPORT under Node/SSR (it touches `WebSocket` only when
 * called); pass `WebSocketImpl` where there is no global `WebSocket`.
 *
 * Point it at a {@link createSyncServer} relay (`@pyreon/sync/server`), or any
 * server speaking this protocol. Auth: put a token in the `url` query (browser
 * WebSockets can't set headers); the relay's `authorize` hook reads it.
 */
export function connectViaWebSocket(
  doc: YjsCrdtDoc,
  url: string,
  options: WebSocketTransportOptions = {},
): WebSocketTransport {
  // Resolve the WebSocket constructor: an explicit impl, else the global one
  // (browsers / Node 22+ / Bun / Deno). The `typeof` guard keeps this SSR-safe
  // — the function is import-safe under Node/SSR and only touches `WebSocket`
  // when actually called, and only where the global exists.
  const resolved =
    options.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined)
  if (!resolved) {
    throw new Error(
      '[Pyreon] connectViaWebSocket: no WebSocket implementation found. Pass `WebSocketImpl` (e.g. the `ws` package) on a runtime without a global WebSocket.',
    )
  }
  const WS: WebSocketCtor = resolved
  const reconnect = options.reconnect ?? true
  const maxBackoff = options.maxBackoffMs ?? 10_000

  let ws: WebSocket | null = null
  let closed = false
  let connected = false
  let attempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return
    if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(encodeSyncMessage(MSG_UPDATE, update))
    }
  }
  doc.yDoc.on('update', onUpdate)

  // Awareness (ephemeral presence) rides the SAME socket on a separate message
  // type. Wired ONLY when the app opted in by creating a `syncedAwareness` for
  // this doc (peek, don't create — doc-only apps pay nothing). Reuse the SHARED
  // REMOTE_ORIGIN doc-update tag so a received awareness is applied but NOT
  // re-sent by this OR a sibling transport — the cross-transport (WS↔Broadcast
  // Channel) loop guard.
  const aw = peekDocAwareness(doc)
  const onAwarenessUpdate =
    aw &&
    (({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return
      if (ws && ws.readyState === 1) {
        const changed = [...added, ...updated, ...removed]
        ws.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(aw, changed)))
      }
    })
  if (aw && onAwarenessUpdate) aw.on('update', onAwarenessUpdate)

  const scheduleReconnect = () => {
    attempt++
    const delay = Math.min(maxBackoff, 100 * 2 ** attempt)
    // Track the timer so `disconnect()` can cancel a pending reconnect — without
    // this the closure (and the doc reference it captures) is pinned for up to
    // `maxBackoff` ms after disconnect (a leak; Class I — orphaned setTimeout).
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!closed) open()
    }, delay)
  }

  function open(): void {
    if (closed) return
    ws = new WS(url)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      attempt = 0
      connected = true
      ws?.send(encodeSyncMessage(MSG_STATE_VECTOR, Y.encodeStateVector(doc.yDoc)))
      // Publish our full local presence so the relay + peers learn us — also
      // re-runs on every reconnect, re-establishing presence after a drop.
      if (aw) ws?.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(aw, [aw.clientID])))
      options.onConnect?.()
    }
    ws.onmessage = (event: MessageEvent) => {
      void toBytes(event.data).then((bytes) => {
        if (closed || bytes.length === 0) return
        // Defensive: a buggy / hostile relay can send a garbage frame, and Yjs
        // THROWS on a malformed update / state vector (even an empty one). Without
        // this guard the throw escapes the `.then` as an UNHANDLED rejection
        // (which can hard-crash a Node host). Drop the bad frame instead.
        try {
          const { type, payload } = decodeSyncMessage(bytes)
          if (type === MSG_STATE_VECTOR) {
            ws?.send(encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(doc.yDoc, payload)))
          } else if (type === MSG_AWARENESS) {
            // Apply under REMOTE_ORIGIN so our send-listener doesn't echo it back.
            if (aw) applyAwarenessUpdate(aw, payload, REMOTE_ORIGIN)
          } else {
            Y.applyUpdate(doc.yDoc, payload, REMOTE_ORIGIN)
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              '[Pyreon] connectViaWebSocket: dropped a malformed frame from the relay:',
              err,
            )
          }
        }
      })
    }
    ws.onclose = (event: CloseEvent) => {
      connected = false
      options.onDisconnect?.()
      // 4401 = the relay's `authorize` rejection. Terminal — don't hammer it.
      if (event.code === 4401) closed = true
      if (!closed && reconnect) scheduleReconnect()
    }
    ws.onerror = () => {
      // `onclose` always follows an error — reconnect is handled there.
    }
  }

  open()

  return {
    get connected() {
      return connected
    },
    disconnect() {
      closed = true
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      doc.yDoc.off('update', onUpdate)
      if (aw && onAwarenessUpdate) {
        // Announce our departure WHILE the socket is still open (the listener
        // is still attached, so the removal broadcasts), THEN detach. The
        // relay's socket-close cleanup is the real guarantee — this is the fast
        // path (and the only path on a relay-less direct link).
        try {
          removeAwarenessStates(aw, [aw.clientID], 'local')
        } catch {
          // awareness already destroyed (primitive disposed first) — nothing to announce
        }
        aw.off('update', onAwarenessUpdate)
      }
      ws?.close()
      ws = null
    },
  }
}
