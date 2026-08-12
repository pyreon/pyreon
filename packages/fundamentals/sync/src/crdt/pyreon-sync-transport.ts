import { type PyreonCrdtDoc, type PyreonCrdtOp } from './pyreon-adapter'
import { REMOTE_ORIGIN } from './types'

/**
 * Client sync transport for the pure-TS {@link PyreonCrdtDoc} engine.
 *
 * Pure JS + JSON only — no `yjs`, no binary framing — so the SAME transport runs
 * on web AND inside a native JS runtime (JavaScriptCore) bridged to native
 * signals. That is the multiplatform path: PMTC compiles the UI (primitives) to
 * SwiftUI/Compose while the engine + this transport execute as the identical JS
 * on every platform.
 *
 * Wire format: one message shape, `{ ops: PyreonCrdtOp[] }`. On open a peer sends
 * its FULL state (each register carries its own (clock, actor) stamp, so a state
 * dump merges convergently in any order); thereafter it sends only its local
 * ops. Inbound ops are merged under {@link REMOTE_ORIGIN}. Echo-prevention is
 * structural: {@link PyreonCrdtDoc.applyOps} fires observers but emits NO ops, so
 * a received update is never re-broadcast.
 */

/** The minimal duplex a transport binding must provide (a WebSocket, a WebView
 *  postMessage bridge, an in-memory pair for tests — anything string-duplex). */
export interface SyncChannel {
  send(data: string): void
  onMessage(cb: (data: string) => void): void
  /** Fires when the channel is ready to send. Fire immediately if already open. */
  onOpen(cb: () => void): void
  close(): void
}

interface SyncMessage {
  ops: PyreonCrdtOp[]
}

function isSyncMessage(v: unknown): v is SyncMessage {
  return typeof v === 'object' && v !== null && Array.isArray((v as SyncMessage).ops)
}

/**
 * Wire a {@link PyreonCrdtDoc} to a peer over `channel`. Returns a disposer that
 * stops relaying local ops and closes the channel.
 */
export function connectPyreonSync(
  doc: PyreonCrdtDoc,
  channel: SyncChannel,
): { disconnect: () => void } {
  // On open, hand the peer our full state.
  channel.onOpen(() => {
    channel.send(JSON.stringify({ ops: doc.encodeState() }))
  })

  // Relay LOCAL ops as they commit. `applyOps` (remote merges) emits nothing, so
  // this never re-broadcasts a received update.
  const offOps = doc._onOps((ops) => {
    channel.send(JSON.stringify({ ops }))
  })

  // Merge inbound ops. A malformed/foreign message is ignored, never thrown.
  channel.onMessage((data) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (isSyncMessage(parsed) && parsed.ops.length > 0) {
      doc.applyOps(parsed.ops, REMOTE_ORIGIN)
    }
  })

  return {
    disconnect() {
      offOps()
      channel.close()
    },
  }
}

/** A `WebSocket`-like handle (browser `WebSocket`, Node's global, `ws`, or a
 *  native JS-runtime shim). Uses the `onmessage`/`onopen` property handlers —
 *  one each, never nulled — so the channel owns a single listener per event. */
export interface WebSocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((ev: { data?: unknown }) => void) | null
}
export type WebSocketCtor = new (url: string) => WebSocketLike

/**
 * A {@link SyncChannel} over a WebSocket. Defaults to `globalThis.WebSocket`
 * (browsers + Node 21+; on native the bridge injects the platform socket). Pass
 * `WebSocketImpl` to inject `ws` (Node relay tests) or a native shim.
 */
export function webSocketChannel(
  url: string,
  WebSocketImpl?: WebSocketCtor,
): SyncChannel {
  const Ctor = (WebSocketImpl ??
    (globalThis as { WebSocket?: WebSocketCtor }).WebSocket) as WebSocketCtor | undefined
  if (!Ctor) {
    throw new Error(
      '[Pyreon] sync: no WebSocket implementation. Pass `WebSocketImpl` (e.g. `ws` on older Node).',
    )
  }
  const ws = new Ctor(url)
  return {
    send: (data) => ws.send(data),
    onMessage: (cb) => {
      ws.onmessage = (ev) => cb(String(ev.data ?? ''))
    },
    onOpen: (cb) => {
      ws.onopen = () => cb()
    },
    close: () => ws.close(),
  }
}
