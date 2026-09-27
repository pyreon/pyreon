// @vitest-environment node
// Relay + transport hardening, against a REAL `ws` relay and the `ws` package
// client (see `ws-relay.test.ts` header for why not the global undici
// WebSocket). Every wait is a named, state-describing `waitFor` from the shared
// `ws-wait` helper — one budget + one derived backstop for every relay suite.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { syncedAwareness } from '../crdt/yjs-awareness'
import { connectViaBroadcastChannel } from '../crdt/yjs-transport'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { MSG_AWARENESS, MSG_UPDATE, encodeSyncMessage } from '../crdt/ws-protocol'
import { type SyncServer, createSyncServer } from '../server'
import { syncedSignal } from '../synced-signal'
import { TEST_TIMEOUT_MS, WSImpl, waitFor } from './ws-wait'

interface Presence {
  name: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const names = (peers: ReadonlyArray<{ state: Presence }>): string[] =>
  peers.map((p) => p.state.name).sort()

/** Open a raw `ws` client and resolve once it is open. */
async function openRaw(url: string, opts?: { autoPong?: boolean }): Promise<WsClient> {
  const sock = new WsClient(url, opts)
  sock.binaryType = 'arraybuffer'
  await new Promise<void>((res, rej) => {
    sock.once('open', () => res())
    sock.once('error', (e) => rej(e))
  })
  return sock
}

/**
 * Track a raw socket's close so a spec can `waitFor` it with a state snapshot
 * (a bare `once('close')` promise would hang to the vitest backstop with an
 * opaque timeout if the relay never closes it — exactly the failure mode a
 * regression here produces).
 */
function trackClose(sock: WsClient): { wait: (what: string) => Promise<number> } {
  let code: number | null = null
  sock.once('close', (c) => {
    code = c
  })
  return {
    async wait(what) {
      await waitFor(what, () => code !== null, {
        describe: () => `readyState=${sock.readyState} code=${String(code)}`,
      })
      return code as unknown as number
    },
  }
}

/** Observe a promise's outcome synchronously, so a spec can `waitFor` it. */
function settle(p: Promise<unknown>): { state: 'pending' | 'resolved' | 'rejected'; error?: unknown } {
  const out: { state: 'pending' | 'resolved' | 'rejected'; error?: unknown } = { state: 'pending' }
  p.then(
    () => {
      out.state = 'resolved'
    },
    (err: unknown) => {
      out.state = 'rejected'
      out.error = err
    },
  )
  return out
}

describe('sync relay + transport hardening', { timeout: TEST_TIMEOUT_MS }, () => {
  let server: SyncServer | undefined
  const disposers: Array<() => void> = []

  afterEach(async () => {
    for (const d of disposers.splice(0)) d()
    await server?.close()
    server = undefined
    vi.restoreAllMocks()
  })

  // ── 1. frames sent while an ASYNC authorize is pending ────────────────────
  it('buffers frames sent during an async authorize — a client still syncs', async () => {
    server = await createSyncServer({
      port: 0,
      authorize: async () => {
        await sleep(150)
        return true
      },
    })
    const url = `ws://127.0.0.1:${server.port}/slow-auth`
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    const sa = syncedSignal({ doc: a, key: 'title', initial: '' })
    // The transport sends its state vector the instant the socket opens — while
    // the relay is still inside `authorize`. That frame must not be lost, or the
    // relay never answers it and `synced` stays false forever.
    await waitFor('A to complete its first sync through a 150ms authorize', () => ta.synced(), {
      describe: () => `ta.connected=${ta.connected} ta.synced=${ta.synced()}`,
    })
    sa.set('from A')

    const b = createYjsDoc()
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => tb.disconnect())
    const sb = syncedSignal({ doc: b, key: 'title', initial: '' })
    await waitFor("late joiner B to sync + receive A's value", () => tb.synced() && sb() === 'from A', {
      describe: () => `tb.synced=${tb.synced()} sb=${JSON.stringify(sb())}`,
    })
    expect(sb()).toBe('from A')
  })

  it('drops frames buffered during an authorize that REJECTS (never applied)', async () => {
    let rejectNext = false
    server = await createSyncServer({
      port: 0,
      authorize: async ({ token }) => {
        await sleep(100)
        return !(rejectNext && token === 'evil')
      },
    })
    const url = `ws://127.0.0.1:${server.port}/reject-buffer`
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    const sa = syncedSignal({ doc: a, key: 'title', initial: '' })
    await waitFor('A synced', () => ta.synced(), { describe: () => `ta.synced=${ta.synced()}` })

    rejectNext = true
    const evilDoc = new Y.Doc()
    evilDoc.getMap('pyreon').set('title', 'INJECTED')
    const evil = await openRaw(`${url}?token=evil`)
    const closed = trackClose(evil)
    evil.send(encodeSyncMessage(MSG_UPDATE, Y.encodeStateAsUpdate(evilDoc)))
    expect(await closed.wait('the rejected socket to close')).toBe(4401)
    await sleep(100)
    expect(sa(), 'a rejected client never reaches the room').toBe('')
  })

  it('does not leak a room when the client disconnects during authorize', async () => {
    server = await createSyncServer({
      port: 0,
      authorize: async () => {
        await sleep(100)
        return true
      },
    })
    const url = `ws://127.0.0.1:${server.port}/leak`
    const racer = await openRaw(url)
    racer.close()
    await sleep(250)
    const s = server
    await waitFor('the relay to hold zero rooms', () => s.rooms === 0, {
      describe: () => `rooms=${s.rooms}`,
    })
    expect(s.rooms).toBe(0)
  })

  it('closes a socket that floods frames while authorize is pending (1008)', async () => {
    server = await createSyncServer({
      port: 0,
      authorize: async () => {
        await sleep(300)
        return true
      },
    })
    const sock = await openRaw(`ws://127.0.0.1:${server.port}/flood`)
    const closed = trackClose(sock)
    for (let i = 0; i < 300; i++) sock.send(new Uint8Array([MSG_UPDATE, 0, 0]))
    expect(await closed.wait('the flooding socket to be closed')).toBe(1008)
  })

  // ── 2. heartbeat ───────────────────────────────────────────────────────────
  it('terminates a half-open socket that stops answering pings, purging its presence', async () => {
    server = await createSyncServer({ port: 0, heartbeatIntervalMs: 50 })
    const url = `ws://127.0.0.1:${server.port}/heartbeat`
    const b = createYjsDoc()
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => tb.disconnect(),
      () => pb.dispose(),
    )
    await waitFor('B connected', () => tb.connected, { describe: () => `tb.connected=${tb.connected}` })

    // A "half-open" peer: its TCP connection is still up, but it never answers a
    // ping (autoPong off models a vanished NAT mapping / suspended laptop).
    const ghostAw = new Awareness(new Y.Doc())
    ghostAw.setLocalState({ name: 'Ghost' })
    const ghost = await openRaw(url, { autoPong: false })
    const ghostClosed = trackClose(ghost)
    ghost.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(ghostAw, [ghostAw.clientID])))
    await waitFor('B to see Ghost', () => names(pb.others()).includes('Ghost'), {
      describe: () => `others=${JSON.stringify(names(pb.others()))}`,
    })

