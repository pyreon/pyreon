// @vitest-environment node
// Production-mode dev-gate false sides. The malformed-frame warnings across the
// relay + transports are gated on `process.env.NODE_ENV !== 'production'`. The
// existing suites run in dev (gate true → console.warn). This file stubs
// production BEFORE the modules load, then dynamically imports them, so the
// SAME malformed-frame drop runs with the gate FALSE (the `if (IS_DEV)` /
// `process.env.NODE_ENV !== 'production'` false branch — silent drop, no warn).
//
// `vi.stubEnv('NODE_ENV', 'production')` at the top + dynamic `await import(...)`
// after the stub is load-bearing: server.ts reads `const IS_DEV = ...` at module
// load, and the transports read `process.env.NODE_ENV` inside their catch — both
// must see 'production' at evaluation time. vitest isolates each test file's
// module graph, so this file's production stub doesn't leak into the others.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'production')

const WSImpl = (await import('ws')).WebSocket as unknown as new (url: string) => WebSocket

const waitFor = (cond: () => boolean, timeoutMs = process.env.CI ? 15_000 : 8000): Promise<void> =>
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('production mode — malformed-frame drops are silent (dev-gate false sides)', () => {
  // A spy so a regression that DOES warn in production fails loudly.
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeAll(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => {
    warnSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('the RELAY drops malformed update / state-vector / awareness frames without warning', async () => {
    expect(process.env.NODE_ENV).toBe('production')
    const { createSyncServer } = await import('../server')
    const { createYjsDoc } = await import('../crdt/yjs-adapter')
    const { syncedSignal } = await import('../synced-signal')
    const { MSG_AWARENESS } = await import('../crdt/ws-protocol')

    const server = await createSyncServer({ port: 0 })
    try {
      const url = `ws://127.0.0.1:${server.port}/prod-garbage`
      const a = createYjsDoc()
      const ta = connect(WSImpl, url)
      try {
        await new Promise<void>((res, rej) => {
          ta.onopen = () => res()
          ta.onerror = () => rej(new Error('failed to open'))
        })

        // All three malformed message types → Yjs throws → relay drops silently
        // (the `if (IS_DEV)` false side for each catch).
        ta.send(new Uint8Array([1, 255, 13, 37])) // MSG_UPDATE + garbage
        ta.send(new Uint8Array([0, 254, 200, 1])) // MSG_STATE_VECTOR + garbage
        ta.send(new Uint8Array([MSG_AWARENESS, 255, 254, 9])) // MSG_AWARENESS + garbage
        await sleep(150)

        // Relay survived: a real client still syncs.
        const b = createYjsDoc()
        const { connectViaWebSocket } = await import('../crdt/yjs-ws-transport')
        const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
        const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
        const sb = syncedSignal({ doc: b, key: 'k', initial: '' })
        await waitFor(() => tb.connected)
        // Use the real transport for `a` too so its writes reach the relay.
        const taReal = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
        await waitFor(() => taReal.connected)
        sa.set('prod-ok')
        await waitFor(() => sb() === 'prod-ok')
        expect(sb()).toBe('prod-ok')
        tb.disconnect()
        taReal.disconnect()
      } finally {
        ta.close()
      }
      // No warning was emitted in production.
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  }, 30_000)

  it('connectViaBroadcastChannel drops a malformed channel message without warning', async () => {
    const { createYjsDoc } = await import('../crdt/yjs-adapter')
    const { connectViaBroadcastChannel } = await import('../crdt/yjs-transport')
    const { syncedSignal } = await import('../synced-signal')

    const channel = `prod-bc-${crypto.randomUUID()}`
    const a = createYjsDoc()
    const la = connectViaBroadcastChannel(a, channel)
    const rogue = new BroadcastChannel(channel)
    try {
      // Garbage `update` → Yjs throws → silent drop in production.
      rogue.postMessage({ kind: 'update', update: new Uint8Array([255, 254, 253]) })
      rogue.postMessage({ kind: 'sv', sv: new Uint8Array([255, 254, 253]) })
      await sleep(80)
      const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
      sa.set('bc-prod-ok')
      expect(sa()).toBe('bc-prod-ok')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      la.disconnect()
      rogue.close()
      a.destroy()
    }
  })

  it('the WS CLIENT drops a malformed relay frame without warning', async () => {
    const { WebSocketServer } = await import('ws')
    const { createYjsDoc } = await import('../crdt/yjs-adapter')
    const { connectViaWebSocket } = await import('../crdt/yjs-ws-transport')
    const { syncedSignal } = await import('../synced-signal')

    const wss = new WebSocketServer({ port: 0 })
    await new Promise<void>((res) => wss.once('listening', () => res()))
    const port = (wss.address() as { port: number }).port
    wss.on('connection', (sock) => {
      sock.send(new Uint8Array([0, 254, 200, 1])) // garbage state vector → client throws
      sock.send(new Uint8Array([1, 255, 13, 37])) // garbage update → client throws
    })
    const a = createYjsDoc()
    const t = connectViaWebSocket(a, `ws://127.0.0.1:${port}/x`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    try {
      await waitFor(() => t.connected)
      await sleep(200) // let the garbage frames be processed (+ dropped silently)
      const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
      sa.set('client-prod-ok')
      expect(sa()).toBe('client-prod-ok')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      t.disconnect()
      for (const c of wss.clients) c.terminate()
      await new Promise<void>((res) => wss.close(() => res()))
      a.destroy()
    }
  })
})

// A raw `ws` client whose `.onopen=/.onclose=` surface matches what the relay
// + transport tests use.
function connect(Impl: new (url: string) => WebSocket, url: string): WebSocket {
  const ws = new Impl(url)
  ws.binaryType = 'arraybuffer'
  return ws
}
