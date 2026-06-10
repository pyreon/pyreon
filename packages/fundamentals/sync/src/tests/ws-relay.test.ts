// @vitest-environment node
// Real `ws` relay server + the `ws` package CLIENT (passed as `WebSocketImpl`).
// We deliberately use the `ws` client here, NOT Node's global (undici)
// WebSocket: v8 coverage instrumentation + undici's WebSocket deadlock the
// connection (the `Coverage (Full)` CI job runs under v8 coverage). The `ws`
// client implements the same DOM-ish `.onopen=`/`.onmessage=`/`.send` surface
// the transport uses, with no undici involvement — deterministic under coverage.
// The transport's DEFAULT (global WebSocket) path is exercised by the real
// browser WebSocket in the `sync-ws-relay` Playwright e2e. A true Node env —
// happy-dom's WebSocket/net polyfills interfere with the `ws` server.
import { createServer as createHttpServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { type SyncServer, createSyncServer } from '../server'
import { syncedSignal } from '../synced-signal'

// `ws`'s client implements the browser WebSocket interface; cast to the DOM ctor
// type for the transport's `WebSocketImpl` option and for the raw garbage senders.
const WSImpl = WsClient as unknown as new (url: string) => WebSocket

// TICK-COUNTED deadline, deliberately NOT wall-clock. CI runs this file under
// parallel-load contention (+ v8 instrumentation in `Coverage (Full)`), and the
// observed flake shape was a ~30s event-loop starvation window: the loopback
// round-trip completes fine, but a `Date.now()`-based deadline burns its budget
// while the loop gets no CPU — the first spec failed 3/3 retries inside one
// window while its sibling's retry passed in 243ms right after (runs
// 27292708996 / 27272xxx on PRs #1498/#1505/#1509). Counting SCHEDULED ticks
// (each ≈10ms of timer time) makes the deadline self-extend under starvation —
// ticks don't run when the loop is starved — while behaving identically to the
// old wall-clock deadline on a healthy machine. vitest's own per-test timeout
// stays the hard wall-clock backstop.
const waitFor = (cond: () => boolean, timeoutMs = 8000): Promise<void> =>
  new Promise((resolve, reject) => {
    const maxTicks = Math.ceil(timeoutMs / 10)
    let ticks = 0
    const tick = () => {
      if (cond()) resolve()
      else if (++ticks > maxTicks) reject(new Error('waitFor: timed out'))
      else setTimeout(tick, 10)
    }
    tick()
  })

describe('WebSocket relay — cross-device sync', () => {
  let server: SyncServer | undefined
  const disposers: Array<() => void> = []

  afterEach(async () => {
    for (const d of disposers.splice(0)) d()
    await server?.close()
    server = undefined
  })

  it('two clients converge over the relay', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/room1`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
    )

    const sa = syncedSignal({ doc: a, key: 'title', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'title', initial: '' })

    await waitFor(() => ta.connected && tb.connected)
    sa.set('hello over WS') // a writes after both are connected — propagates to b
    await waitFor(() => sb() === 'hello over WS')
    expect(sb()).toBe('hello over WS')
    // 30s wall-clock budget: two sequential tick-counted waits need wall-clock
    // headroom when CI starves the loop (the evidenced flake on this exact spec).
  }, 30_000)

  it('REJECTS an unauthorized connection (authorize → false)', async () => {
    server = await createSyncServer({ port: 0, authorize: ({ token }) => token === 'secret' })
    const url = `ws://127.0.0.1:${server.port}/room1?token=wrong`
    const a = createYjsDoc()
    let disconnected = false
    const ta = connectViaWebSocket(a, url, {
      reconnect: false,
      WebSocketImpl: WSImpl,
      onDisconnect: () => {
        disconnected = true
      },
    })
    disposers.push(() => ta.disconnect())

    await waitFor(() => disconnected)
    expect(disconnected).toBe(true)
    expect(ta.connected).toBe(false)
  })

  it('REJECTS (does not crash) when the authorize hook THROWS', async () => {
    // A buggy authorize must fail CLOSED — reject the connection, never take
    // down the relay. The server catches the throw and closes with 4401.
    server = await createSyncServer({
      port: 0,
      authorize: () => {
        throw new Error('boom in authorize')
      },
    })
    const url = `ws://127.0.0.1:${server.port}/room1?token=anything`
    const a = createYjsDoc()
    let disconnected = false
    const ta = connectViaWebSocket(a, url, {
      reconnect: false,
      WebSocketImpl: WSImpl,
      onDisconnect: () => {
        disconnected = true
      },
    })
    disposers.push(() => ta.disconnect())

    await waitFor(() => disconnected)
    expect(ta.connected).toBe(false)

    // The relay is still alive: a fresh client can connect to a DIFFERENT
    // (always-allow) room... actually authorize rejects all here, so just prove
    // the server process didn't die by opening + closing another socket cleanly.
    const probe = new WSImpl(`ws://127.0.0.1:${server.port}/room2`)
    const closed = await new Promise<boolean>((res) => {
      probe.onclose = () => res(true)
      probe.onerror = () => res(true)
      setTimeout(() => res(false), 2000)
    })
    expect(closed).toBe(true) // relay responded (rejected) — it's alive, not crashed
  })

  it('ALLOWS an authorized connection and syncs', async () => {
    server = await createSyncServer({ port: 0, authorize: ({ token }) => token === 'secret' })
    const url = `ws://127.0.0.1:${server.port}/room1?token=secret`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
    )

    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })

    await waitFor(() => ta.connected && tb.connected)
    sa.set('authed')
    await waitFor(() => sb() === 'authed')
    expect(sb()).toBe('authed')
  })

  it('a LATE-joiner catches up from the relay room state', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/late`
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })

    await waitFor(() => ta.connected)
    sa.set('early') // recorded into the relay's room doc
    await new Promise((r) => setTimeout(r, 100)) // let the relay apply it

    // B joins AFTER the edit, with NO local seed for key 'k' — so the relay's
    // room state is the only source and the catch-up is deterministic.
    const b = createYjsDoc()
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => tb.disconnect())

    await waitFor(() => b.getMap('pyreon').get('k') === 'early')
    expect(b.getMap('pyreon').get('k')).toBe('early')
  })

  it('ATTACHES to an existing http server (shared port) and still syncs', async () => {
    // `server` mode: the relay shares a Node http server with a plain-HTTP app
    // (here a health endpoint). The caller owns `listen`; the relay only adds
    // WebSocket upgrade handling. This is how a relay mounts on a framework's
    // own Node/Bun server — and how the e2e relay answers Playwright's HTTP
    // readiness probe while still brokering WS.
    const http = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('sync-relay ok')
    })
    await new Promise<void>((res) => http.listen(0, '127.0.0.1', () => res()))
    const port = (http.address() as { port: number }).port
    const relay = await createSyncServer({ server: http })
    disposers.push(() => http.close())
    server = relay // afterEach also calls relay.close() (drops the WS layer)

    // The HTTP side answers (proves the shared server serves plain HTTP too).
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    expect(await health.text()).toBe('sync-relay ok')
    expect(relay.port).toBe(port) // relay reports the host server's port

    // The WS side brokers sync between two clients on that same port.
    const url = `ws://127.0.0.1:${port}/shared`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
    )
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })

    await waitFor(() => ta.connected && tb.connected)
    sa.set('over shared server')
    await waitFor(() => sb() === 'over shared server')
    expect(sb()).toBe('over shared server')
    // Same 30s wall-clock budget as the first spec — this one flaked (retry ×1,
    // then passed in 243ms) inside the same CI starvation window.
  }, 30_000)

  it('RECONNECTS with backoff after the relay drops, then comes back', async () => {
    // Fixed http server so the relay can be torn down + brought back on the SAME
    // port — the only way to exercise the client's reconnect loop end-to-end.
    const http1 = createHttpServer()
    await new Promise<void>((res) => http1.listen(0, '127.0.0.1', () => res()))
    const port = (http1.address() as { port: number }).port
    const relay1 = await createSyncServer({ server: http1 })

    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${port}/r`, {
      reconnect: true,
      maxBackoffMs: 300, // keep retries snappy for the test
      WebSocketImpl: WSImpl,
    })
    disposers.push(() => ta.disconnect())
    await waitFor(() => ta.connected)

    // Drop the relay → client notices + schedules a backoff reconnect.
    await relay1.close()
    await new Promise<void>((res) => http1.close(() => res()))
    await waitFor(() => !ta.connected)

    // Bring a NEW relay up on the same port → the backoff timer reconnects.
    const http2 = createHttpServer()
    await new Promise<void>((res) => http2.listen(port, '127.0.0.1', () => res()))
    server = await createSyncServer({ server: http2 })
    disposers.push(() => http2.close())

    await waitFor(() => ta.connected) // reconnected
    expect(ta.connected).toBe(true)
  })

  it('disconnect cancels a pending reconnect timer (Bug C — no orphaned timer)', async () => {
    const http = createHttpServer()
    await new Promise<void>((res) => http.listen(0, '127.0.0.1', () => res()))
    const port = (http.address() as { port: number }).port
    const relay = await createSyncServer({ server: http })
    disposers.push(() => http.close())

    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${port}/r`, {
      reconnect: true,
      WebSocketImpl: WSImpl,
    })
    await waitFor(() => ta.connected)

    // Drop the relay → onclose schedules a reconnect timer.
    await relay.close()
    await new Promise<void>((res) => http.close(() => res()))
    await waitFor(() => !ta.connected)

    // Disconnect WHILE the reconnect timer is pending → it must be cleared, and
    // no reconnect must fire afterwards.
    ta.disconnect()
    await new Promise((r) => setTimeout(r, 400)) // longer than the first backoff
    expect(ta.connected).toBe(false)
  })

  it('SURVIVES a malformed frame from a client — no crash, peers keep syncing', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/garbage`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
    )
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })
    await waitFor(() => ta.connected && tb.connected)

    // A buggy / hostile client sends raw garbage on BOTH message types. Each of
    // these makes Yjs throw (applyUpdate on garbage / empty; encodeStateAsUpdate
    // on a garbage state vector) — the relay must drop them, not crash.
    const evil = new WSImpl(url)
    evil.binaryType = 'arraybuffer'
    await new Promise<void>((res, rej) => {
      evil.onopen = () => res()
      evil.onerror = () => rej(new Error('evil socket failed to open'))
    })
    evil.send(new Uint8Array([1, 255, 13, 37, 42, 9])) // MSG_UPDATE + garbage payload
    evil.send(new Uint8Array([0, 254, 200, 1])) // MSG_STATE_VECTOR + garbage state vector
    evil.send(new Uint8Array([1])) // MSG_UPDATE + EMPTY payload (applyUpdate(empty) throws)
    evil.send(new Uint8Array([0])) // MSG_STATE_VECTOR + EMPTY sv (encodeStateAsUpdate throws)
    await new Promise((r) => setTimeout(r, 150)) // let the relay (not) choke on them

    // The relay is still alive: a real write from A still converges to B.
    sa.set('survived')
    await waitFor(() => sb() === 'survived', 6000)
    expect(sb()).toBe('survived')
    evil.close()
  })

  it('does not choke when a client disconnects DURING async authorize', async () => {
    let authorizeStarted = false
    server = await createSyncServer({
      port: 0,
      authorize: async () => {
        authorizeStarted = true
        await new Promise((r) => setTimeout(r, 80))
        return true
      },
    })
    const url = `ws://127.0.0.1:${server.port}/race`
    const racer = new WSImpl(url)
    await new Promise<void>((res) => {
      racer.onopen = () => res()
    })
    await waitFor(() => authorizeStarted)
    racer.close() // disconnect WHILE authorize is still awaiting → post-authorize send hits a closing socket
    await new Promise((r) => setTimeout(r, 200)) // let authorize resolve + the send attempt happen

    // The relay survived (no crash from a send on the closed socket): a fresh
    // client can still connect + sync.
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    await waitFor(() => ta.connected)
    expect(ta.connected).toBe(true)
  })

  it('CLIENT survives a malformed frame from the relay — no unhandled rejection', async () => {
    // Stand up a raw ws server that speaks garbage, and point the transport at it.
    const { WebSocketServer } = await import('ws')
    const wss = new WebSocketServer({ port: 0 })
    await new Promise<void>((res) => wss.once('listening', () => res()))
    const port = (wss.address() as { port: number }).port
    wss.on('connection', (sock) => {
      // On connect, blast the client with garbage on both message types.
      sock.send(new Uint8Array([0, 254, 200, 1])) // MSG_STATE_VECTOR + garbage sv → client encodeStateAsUpdate throws
      sock.send(new Uint8Array([1, 255, 13, 37])) // MSG_UPDATE + garbage → client applyUpdate throws
    })
    const rejections: unknown[] = []
    const onRej = (e: unknown) => rejections.push(e)
    process.on('unhandledRejection', onRej)
    let ta: ReturnType<typeof connectViaWebSocket> | undefined
    try {
      const a = createYjsDoc()
      ta = connectViaWebSocket(a, `ws://127.0.0.1:${port}/x`, {
        reconnect: false,
        WebSocketImpl: WSImpl,
      })
      await waitFor(() => ta!.connected)
      await new Promise((r) => setTimeout(r, 200)) // let the garbage frames be processed
      // Still alive + usable: a local write goes through without error.
      const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
      sa.set('client-ok')
      expect(sa()).toBe('client-ok')
      expect(rejections).toEqual([]) // the malformed frames did NOT leak an unhandled rejection
    } finally {
      process.off('unhandledRejection', onRej)
      ta?.disconnect() // close the client first, else wss.close() waits on the live socket
      for (const c of wss.clients) c.terminate()
      await new Promise<void>((res) => wss.close(() => res()))
    }
  })
})
