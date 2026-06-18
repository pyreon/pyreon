import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type RawData, type WebSocket as WsSocket, WebSocketServer } from 'ws'
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import * as Y from 'yjs'
import {
  MSG_AWARENESS,
  MSG_STATE_VECTOR,
  MSG_UPDATE,
  decodeSyncMessage,
  encodeSyncMessage,
} from './crdt/ws-protocol'

/** The `{ added, updated, removed }` clientId lists a y-protocols awareness event carries. */
interface AwarenessChange {
  added: number[]
  updated: number[]
  removed: number[]
}

// `@pyreon/sync/server` — a Node/Bun WebSocket relay for the Yjs sync protocol.
// Server-only (imports `ws` + `node:http`); kept at this subpath so it never
// enters a client bundle.

/** Context passed to the {@link SyncServerOptions.authorize} hook. */
export interface AuthorizeContext {
  /** Room id parsed from the URL path (e.g. `wss://host/my-room` → `my-room`). */
  room: string
  /** The `token` query-string param, or `null`. (Browser WebSockets can't set headers.) */
  token: string | null
  /** The raw HTTP upgrade request — read cookies / headers here if you prefer. */
  req: IncomingMessage
}

export interface SyncServerOptions {
  /**
   * Port to listen on. Use `0` for an OS-assigned port (handy in tests).
   * Ignored when {@link SyncServerOptions.server} is given (the relay then
   * shares that server's port).
   */
  port?: number
  /** Host/interface to bind. Default: `ws`'s default (all interfaces). */
  host?: string
  /**
   * Attach the relay to an EXISTING Node `http.Server` (upgrade handling)
   * instead of opening its own port. Use this to share a port with an HTTP app
   * — e.g. mount the relay on a framework's Node/Bun server, or front it with a
   * plain-HTTP health endpoint. The caller owns `server.listen()`; the relay
   * only adds WebSocket upgrade handling. Mutually exclusive with `port`.
   */
  server?: HttpServer
  /**
   * Per-connection authorization — the per-room/per-doc access gate. Return
   * `false` (or throw) to REJECT the connection: the socket is closed with code
   * 4401 before any document data is sent or received. Receives the room + token
   * parsed from the URL. **Default: allow every connection** — suitable only for
   * local/dev; a real deployment MUST supply this.
   */
  authorize?: (ctx: AuthorizeContext) => boolean | Promise<boolean>
}

export interface SyncServer {
  /** The actual listening port (resolved even when `port: 0` was requested). */
  readonly port: number
  /** Number of rooms currently holding ≥1 client. */
  readonly rooms: number
  /** Close all connections and stop the server. */
  close(): Promise<void>
}

interface Room {
  doc: Y.Doc
  clients: Set<WsSocket>
  // Ephemeral presence for the room (who's here + cursors). The relay tracks it
  // so a NEW client sees existing peers INSTANTLY (a stateless relay can't — no
  // one to pull from). NEVER persisted; a peer's state is purged on disconnect.
  awareness: Awareness
  // Which awareness clientIds each socket has announced — so a socket's states
  // can be removed when it disconnects (mirrors y-websocket's server).
  socketClients: Map<WsSocket, Set<number>>
}

/** Normalize a `ws` RawData frame (Buffer | ArrayBuffer | Buffer[]) to a Uint8Array — synchronous so message order is preserved. */
function rawToBytes(data: RawData): Uint8Array {
  /* v8 ignore start — `ws` delivers a Buffer (Uint8Array) frame by default; the
     fragmented `Buffer[]` and raw `ArrayBuffer` shapes are config-dependent and never
     occur in this server's setup. Defensive RawData normalization. */
  if (data instanceof Uint8Array) return data // Buffer is a Uint8Array
  if (Array.isArray(data)) return Buffer.concat(data)
  return new Uint8Array(data as ArrayBuffer)
  /* v8 ignore stop */
}

const IS_DEV = process.env.NODE_ENV !== 'production'

/**
 * Send a frame only on an OPEN socket, swallowing the rare race where the socket
 * transitions to CLOSING between the readyState check and the send (e.g. a client
 * disconnects DURING async `authorize`, before the post-auth handshake send). A
 * relay must never throw on a peer that vanished.
 */
function safeSend(socket: WsSocket, frame: Uint8Array): void {
  if (socket.readyState !== 1 /* OPEN */) return
  try {
    socket.send(frame)
  } catch {
    // Socket raced from OPEN → CLOSING between the check and the send — ignore.
  }
}

