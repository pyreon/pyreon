import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type RawData, type ServerOptions, type WebSocket as WsSocket, WebSocketServer } from 'ws'
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
  authorize?: (ctx: AuthorizeContext) => AuthorizeResult | Promise<AuthorizeResult>
  /**
   * Liveness heartbeat, in ms. Every interval the relay pings each socket and
   * TERMINATES one that did not answer the previous ping — a half-open
   * connection (a suspended laptop, a dropped NAT mapping, a killed tab whose FIN
   * never arrived) otherwise stays in its room forever: its presence never
   * purges and the room is never GC'd. Default `30_000`; `0` disables.
   */
  heartbeatIntervalMs?: number
  /**
   * Largest inbound frame accepted, in bytes (the `ws` `maxPayload` option). A
   * larger frame closes the socket with 1009. Default: `ws`'s own default
   * (100 MiB) — lower it to bound the memory one client can make the relay
   * allocate.
   */
  maxPayload?: number
  /**
   * Maximum number of live rooms. A connection that would OPEN a new room past
   * the cap is closed with 1013 ("try again later"); joining an existing room is
   * never capped. Default: unlimited. Bounds what a client can make the relay
   * allocate by inventing room names.
   */
  maxRooms?: number
}

/**
 * What {@link SyncServerOptions.authorize} may return. `true` / `'write'` = full
 * access; `'read'` = a READ-ONLY client — it receives the document and live
 * updates and may publish presence, but every document update it sends is
 * dropped; `false` = reject (close 4401).
 */
export type AuthorizeResult = boolean | 'read' | 'write'

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
  // Reverse index: which socket OWNS each awareness clientId. First-come; held
  // until that socket closes. A frame touching an id owned by ANOTHER socket is
  // rejected, so a client cannot impersonate a peer's presence — nor, by being
  // recorded as its owner, get that peer's presence purged when IT disconnects.
  owners: Map<number, WsSocket>
}

/** Frames a socket may send before `authorize` resolves; past this it is closed. */
const MAX_PENDING_FRAMES = 256

/**
 * Read the clientIds an encoded `y-protocols` awareness update touches, WITHOUT
 * applying it (the ownership check has to run first). Format: `varUint count`,
 * then per entry `varUint clientID, varUint clock, varString state`. Throws on a
 * truncated / malformed payload.
 */
function awarenessClientIds(payload: Uint8Array): number[] {
  let pos = 0
  const varUint = (): number => {
    let num = 0
    let mult = 1
    for (;;) {
      const byte = payload[pos++]
      if (byte === undefined || mult > 2 ** 49) throw new Error('malformed awareness varUint')
      num += (byte & 0x7f) * mult
      if (byte < 0x80) return num
      mult *= 0x80
    }
  }
  const count = varUint()
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    ids.push(varUint())
    varUint() // clock
    pos += varUint() // state string bytes
    if (pos > payload.length) throw new Error('truncated awareness update')
  }
  return ids
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
 * Send `socket` the room's current presence roster. Excludes the relay's OWN
 * clientId (a fresh Awareness carries an empty `{}` entry for its local client —
 * the joiner would render a phantom presence for the relay itself) and the
 * socket's own ids (it already has them).
 */
