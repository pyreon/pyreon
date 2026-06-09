// @vitest-environment node
// Real `ws` relay server + the Node global WebSocket client (Node 22+ ships a
// spec-compliant WebSocket that supports the DOM `.onopen=`/`.onmessage=` API the
// transport uses). A true Node env — happy-dom's WebSocket/net polyfills
// interfere with the `ws` server.
import { createServer as createHttpServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { type SyncServer, createSyncServer } from '../server'
import { syncedSignal } from '../synced-signal'

const waitFor = (cond: () => boolean, timeoutMs = 3000): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cond()) resolve()
      else if (Date.now() - start > timeoutMs) reject(new Error('waitFor: timed out'))
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
    const ta = connectViaWebSocket(a, url, { reconnect: false })
    const tb = connectViaWebSocket(b, url, { reconnect: false })
    disposers.push(() => ta.disconnect(), () => tb.disconnect())

    const sa = syncedSignal({ doc: a, key: 'title', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'title', initial: '' })

    await waitFor(() => ta.connected && tb.connected)
    sa.set('hello over WS') // a writes after both are connected — propagates to b
    await waitFor(() => sb() === 'hello over WS')
    expect(sb()).toBe('hello over WS')
  })

  it('REJECTS an unauthorized connection (authorize → false)', async () => {
    server = await createSyncServer({ port: 0, authorize: ({ token }) => token === 'secret' })
    const url = `ws://127.0.0.1:${server.port}/room1?token=wrong`
    const a = createYjsDoc()
    let disconnected = false
    const ta = connectViaWebSocket(a, url, {
      reconnect: false,
      onDisconnect: () => {
        disconnected = true
      },
    })
    disposers.push(() => ta.disconnect())

    await waitFor(() => disconnected)
    expect(disconnected).toBe(true)
    expect(ta.connected).toBe(false)
  })

  it('ALLOWS an authorized connection and syncs', async () => {
    server = await createSyncServer({ port: 0, authorize: ({ token }) => token === 'secret' })
    const url = `ws://127.0.0.1:${server.port}/room1?token=secret`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false })
    const tb = connectViaWebSocket(b, url, { reconnect: false })
    disposers.push(() => ta.disconnect(), () => tb.disconnect())

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
    const ta = connectViaWebSocket(a, url, { reconnect: false })
    disposers.push(() => ta.disconnect())
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })

    await waitFor(() => ta.connected)
    sa.set('early') // recorded into the relay's room doc
    await new Promise((r) => setTimeout(r, 100)) // let the relay apply it

    // B joins AFTER the edit, with NO local seed for key 'k' — so the relay's
    // room state is the only source and the catch-up is deterministic.
    const b = createYjsDoc()
    const tb = connectViaWebSocket(b, url, { reconnect: false })
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
    const ta = connectViaWebSocket(a, url, { reconnect: false })
    const tb = connectViaWebSocket(b, url, { reconnect: false })
    disposers.push(() => ta.disconnect(), () => tb.disconnect())
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })

    await waitFor(() => ta.connected && tb.connected)
    sa.set('over shared server')
    await waitFor(() => sb() === 'over shared server')
    expect(sb()).toBe('over shared server')
  })
})
