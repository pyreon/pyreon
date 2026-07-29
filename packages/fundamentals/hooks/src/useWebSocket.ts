// useWebSocket — a live text socket, shared across web / iOS / Android.
//
// The native half already existed on both targets: PMTC lowers
// `useWebSocket(url)` to `PyreonWebSocket`, and the emitters synthesize an
// implicit auto-connect-on-mount so a component never has to call `connect()`
// itself. The WEB half did not exist — no implementation, no export, no type
// anywhere outside `packages/native/`.
//
// That gap is the same one `useGeolocation` and `useDatabase` had, and it fails
// the same way: PMTC matches hook NAMES and never resolves imports, so
// `import { useWebSocket } from '@pyreon/hooks'` compiles for iOS and Android
// while being an unresolvable import on web. The compiler's own
// `lowered-hooks-typecheck` fixture already writes exactly that import.
//
// FIELD NAMES AND SEMANTICS MIRROR `PyreonWebSocket` EXACTLY, because the whole
// point is that one component body reads the same members on three targets:
//
//   lastMessage   String?   -> string | null
//   messages      [String]  -> string[]
//   isConnected   Bool      -> boolean
//   error         Error?    -> string | null   (rendered, so a string)
//   connect / send / close
//
// `error` is a STRING rather than an Error to match what the native side can
// render: the compiler's SERVICE_OPTIONAL_FIELDS types `websocket.error` as
// `string`, and an interpolated Swift Optional renders `Optional("boom")` —
// the exact defect that bit `useGeolocation`'s `Double?`. Keeping the web type
// narrower than JS would allow is what keeps one source valid on all three.
//
// Getters over signals, not plain values: a component body runs ONCE, so
// returning `{ isConnected: isConnected() }` would freeze at its mount value.
// The getters make `ws.isConnected` re-read the signal at each access, which is
// how the native `@Observable` / `mutableStateOf` fields behave.
//
// HONEST LIMITS, stated because a socket that silently stops delivering is
// worse than one that never connected:
//   - TEXT frames only. `PyreonWebSocket` is text-only (`task.send(.string:)`,
//     and `received(_ text: String)`), so a binary frame is IGNORED here rather
//     than stringified into something the native side could never produce.
//   - No automatic reconnect or backoff. The native half has none either;
//     adding it on one target only would make the targets disagree.
//   - `messages` grows without bound, like `[String]` natively. A long-lived
//     feed should read `lastMessage` and keep its own bounded history.

import { batch, isServer, onCleanup, signal } from '@pyreon/reactivity'

/** Live socket handle. Mirrors the native `PyreonWebSocket` container. */
export interface UseWebSocketResult {
  /** Most recent inbound text frame, or `null` before the first message. */
  readonly lastMessage: string | null
  /** Every inbound text frame in arrival order. */
  readonly messages: string[]
  /** True between open and close/failure. */
  readonly isConnected: boolean
  /** Most recent failure, or `null` on success / before first connect. */
  readonly error: string | null
  /** Open the socket. No-op when already open — matches the native guard. */
  connect(): void
  /** Send a text frame. No-op when not connected. */
  send(text: string): void
  /** Close the socket. Safe when not open, and safe to call twice. */
  close(): void
}

/** Options. `autoConnect` mirrors the emitters' synthesized connect-on-mount. */
export interface UseWebSocketOptions {
  /**
   * Connect as soon as the component mounts. Default `true`, because both
   * native emitters synthesize that call — defaulting to `false` on web would
   * make the identical source behave differently per target.
   */
  readonly autoConnect?: boolean
}

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketResult {
  const lastMessage = signal<string | null>(null)
  const messages = signal<string[]>([])
  const isConnected = signal(false)
  const error = signal<string | null>(null)

  // Lifecycle flag, deliberately SEPARATE from `isConnected` — the same split
  // the Swift container makes between `_connected` and `isConnected`. After a
  // failure the socket is dead (`isConnected === false`) but the lifecycle is
  // still open until `close()` cleans up, so guarding `connect` on the
  // reactive flag would allow a double-open.
  let open = false
  let sock: WebSocket | null = null

  const connect = (): void => {
    // No WebSocket during SSR, and none in a runtime without it. Silent no-op
    // rather than a throw: a component that renders on the server and connects
    // on the client is the normal case, not an error.
    if (isServer || typeof WebSocket === 'undefined') return
    if (open) return
    open = true
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (cause) {
      // An invalid URL throws SYNCHRONOUSLY from the constructor rather than
      // firing onerror, so without this the failure would escape the hook and
      // leave `open` stuck true — no further connect would ever be attempted.
      open = false
      error.set(`[Pyreon] useWebSocket: could not open "${url}": ${String(cause)}`)
      return
    }
    sock = ws
    ws.onopen = () => {
      batch(() => {
        isConnected.set(true)
        error.set(null) // cleared on open, matching Swift's `opened()`
      })
    }
    ws.onmessage = (event: MessageEvent) => {
      // Text frames only — see the header note. A Blob/ArrayBuffer payload is
      // dropped rather than coerced, because the native half can only ever
      // deliver a String and a coerced "[object Blob]" would be a target
      // difference disguised as data.
      if (typeof event.data !== 'string') return
      const text = event.data
      batch(() => {
        lastMessage.set(text)
        messages.set([...messages.peek(), text])
      })
    }
    ws.onerror = () => {
      // The browser deliberately withholds error detail (it is a
      // cross-origin-information leak), so there is nothing more specific to
      // report here than that the socket failed.
      batch(() => {
        isConnected.set(false)
        error.set(`[Pyreon] useWebSocket: connection to "${url}" failed`)
      })
    }
    ws.onclose = () => {
      open = false
      sock = null
      isConnected.set(false)
    }
  }

  const send = (text: string): void => {
    // `readyState` rather than the reactive flag: a frame sent between
    // construction and `onopen` would throw InvalidStateError, and the native
    // `send` is a documented no-op when not connected.
    if (sock === null || sock.readyState !== WebSocket.OPEN) return
    sock.send(text)
  }

  const close = (): void => {
    if (!open) return
    open = false
    const ws = sock
    sock = null
    if (ws !== null) {
      // Drop the handlers BEFORE closing. A frame already queued can otherwise
      // arrive between close() and teardown and write into a disposed
      // component's signals.
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
    }
    isConnected.set(false)
  }

  if (options.autoConnect !== false) connect()
  // Sockets are the textbook leak: without this, a closed component keeps a
  // live connection and its handlers keep writing to signals nothing reads.
  onCleanup(close)

  return {
    get lastMessage() {
      return lastMessage()
    },
    get messages() {
      return messages()
    },
    get isConnected() {
      return isConnected()
    },
    get error() {
      return error()
    },
    connect,
    send,
    close,
  }
}