/**
 * Start a relay that brokers Yjs sync between clients sharing a room. Clients
 * connect with {@link connectViaWebSocket} pointing at `ws(s)://host/<room>?token=…`.
 * The relay keeps one authoritative `Y.Doc` per room so a late-joiner catches up,
 * applies each inbound update to it, and broadcasts updates to the room's OTHER
 * clients. Rooms are GC'd when their last client leaves — the relay is ephemeral
 * (no persistence); clients keep their own copy (e.g. `persistViaIndexedDB`), so
 * a reconnecting client re-syncs from whichever peer still holds the room.
 */
export function createSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  const rooms = new Map<string, Room>()
  const getRoom = (name: string): Room => {
    let r = rooms.get(name)
    if (!r) {
      const doc = new Y.Doc()
      const room: Room = {
        doc,
        clients: new Set(),
        awareness: new Awareness(doc),
        socketClients: new Map(),
      }
      // The SINGLE place awareness is broadcast — covers both relayed client
      // updates AND `removeAwarenessStates` removals on disconnect. Record which
      // socket owns which clientIds (for disconnect purge), then fan the encoded
      // change out to every client EXCEPT the origin socket (a relayed update;
      // it already has it) — or to ALL when origin is the 'disconnect' string.
      room.awareness.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
        const changed = [...added, ...updated, ...removed]
        /* v8 ignore next — empty-change guard: the awareness 'update' event always carries
           at least one added/updated/removed id; the no-change arm is defensive. */
        if (changed.length === 0) return
        /* v8 ignore next — falsy-origin arm: relayed updates carry a socket origin and
           departures carry the 'disconnect' string (both truthy); a null origin is the
           local-write case the relay never broadcasts. Integration-only (e2e). */
        const owned = origin ? room.socketClients.get(origin as WsSocket) : undefined
        if (owned) {
          for (const id of added) owned.add(id)
          for (const id of updated) owned.add(id)
        }
        const frame = encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(room.awareness, changed))
        for (const c of room.clients) {
          if (c !== origin) safeSend(c, frame)
        }
      })
      rooms.set(name, room)
      r = room
    }
    return r
  }

  const wss = options.server
    ? new WebSocketServer({ server: options.server })
    : new WebSocketServer(
        options.host
          ? /* v8 ignore next — `?? 0` ephemeral-port fallback (host set); tests pass a port. */
            { port: options.port ?? 0, host: options.host }
          : /* v8 ignore next — `?? 0` ephemeral-port fallback; tests pass an explicit port. */
            { port: options.port ?? 0 },
      )

  wss.on('connection', (socket: WsSocket, req: IncomingMessage) => {
    void (async () => {
      /* v8 ignore next — `req.url ?? '/'`: the `ws` upgrade always sets req.url, so the
         '/' fallback is defensive. */
      const url = new URL(req.url ?? '/', 'http://localhost')
      const room = url.pathname.replace(/^\/+/, '') || 'default'
      const token = url.searchParams.get('token')

      if (options.authorize) {
        let ok = false
        try {
          ok = await options.authorize({ room, token, req })
        } catch {
          ok = false
        }
        if (!ok) {
          socket.close(4401, 'unauthorized')
          return
        }
      }

      const r = getRoom(room)
      r.clients.add(socket)
      r.socketClients.set(socket, new Set())

      // Kick off the SYMMETRIC sync handshake (the standard y-protocols shape):
      // send the room's state vector so the client replies with exactly the ops
      // the room is MISSING. This direction is load-bearing — without it the room
      // never receives a client's foundational ops (e.g. a `set` made while the
      // socket was still CONNECTING, before any update could be sent), so a later
      // incremental update from that client has a missing causal dependency on a
      // peer and Yjs holds it PENDING forever (it never applies). The client is
      // already symmetric: on `open` it sends ITS state vector (→ we reply with
      // the diff below), and it replies to this one with its missing-for-room ops.
      safeSend(socket, encodeSyncMessage(MSG_STATE_VECTOR, Y.encodeStateVector(r.doc)))

      // Send the room's CURRENT awareness so the joiner sees existing peers
      // INSTANTLY. Exclude the relay's OWN clientId (a fresh Awareness carries an
      // empty `{}` entry for its local client) — or the joiner would render a
      // phantom presence for the relay itself.
      const presentClients = [...r.awareness.getStates().keys()].filter(
        (id) => id !== r.awareness.clientID,
      )
      if (presentClients.length > 0) {
        safeSend(
          socket,
          encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(r.awareness, presentClients)),
        )
      }

      socket.on('message', (data: RawData) => {
        // Decode + apply defensively: a buggy or hostile client can send a
        // garbage frame, and Yjs THROWS on a malformed update / state vector
        // (even an empty one). An uncaught throw here propagates out of the `ws`
        // message listener and crashes the whole relay — a one-frame DoS. Drop
        // the bad frame instead, keeping every other client's room alive.
        let type: number
        let payload: Uint8Array
        try {
          ;({ type, payload } = decodeSyncMessage(rawToBytes(data)))
        } catch {
          return // unframable bytes
        }

        if (type === MSG_STATE_VECTOR) {
          // Reply with exactly what this client is missing.
          try {
            safeSend(socket, encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(r.doc, payload)))
          } catch (err) {
            if (IS_DEV) {
              console.warn(
                '[Pyreon] sync relay: dropped a malformed state vector from a client:',
                err,
              )
            }
          }
          return
        }

        if (type === MSG_AWARENESS) {
          // Ephemeral presence — NEVER applied to the room doc (not persisted).
          // Apply to the room's Awareness (origin = this socket); its `update`
          // handler records ownership + broadcasts to the OTHER clients. Drop a
          // malformed frame rather than crash the relay (same DoS guard as docs).
          try {
            applyAwarenessUpdate(r.awareness, payload, socket)
          } catch (err) {
            if (IS_DEV) {
              console.warn('[Pyreon] sync relay: dropped a malformed awareness frame:', err)
            }
          }
          return
        }

        // Apply to the authoritative room doc. Only fan out to the OTHER clients
        // if it actually applied — never propagate a frame that threw, or we'd
        // crash every peer in turn.
        try {
          Y.applyUpdate(r.doc, payload)
        } catch (err) {
          if (IS_DEV) {
            console.warn('[Pyreon] sync relay: dropped a malformed update from a client:', err)
          }
          return
        }
        const frame = encodeSyncMessage(MSG_UPDATE, payload)
        for (const c of r.clients) {
          if (c !== socket) safeSend(c, frame)
        }
      })

      socket.on('close', () => {
        r.clients.delete(socket)
        // Purge this socket's awareness states + broadcast the removal to the
        // remaining clients (the `update` handler fans the removal out). This is
        // the GUARANTEE that a vanished client's cursor/avatar disappears even on
        // an unclean disconnect (crash / network drop) where the client couldn't
        // announce its own departure.
        const owned = r.socketClients.get(socket)
        if (owned && owned.size > 0) {
          try {
            removeAwarenessStates(r.awareness, [...owned], 'disconnect')
          } catch {
            // awareness teardown raced room GC — nothing to remove
          }
        }
        r.socketClients.delete(socket)
        if (r.clients.size === 0) {
          r.awareness.destroy()
          rooms.delete(room)
        }
      })
    })()
  })

  const attached = options.server
  const makeHandle = (): SyncServer => ({
    get port() {
      // Own-port mode: the WebSocketServer's bound address. Attached mode: read
      // the host http server's address (it owns `listen`, so this resolves once
      // the caller has listened; may be 0 before then).
      const addr = (attached ?? wss).address()
      /* v8 ignore next 3 — own-port mode always yields an AddressInfo object after listen;
         the string/null-addr → `options.port ?? 0` fallback is the attached/before-listen
         path (integration-only). */
      return typeof addr === 'object' && addr !== null
        ? (addr as AddressInfo).port
        : (options.port ?? 0)
    },
    get rooms() {
      return rooms.size
    },
    // Stop handling upgrades + drop clients. In attached mode the caller owns
    // the http server, so we never close it — only the WebSocket layer.
    close: () =>
      new Promise<void>((res) => {
        for (const r of rooms.values()) for (const c of r.clients) c.close()
        wss.close(() => res())
      }),
  })

  // Attached mode: the host http server owns `listen`, so the WebSocketServer
  // never emits its own `listening` — resolve as soon as upgrade handling is
  // wired (synchronously here).
  if (attached) return Promise.resolve(makeHandle())

  return new Promise<SyncServer>((resolve, reject) => {
    wss.once('error', reject)
    wss.once('listening', () => {
      resolve(makeHandle())
    })
  })
}