function sendRoster(r: Room, socket: WsSocket): void {
  const own = r.socketClients.get(socket)
  const present = [...r.awareness.getStates().keys()].filter(
    (id) => id !== r.awareness.clientID && !own?.has(id),
  )
  if (present.length > 0) {
    safeSend(socket, encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(r.awareness, present)))
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
  // No `authorize` hook means every connection is accepted, so ANY client that
  // can reach the port can join ANY room and read + mutate its document — an
  // open relay. The default is documented as local/dev-only, but a default that
  // is only ever stated in a doc comment is the one that ships: nothing at
  // runtime distinguished `localhost` from a public deploy.
  //
  // Fires in PRODUCTION too (this is a LIVE misconfiguration the operator must
  // see, not a developer-time nicety — the same call the ISR `cacheKey`
  // auth-refusal warning makes), and once per server instance rather than once
  // per connection, so a busy relay does not spam its logs.
  if (!options.authorize) {
    // Deliberately NOT wrapped in a `process.env.NODE_ENV !== 'production'`
    // gate: the whole point is that the operator of a PRODUCTION relay hears
    // it. `dev-guard-warnings` is right for a warning that teaches an API and
    // wrong for one that reports an unsafe running system — the same call the
    // ISR `cacheKey` auth-refusal warning makes.
    // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
    console.warn(
      '[Pyreon sync] createSyncServer() was called without an `authorize` hook, '
      + 'so EVERY connection is accepted: any client that can reach this port can '
      + 'join any room and read and modify its document. That default is for local '
      + 'development only. To fix: pass `authorize: ({ room, token, req }) => ...` '
      + 'returning false (or throwing) for a caller that may not access `room`.',
    )
  }

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
        owners: new Map(),
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
          for (const id of added) {
            owned.add(id)
            room.owners.set(id, origin as WsSocket)
          }
          for (const id of updated) {
            owned.add(id)
            room.owners.set(id, origin as WsSocket)
          }
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

  const wssOptions: ServerOptions = options.server
    ? { server: options.server }
    : /* v8 ignore next — `?? 0` ephemeral-port fallback; tests pass an explicit port. */
      { port: options.port ?? 0 }
  if (options.host && !options.server) wssOptions.host = options.host
  // Only forwarded when set, so the default stays `ws`'s own.
  if (options.maxPayload !== undefined) wssOptions.maxPayload = options.maxPayload
  const wss = new WebSocketServer(wssOptions)
  const maxRooms = options.maxRooms ?? Number.POSITIVE_INFINITY

  // Heartbeat: `alive` is cleared before each ping and set again by the pong; a
  // socket still un-alive at the NEXT tick never answered and is terminated,
  // which fires its `close` handler (room leave + presence purge). WeakMap-keyed
  // by socket, so a closed socket's entry needs no eviction.
  const alive = new WeakMap<WsSocket, boolean>()
  const heartbeatMs = options.heartbeatIntervalMs ?? 30_000
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const s of wss.clients) {
            if (alive.get(s) === false) {
              s.terminate()
              continue
            }
            alive.set(s, false)
            try {
              s.ping()
            } catch {
              // socket raced to CLOSING between iteration and ping — its own
              // close handler cleans up.
            }
          }
        }, heartbeatMs)
      : undefined
  // Never keep the process alive just to ping.
  heartbeat?.unref?.()

  wss.on('connection', (socket: WsSocket, req: IncomingMessage) => {
    alive.set(socket, true)
    socket.on('pong', () => alive.set(socket, true))
    // A protocol violation on ONE socket (oversized frame past `maxPayload`, bad
    // framing, a reset) is emitted as an `error` event. With no listener Node
    // rethrows it and the whole relay dies; `ws` closes the socket right after,
    // and the `close` handler below does the cleanup.
    socket.on('error', () => {})

    /* v8 ignore next — `req.url ?? '/'`: the `ws` upgrade always sets req.url, so the
       '/' fallback is defensive. */
    const url = new URL(req.url ?? '/', 'http://localhost')
    const room = url.pathname.replace(/^\/+/, '') || 'default'
    const token = url.searchParams.get('token')

    // The client sends its state vector (and presence) the instant the socket
    // OPENS — which, with an async `authorize`, is BEFORE the relay has decided
    // anything. Listening only after `await authorize(...)` dropped those frames:
    // the relay never answered the state vector, so the client's `synced` stayed
    // false forever. So the listeners go on NOW and frames are BUFFERED until the
    // verdict: replayed in order on allow, discarded on reject. The buffer is
    // bounded — an unauthorized socket must not be able to make the relay hold
    // unbounded memory while its credentials are being checked.
    let pending: RawData[] | null = []
    let joined: Room | null = null
    let readOnly = false
    let warnedReadOnly = false

    const handleFrame = (r: Room, data: RawData): void => {
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
          const ids = awarenessClientIds(payload)
          // A socket may only speak for clientIds it owns (or new ones). Without
          // this a client could overwrite a peer's cursor/name — and, recorded
          // as that id's owner, get the peer's presence purged on ITS disconnect.
          const firstPresence = r.socketClients.get(socket)!.size === 0
          for (const id of ids) {
            const owner = r.owners.get(id)
            if (id === r.awareness.clientID || (owner !== undefined && owner !== socket)) {
              if (IS_DEV) {
                console.warn(
                  `[Pyreon] sync relay: dropped an awareness update for clientId ${id}, which belongs to another connection.`,
                )
              }
              return
            }
          }
          applyAwarenessUpdate(r.awareness, payload, socket)
          // A socket's FIRST presence means it just joined the presence channel —
          // possibly long after connecting (presence created lazily), in which
          // case it discarded the roster sent at connect. Send the roster now.
          if (firstPresence) sendRoster(r, socket)
        } catch (err) {
          if (IS_DEV) {
            console.warn('[Pyreon] sync relay: dropped a malformed awareness frame:', err)
          }
        }
        return
      }

      // A read-only client receives, but its document updates never reach the
      // room (so never a peer, nor a late joiner).
      if (readOnly) {
        if (IS_DEV && !warnedReadOnly) {
          warnedReadOnly = true
          console.warn(
            `[Pyreon] sync relay: dropped document updates from a read-only client in room "${room}" (authorize returned 'read').`,
          )
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
    }

    socket.on('message', (data: RawData) => {
      if (pending) {
        if (pending.length >= MAX_PENDING_FRAMES) {
          pending = null
          socket.close(1008, 'too many frames before authorization')
          return
        }
        pending.push(data)
        return
      }
      if (joined) handleFrame(joined, data)
    })

    socket.on('close', () => {
      pending = null
      const r = joined
      if (!r) return
      joined = null
      r.clients.delete(socket)
      // Purge this socket's awareness states + broadcast the removal to the
      // remaining clients (the `update` handler fans the removal out). This is
      // the GUARANTEE that a vanished client's cursor/avatar disappears even on
      // an unclean disconnect (crash / network drop) where the client couldn't
      // announce its own departure.
      const owned = r.socketClients.get(socket)
      if (owned && owned.size > 0) {
        // Every id in `owned` is owned by THIS socket: the ownership check
        // rejects any frame naming an id another socket holds.
        for (const id of owned) r.owners.delete(id)
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

    void (async () => {
      let access: AuthorizeResult = true
      if (options.authorize) {
        try {
          access = await options.authorize({ room, token, req })
        } catch {
          access = false
        }
      }
      // The socket closed (or was closed for flooding) while `authorize` ran —
      // joining now would register a dead socket whose `close` already fired,
      // leaking the room forever.
      if (socket.readyState !== 1 /* OPEN */) {
        pending = null
        return
      }
      if (access !== true && access !== 'write' && access !== 'read') {
        pending = null
        socket.close(4401, 'unauthorized')
        return
      }
      if (!rooms.has(room) && rooms.size >= maxRooms) {
        pending = null
        socket.close(1013, 'room limit reached')
        return
      }
      readOnly = access === 'read'

      const r = getRoom(room)
      r.clients.add(socket)
      r.socketClients.set(socket, new Set())
      joined = r

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
      // INSTANTLY.
      sendRoster(r, socket)

      // Replay what arrived during `authorize`, in order.
      const buffered = pending
      pending = null
      /* v8 ignore next — `pending` is only nulled on the paths that return above. */
      for (const data of buffered ?? []) handleFrame(r, data)
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
        if (heartbeat) clearInterval(heartbeat)
        // Every socket, including ones still inside `authorize` (not yet in any
        // room) — an unclosed connection would hold the listener open.
        for (const c of wss.clients) c.close()
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
