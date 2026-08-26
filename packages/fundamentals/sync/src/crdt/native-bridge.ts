import { observeMapKey } from './map-dispatch'
import { PyreonCrdtDoc } from './pyreon-adapter'
import {
  type WebSocketCtor,
  connectPyreonSync,
  webSocketChannel,
} from './pyreon-sync-transport'

/**
 * The JS side of the native sync bridge — the contract a native runtime host
 * (JavaScriptCore on iOS, a JS engine on Android) drives.
 *
 * HOW THE HOST USES IT. The native `PyreonSync` service:
 *   1. creates a JS context and evaluates the `@pyreon/sync` bundle,
 *   2. injects a `WebSocketCtor` backed by the platform socket (the same
 *      `PyreonWebSocket` the native `useWebSocket` uses), and calls
 *      {@link createNativeSyncHost},
 *   3. for each synced key the native UI binds, calls {@link NativeSyncHost.observe}
 *      with a callback that sets the corresponding native signal
 *      (`@State` / `mutableStateOf`),
 *   4. on a native UI write, calls {@link NativeSyncHost.set}.
 *
 * The engine + transport + this bridge are PURE JS, so the SAME code runs on web
 * and in the native JS runtime — that is the 1:1 pairing. The host is thin: it
 * owns the JS↔native value marshalling and the signal wiring, nothing about CRDT
 * merge or the wire protocol (those live here, identically everywhere).
 *
 * Values crossing the boundary are v1 scalars (string / number / boolean / null)
 * — JSON-serializable and JS-runtime-marshallable by construction.
 */
export interface NativeSyncHost {
  /**
   * Observe a synced key. Fires the callback IMMEDIATELY with the current value
   * (so the native signal seeds correctly), then on every change (local or
   * remote). Returns an unsubscribe.
   */
  observe(map: string, key: string, cb: (value: unknown) => void): () => void
  /** Write a synced key (a native UI edit). Relays to peers via the transport. */
  set(map: string, key: string, value: unknown): void
  /** Whether a key currently has a value. */
  has(map: string, key: string): boolean
  /** Tear down the transport + document. */
  destroy(): void
}

export interface NativeSyncHostOptions {
  /** This peer's stable id (the LWW tie-breaker) — a persisted per-install id. */
  actor: string
  /** Relay URL. Omit for a local-only doc (no transport). */
  url?: string
  /** The platform WebSocket ctor the host injects (bridged `PyreonWebSocket`).
   *  Falls back to `globalThis.WebSocket` (present on web + Node 21+). */
  WebSocketImpl?: WebSocketCtor
}

/**
 * Create a native sync host over the pure-TS LWW engine + transport. Everything
 * here runs identically on web and in the native JS runtime.
 */
export function createNativeSyncHost(opts: NativeSyncHostOptions): NativeSyncHost {
  const doc = new PyreonCrdtDoc(opts.actor)
  let transport: { disconnect: () => void } | undefined
  if (opts.url !== undefined) {
    transport = connectPyreonSync(doc, webSocketChannel(opts.url, opts.WebSocketImpl))
  }

  return {
    observe(mapName, key, cb) {
      const map = doc.getMap(mapName)
      cb(map.get(key)) // seed the native signal with the current value
      // Same per-key routing as syncedSignal: one dispatcher observer per map
      // (see map-dispatch.ts) instead of one raw filtering observer per key.
      return observeMapKey(map, key, () => cb(map.get(key)))
    },
    set(mapName, key, value) {
      doc.transact(() => doc.getMap(mapName).set(key, value))
    },
    has(mapName, key) {
      return doc.getMap(mapName).has(key)
    },
    destroy() {
      transport?.disconnect()
      doc.destroy()
    },
  }
}
