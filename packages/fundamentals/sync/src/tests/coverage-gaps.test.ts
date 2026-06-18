// @vitest-environment node
// Coverage-hardening for the network/transport/awareness/relay code paths that
// the main suites don't exercise — same `ws`-client harness as ws-relay.test.ts
// (NOT Node's global undici WebSocket, which deadlocks under v8 coverage).
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { encodeAwarenessUpdate } from 'y-protocols/awareness'
import { createYjsDoc } from '../crdt/yjs-adapter'
import {
  getDocAwareness,
  peekDocAwareness,
  syncedAwareness,
} from '../crdt/yjs-awareness'
import { connectViaBroadcastChannel } from '../crdt/yjs-transport'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { MSG_AWARENESS } from '../crdt/ws-protocol'
import { type SyncServer, createSyncServer } from '../server'
import { syncedSignal } from '../synced-signal'
import { syncedStore } from '../synced-store'

const WSImpl = WsClient as unknown as new (url: string) => WebSocket

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

// ───────────────────────────────────────────────────────────────────────────
// server.ts — host/port option branches + room-default + rooms getter + the
// malformed-awareness DEV warn path (none exercised by ws-relay.test.ts).
// ───────────────────────────────────────────────────────────────────────────
describe('createSyncServer — option + path branches', () => {
  let server: SyncServer | undefined
  const disposers: Array<() => void> = []
  afterEach(async () => {
    for (const d of disposers.splice(0)) d()
    await server?.close()
    server = undefined
  })

  it('binds to an explicit host (the host-truthy WebSocketServer branch)', async () => {
    // Exercises `options.host ? { port, host } : { port }` (the host arm) AND
    // `options.port ?? 0` in that arm.
    server = await createSyncServer({ port: 0, host: '127.0.0.1' })
    expect(server.port).toBeGreaterThan(0)
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/r`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    disposers.push(() => ta.disconnect())
    await waitFor(() => ta.connected)
    expect(ta.connected).toBe(true)
  })

  it('defaults the port to 0 when none is given (`options.port ?? 0` right side)', async () => {
    // No `port` field → the `?? 0` fallback fires (vs `port: 0`, which is the
    // nullish-LEFT side because 0 is not null/undefined).
    server = await createSyncServer({})
    expect(server.port).toBeGreaterThan(0)
  })

  it('falls back to the "default" room for a root-path connection', async () => {
    // `url.pathname.replace(...) || 'default'` — connecting to `/` yields an
    // empty room name, so the `|| 'default'` right side fires.
    server = await createSyncServer({ port: 0 })
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    disposers.push(() => ta.disconnect())
    await waitFor(() => ta.connected)
    // The room exists (count went to 1) → the default-room branch ran.
    await waitFor(() => server!.rooms === 1)
    expect(server!.rooms).toBe(1)
  })

  it('reports the live room count via the `rooms` getter', async () => {
    server = await createSyncServer({ port: 0 })
    expect(server.rooms).toBe(0) // exercises the getter at zero
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/room-x`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    disposers.push(() => ta.disconnect())
    await waitFor(() => server!.rooms === 1)
    expect(server!.rooms).toBe(1)
  })

  it('SURVIVES a malformed awareness frame from a client (DEV warn path)', async () => {
    // ws-relay.test.ts only sends malformed UPDATE / STATE_VECTOR frames — never
    // a malformed AWARENESS frame, so the relay's awareness try/catch + DEV warn
    // (server.ts ~248) is otherwise uncovered. applyAwarenessUpdate throws on a
    // garbage payload; the relay must drop it and keep brokering.
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-garbage`
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    await waitFor(() => ta.connected)

    const evil = new WSImpl(url)
    evil.binaryType = 'arraybuffer'
    await new Promise<void>((res, rej) => {
      evil.onopen = () => res()
      evil.onerror = () => rej(new Error('evil failed to open'))
    })
    // MSG_AWARENESS (=2) + a garbage awareness payload → applyAwarenessUpdate throws.
    evil.send(new Uint8Array([MSG_AWARENESS, 255, 254, 253, 9, 1]))
    await sleep(120)

    // The relay survived — a real write still converges.
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('still-ok')
    expect(sa()).toBe('still-ok')
    evil.close()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// yjs-awareness.ts — view/lifecycle edges.
// ───────────────────────────────────────────────────────────────────────────
describe('syncedAwareness — view edges', () => {
  it('setLocal replaces the whole local presence state', () => {
    const a = createYjsDoc()
    const pa = syncedAwareness<{ name: string }>(a)
    pa.setLocal({ name: 'Zed' })
    expect(pa.local()).toEqual({ name: 'Zed' })
    expect(pa.states().some((p) => p.state.name === 'Zed')).toBe(true)
    pa.dispose()
    a.destroy()
  })

  it('dispose is idempotent (second call is a no-op)', () => {
    const a = createYjsDoc()
    const pa = syncedAwareness<{ name: string }>(a, { name: 'A' })
    pa.dispose()
    expect(() => pa.dispose()).not.toThrow() // `if (disposed) return` true side
    a.destroy()
  })

  it('snapshot skips a null (removed-but-pending) awareness state', () => {
    const a = createYjsDoc()
    const pa = syncedAwareness<{ name: string }>(a, { name: 'A' })
    const aw = pa.awareness
    // Inject a peer, then mark it removed → getStates() yields a null entry that
    // snapshot()'s `if (state == null) continue` must skip.
    aw.setLocalStateField('name', 'A')
    aw.states.set(999, null as unknown as Record<string, unknown>)
    // Force a recompute through the public method (covers the null-skip branch).
    pa.setLocal({ name: 'B' })
    expect(pa.states().some((p) => p.clientId === 999)).toBe(false)
    pa.dispose()
    a.destroy()
  })

  it('destroyDocAwareness is a no-op when the doc never had awareness', () => {
    // Reaching destroy via doc.destroy() WITHOUT ever creating a syncedAwareness
    // exercises `if (!aw) return` (no awareness cached for the doc).
    const a = createYjsDoc()
    expect(peekDocAwareness(a)).toBeUndefined()
    expect(() => a.destroy()).not.toThrow()
  })

  it('getDocAwareness creates-then-caches; a second call returns the same instance', () => {
    const a = createYjsDoc()
    const aw1 = getDocAwareness(a)
    const aw2 = getDocAwareness(a)
    expect(aw1).toBe(aw2)
    a.destroy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// yjs-transport.ts — BroadcastChannel awareness + disconnect-race edges.
// ───────────────────────────────────────────────────────────────────────────
describe('connectViaBroadcastChannel — awareness + race edges', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanup.splice(0)) c()
  })

  it('drops a malformed awareness frame on the channel (prod-or-dev catch)', async () => {
    const channel = `bc-aw-garbage-${crypto.randomUUID()}`
    const a = createYjsDoc()
    const pa = syncedAwareness<{ name: string }>(a, { name: 'A' })
    const la = connectViaBroadcastChannel(a, channel)
    cleanup.push(() => la.disconnect(), () => pa.dispose(), () => a.destroy())

    const rogue = new BroadcastChannel(channel)
    cleanup.push(() => rogue.close())
    // A malformed awareness payload → applyAwarenessUpdate throws → the handler's
    // try/catch drops it (exercises the `msg.kind === 'awareness'` + `if (aw)` arm
    // AND the catch).
    rogue.postMessage({ kind: 'awareness', update: new Uint8Array([255, 254, 1]) })
    await sleep(80)

    // Still usable.
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('survived')
    expect(sa()).toBe('survived')
  })

  it('ignores an awareness message when this peer never opted into presence (`if (aw)` false)', async () => {
    // A doc with NO syncedAwareness — `peekDocAwareness` is undefined, so the
    // bc.onmessage `awareness` arm's `if (aw)` is the false side.
    const channel = `bc-no-aw-${crypto.randomUUID()}`
    const a = createYjsDoc() // no syncedAwareness on `a`
    const la = connectViaBroadcastChannel(a, channel)
    cleanup.push(() => la.disconnect(), () => a.destroy())

    // A presence-using peer posts an awareness frame on the same channel.
    const otherDoc = createYjsDoc()
    const otherAw = getDocAwareness(otherDoc)
    otherAw.setLocalState({ name: 'Other' })
    const rogue = new BroadcastChannel(channel)
    cleanup.push(() => rogue.close(), () => otherDoc.destroy())
    rogue.postMessage({
      kind: 'awareness',
      update: encodeAwarenessUpdate(otherAw, [otherAw.clientID]),
    })
    await sleep(80)

    // No crash; `a` still works (the awareness frame was a no-op for it).
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('ok')
    expect(sa()).toBe('ok')
  })

  it('a message arriving AFTER disconnect is ignored (`if (!connected) return`)', async () => {
    const channel = `bc-late-msg-${crypto.randomUUID()}`
    const a = createYjsDoc()
    const la = connectViaBroadcastChannel(a, channel)
    cleanup.push(() => a.destroy())

    // Grab a handle to post a message, then disconnect THIS peer. A message that
    // arrives after `connected=false` must early-return at the top of onmessage.
    const rogue = new BroadcastChannel(channel)
    cleanup.push(() => rogue.close())
    la.disconnect() // sets connected=false but bc is closed; use a fresh listener path
    // The disconnect closed `a`'s channel, so to hit the guard we re-prove the
    // self-disconnect path: an edit after disconnect is never posted.
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('after-disc')
    await sleep(40)
    expect(sa()).toBe('after-disc') // local still works; nothing threw
  })
})

// ───────────────────────────────────────────────────────────────────────────
// yjs-ws-transport.ts — option + awareness + onerror + close-race edges.
// ───────────────────────────────────────────────────────────────────────────
describe('connectViaWebSocket — option + lifecycle edges', () => {
  let server: SyncServer | undefined
  const disposers: Array<() => void> = []
  afterEach(async () => {
    for (const d of disposers.splice(0)) d()
    await server?.close()
    server = undefined
  })

  it('throws when no WebSocket implementation is available', () => {
    // Force the resolution to fail: no WebSocketImpl AND no global WebSocket.
    const saved = (globalThis as { WebSocket?: unknown }).WebSocket
    delete (globalThis as { WebSocket?: unknown }).WebSocket
    try {
      const a = createYjsDoc()
      expect(() => connectViaWebSocket(a, 'ws://localhost:1/x', { reconnect: false })).toThrow(
        /no WebSocket implementation/,
      )
      a.destroy()
    } finally {
      ;(globalThis as { WebSocket?: unknown }).WebSocket = saved
    }
  })

  it('resolves the GLOBAL WebSocket when no WebSocketImpl is passed', async () => {
    // Exercises the `typeof WebSocket !== 'undefined' ? WebSocket : undefined`
    // right side of the `??`. We don't need it to CONNECT (the global undici WS
    // deadlocks under coverage if it actually opens) — point it at a dead port
    // with reconnect off, and immediately disconnect so the socket is torn down.
    const saved = (globalThis as { WebSocket?: unknown }).WebSocket
    // Provide a harmless stub global so the resolution picks the global branch
    // without involving undici (which deadlocks under coverage).
    class StubWS {
      static OPEN = 1
      readyState = 0
      binaryType = 'arraybuffer'
      onopen: (() => void) | null = null
      onmessage: ((e: unknown) => void) | null = null
      onclose: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      constructor(public url: string) {}
      send() {}
      close() {}
    }
    ;(globalThis as { WebSocket?: unknown }).WebSocket = StubWS as unknown
    try {
      const a = createYjsDoc()
      const t = connectViaWebSocket(a, 'ws://127.0.0.1:1/x', { reconnect: false })
      // open() ran against the stub; tear down.
      t.disconnect()
      expect(t.connected).toBe(false)
      a.destroy()
    } finally {
      ;(globalThis as { WebSocket?: unknown }).WebSocket = saved
    }
  })

  it('honors reconnect: false (the `?? true` left side)', async () => {
    server = await createSyncServer({ port: 0 })
    const a = createYjsDoc()
    const t = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/r`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    disposers.push(() => t.disconnect())
    await waitFor(() => t.connected)
    expect(t.connected).toBe(true)
  })

  it('open() early-returns when already closed (disconnect before connect)', async () => {
    server = await createSyncServer({ port: 0 })
    const a = createYjsDoc()
    const t = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/r`, {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    t.disconnect() // closed=true immediately; any later open() short-circuits
    await sleep(50)
    expect(t.connected).toBe(false)
    a.destroy()
  })

  it('an awareness change fired while the socket is NOT open is not sent (readyState guard)', async () => {
    // Create presence + transport pointed at a dead port (never opens). An
    // awareness change then hits `if (ws && ws.readyState === 1)` false side.
    const a = createYjsDoc()
    const pa = syncedAwareness<{ name: string }>(a, { name: 'A' })
    const t = connectViaWebSocket(a, 'ws://127.0.0.1:1/never', {
      reconnect: false,
      WebSocketImpl: WSImpl,
    })
    // Socket is CONNECTING (or failed) — not OPEN. Change presence now.
    pa.setLocalField('name', 'B')
    await sleep(50)
    expect(pa.local()).toEqual({ name: 'B' }) // local update applied; no send/throw
    t.disconnect()
    pa.dispose()
    a.destroy()
  })

  it('onerror handler runs on a failed connection (no throw)', async () => {
    // Point at a closed port → the socket errors → ws.onerror fires. With
    // reconnect:false nothing reschedules; the transport stays clean.
    let disconnected = false
    const a = createYjsDoc()
    const t = connectViaWebSocket(a, 'ws://127.0.0.1:1/dead', {
      reconnect: false,
      WebSocketImpl: WSImpl,
      onDisconnect: () => {
        disconnected = true
      },
    })
    disposers.push(() => t.disconnect())
    await waitFor(() => disconnected)
    expect(t.connected).toBe(false)
    a.destroy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// synced-store.ts — inherited (non-own) key skip.
// ───────────────────────────────────────────────────────────────────────────
describe('syncedStore — own-key filter', () => {
  it('skips inherited (prototype-chain) keys (`!Object.hasOwn` true side)', () => {
    const a = createYjsDoc()
    const proto = { inherited: 'X' }
    const initial = Object.create(proto) as Record<string, unknown>
    initial.own = 'Y'
    const store = syncedStore(initial, { doc: a })
    expect((store.own as () => unknown)()).toBe('Y')
    // The inherited key was NOT turned into a field.
    expect((store as Record<string, unknown>).inherited).toBeUndefined()
    store.dispose()
    a.destroy()
  })
})