    await ghostClosed.wait('the relay to terminate the non-ponging socket')
    await waitFor('Ghost to be purged from B', () => !names(pb.others()).includes('Ghost'), {
      describe: () => `others=${JSON.stringify(names(pb.others()))}`,
    })
    // A responsive client survives many heartbeat rounds.
    await sleep(300)
    expect(tb.connected).toBe(true)
    ghostAw.destroy()
  })

  it('heartbeatIntervalMs: 0 disables the heartbeat', async () => {
    server = await createSyncServer({ port: 0, heartbeatIntervalMs: 0 })
    const quiet = await openRaw(`ws://127.0.0.1:${server.port}/no-hb`, { autoPong: false })
    await sleep(200)
    expect(quiet.readyState).toBe(WsClient.OPEN)
    quiet.close()
  })

  // ── 3. presence spoofing ───────────────────────────────────────────────────
  it("rejects an awareness update for another socket's clientId (no spoof, no purge-by-proxy)", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/spoof`
    const a = createYjsDoc()
    const c = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    const pc = syncedAwareness<Presence>(c, { name: 'Carol' })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tc = connectViaWebSocket(c, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tc.disconnect(),
      () => pa.dispose(),
      () => pc.dispose(),
    )
    await waitFor('Carol to see Alice', () => names(pc.others()).includes('Alice'), {
      describe: () => `others=${JSON.stringify(names(pc.others()))}`,
    })

    // Mallory forges Alice's clientId with a higher clock.
    const aliceId = pa.awareness.clientID
    const forgedDoc = new Y.Doc()
    forgedDoc.clientID = aliceId
    const forged = new Awareness(forgedDoc)
    for (let i = 0; i < 5; i++) forged.setLocalState({ name: `Evil${i}` })
    const mallory = await openRaw(url)
    mallory.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(forged, [aliceId])))
    // A legit frame for Mallory's OWN id afterwards — frames are processed in
    // order, so once Carol sees Mallory the forged frame has been handled.
    const own = new Awareness(new Y.Doc())
    own.setLocalState({ name: 'Mallory' })
    mallory.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(own, [own.clientID])))
    await waitFor('Carol to see Mallory', () => names(pc.others()).includes('Mallory'), {
      describe: () => `others=${JSON.stringify(names(pc.others()))}`,
    })
    expect(names(pc.others()), 'the forged state never reached Carol').toContain('Alice')
    expect(names(pc.others()).some((n) => n.startsWith('Evil'))).toBe(false)

    // Mallory leaves: only HER id may be purged — Alice stays.
    const closed = trackClose(mallory)
    mallory.close()
    await closed.wait('Mallory to close')
    await waitFor('Mallory purged from Carol', () => !names(pc.others()).includes('Mallory'), {
      describe: () => `others=${JSON.stringify(names(pc.others()))}`,
    })
    expect(names(pc.others())).toContain('Alice')
    expect(warn.mock.calls.some((args) => String(args[0]).includes('[Pyreon]'))).toBe(true)
    forged.destroy()
    own.destroy()
  })

  it('drops a malformed awareness frame (truncated / unterminated / oversized varint) without crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-garbage`
    const b = createYjsDoc()
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => tb.disconnect(),
      () => pb.dispose(),
    )
    const raw = await openRaw(url)
    raw.send(new Uint8Array([MSG_AWARENESS, 1, 5, 1, 100])) // state length past the end
    raw.send(new Uint8Array([MSG_AWARENESS, 0x80])) // varint never terminates
    raw.send(new Uint8Array([MSG_AWARENESS, ...new Array<number>(10).fill(0xff), 0])) // > 2^53
    const own = new Awareness(new Y.Doc())
    own.setLocalState({ name: 'StillAlive' })
    raw.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(own, [own.clientID])))
    await waitFor('B to see the valid presence sent after the garbage', () => names(pb.others()).includes('StillAlive'), {
      describe: () => `others=${JSON.stringify(names(pb.others()))}`,
    })
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('malformed awareness')).length).toBe(3)
    raw.close()
    own.destroy()
  })

  // ── 4. awareness created AFTER the transport connected ─────────────────────
  it('WS: a syncedAwareness created after connect is still sent + received', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/late-aw`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
      () => pb.dispose(),
    )
    await waitFor('both synced', () => ta.synced() && tb.synced(), {
      describe: () => `ta.synced=${ta.synced()} tb.synced=${tb.synced()}`,
    })
    // Presence is opted into only now — the usual shape when a component that
    // renders avatars mounts after the app connected.
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    disposers.push(() => pa.dispose())
    await waitFor('Bob to see Alice', () => names(pb.others()).includes('Alice'), {
      describe: () => `bob.others=${JSON.stringify(names(pb.others()))}`,
    })
    await waitFor('Alice to see Bob', () => names(pa.others()).includes('Bob'), {
      describe: () => `alice.others=${JSON.stringify(names(pa.others()))}`,
    })
    pa.setLocal({ name: 'Alice2' })
    await waitFor('Bob to see the live update', () => names(pb.others()).includes('Alice2'), {
      describe: () => `bob.others=${JSON.stringify(names(pb.others()))}`,
    })
  })

  it('BroadcastChannel: a syncedAwareness created after connect is still sent + received', async () => {
    const channel = `late-aw-${crypto.randomUUID()}`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pb = syncedAwareness<Presence>(b, { name: 'TabB' })
    const lb = connectViaBroadcastChannel(b, channel)
    const la = connectViaBroadcastChannel(a, channel)
    disposers.push(
      () => la.disconnect(),
      () => lb.disconnect(),
      () => pb.dispose(),
    )
    await sleep(50)
    const pa = syncedAwareness<Presence>(a, { name: 'TabA' })
    disposers.push(() => pa.dispose())
    await waitFor('TabB to see TabA', () => names(pb.others()).includes('TabA'), {
      describe: () => `b.others=${JSON.stringify(names(pb.others()))}`,
    })
    await waitFor('TabA to see TabB', () => names(pa.others()).includes('TabB'), {
      describe: () => `a.others=${JSON.stringify(names(pa.others()))}`,
    })
  })

  // ── 5. whenSynced on a terminal close ──────────────────────────────────────
  it('whenSynced() REJECTS when the relay refuses the connection (4401)', async () => {
    server = await createSyncServer({ port: 0, authorize: () => false })
    const url = `ws://127.0.0.1:${server.port}/denied`
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, url, { WebSocketImpl: WSImpl })
    disposers.push(() => ta.disconnect())
    const first = settle(ta.whenSynced())
    await waitFor('whenSynced() to settle after the 4401', () => first.state !== 'pending', {
      describe: () => `state=${first.state} connected=${ta.connected}`,
    })
    expect(first.state).toBe('rejected')
    expect(String(first.error)).toMatch(/\[Pyreon\].*unauthorized/i)
    // A caller arriving after the refusal is told immediately, too.
    await expect(ta.whenSynced()).rejects.toThrow(/unauthorized/i)
  })

  it('whenSynced() REJECTS when the transport is disconnected before it syncs', async () => {
    server = await createSyncServer({
      port: 0,
      authorize: async () => {
        await sleep(200)
        return true
      },
    })
    const a = createYjsDoc()
    const ta = connectViaWebSocket(a, `ws://127.0.0.1:${server.port}/early-bye`, {
      WebSocketImpl: WSImpl,
    })
    const pending = settle(ta.whenSynced())
    ta.disconnect()
    await waitFor('whenSynced() to settle after disconnect()', () => pending.state !== 'pending', {
      describe: () => `state=${pending.state}`,
    })
    expect(pending.state).toBe('rejected')
    expect(String(pending.error)).toMatch(/\[Pyreon\].*disconnect/i)
  })

  // ── 7. limits + read-only ──────────────────────────────────────────────────
  it('maxRooms refuses a connection that would open a NEW room past the cap (1013)', async () => {
    server = await createSyncServer({ port: 0, maxRooms: 1 })
    const first = await openRaw(`ws://127.0.0.1:${server.port}/r1`)
    const sameRoom = await openRaw(`ws://127.0.0.1:${server.port}/r1`)
    const other = await openRaw(`ws://127.0.0.1:${server.port}/r2`)
    expect(await trackClose(other).wait('the over-cap room to be refused')).toBe(1013)
    expect(sameRoom.readyState, 'joining an EXISTING room is not capped').toBe(WsClient.OPEN)
    first.close()
    sameRoom.close()
  })

  it('maxPayload closes a socket that sends an oversized frame (1009)', async () => {
    server = await createSyncServer({ port: 0, host: '127.0.0.1', maxPayload: 64 })
    const sock = await openRaw(`ws://127.0.0.1:${server.port}/big`)
    const closed = trackClose(sock)
    sock.send(new Uint8Array(1024))
    expect(await closed.wait('the oversized frame to close the socket')).toBe(1009)
  })

  it("authorize → 'read' makes a read-only client: it receives, but its updates are dropped", async () => {
    server = await createSyncServer({
      port: 0,
      authorize: ({ token }) => (token === 'viewer' ? 'read' : true),
    })
    const base = `ws://127.0.0.1:${server.port}/ro`
    const w = createYjsDoc()
    const r = createYjsDoc()
    const tw = connectViaWebSocket(w, `${base}?token=writer`, { reconnect: false, WebSocketImpl: WSImpl })
    const tr = connectViaWebSocket(r, `${base}?token=viewer`, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => tw.disconnect(),
      () => tr.disconnect(),
    )
    const sw = syncedSignal({ doc: w, key: 'title', initial: '' })
    const sr = syncedSignal({ doc: r, key: 'title', initial: '' })
    await waitFor('both synced', () => tw.synced() && tr.synced(), {
      describe: () => `tw.synced=${tw.synced()} tr.synced=${tr.synced()}`,
    })
    // The viewer writes a key the writer never touches (a concurrent write to
    // the SAME key would legitimately diverge on the viewer's own doc by
    // clientId tie-break — read-only clients are not supposed to write).
    const srGhost = syncedSignal({ doc: r, key: 'viewer-only', initial: '' })
    const swGhost = syncedSignal({ doc: w, key: 'viewer-only', initial: '' })
    srGhost.set('viewer tried to write')
    sw.set('writer wrote')
    await waitFor("viewer to receive the writer's value", () => sr() === 'writer wrote', {
      describe: () => `sr=${JSON.stringify(sr())} sw=${JSON.stringify(sw())}`,
    })
    // The writer's value round-tripped through the relay AFTER the viewer's
    // write was sent, so the relay has already handled (dropped) it.
    await sleep(100)
    expect(swGhost(), "the viewer's write never reached the writer").toBe('')

    // A late joiner reads the ROOM state — it must not contain the viewer's write.
    const late = createYjsDoc()
    const tl = connectViaWebSocket(late, `${base}?token=late`, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => tl.disconnect())
    await waitFor('late joiner synced', () => tl.synced(), { describe: () => `tl.synced=${tl.synced()}` })
    const lateMap = late.yDoc.getMap('pyreon')
    expect(lateMap.get('title')).toBe('writer wrote')
    expect(lateMap.has('viewer-only')).toBe(false)
  })
})
