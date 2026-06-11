// @vitest-environment node
// Awareness (ephemeral presence + live cursors) end-to-end. Same harness as
// ws-relay.test.ts: a real `ws` relay + the `ws` package CLIENT (passed as
// `WebSocketImpl`) — NOT Node's global (undici) WebSocket, which deadlocks under
// v8 coverage. Plus a BroadcastChannel pair (Node's worker_threads global) for
// the cross-tab + cross-transport-loop-guard tests.
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket as WsClient } from 'ws'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { getDocAwareness, peekDocAwareness, syncedAwareness } from '../crdt/yjs-awareness'
import { connectViaBroadcastChannel } from '../crdt/yjs-transport'
import { connectViaWebSocket } from '../crdt/yjs-ws-transport'
import { REMOTE_ORIGIN } from '../crdt/types'
import { MSG_AWARENESS, encodeSyncMessage } from '../crdt/ws-protocol'
import { type SyncServer, createSyncServer } from '../server'

const WSImpl = WsClient as unknown as new (url: string) => WebSocket

interface Presence {
  name: string
  cursor?: { x: number; y: number }
}

// TICK-COUNTED deadline (self-extends under CI event-loop starvation) — same
// rationale as ws-relay.test.ts.
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

const names = (peers: ReadonlyArray<{ state: Presence }>): string[] =>
  peers.map((p) => p.state.name).sort()

describe('awareness — presence + cursors over the relay', () => {
  let server: SyncServer | undefined
  const disposers: Array<() => void> = []

  afterEach(async () => {
    for (const d of disposers.splice(0)) d()
    await server?.close()
    server = undefined
  })

  it('A.setLocal → B sees A in others() (and vice-versa)', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw1`
    const a = createYjsDoc()
    const b = createYjsDoc()
    // Create presence BEFORE connecting so the transport wires the doc's awareness.
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
      () => pa.dispose(),
      () => pb.dispose(),
    )

    await waitFor(() => ta.connected && tb.connected)
    await waitFor(() => pb.others().some((p) => p.state.name === 'Alice'))
    await waitFor(() => pa.others().some((p) => p.state.name === 'Bob'))
    expect(names(pb.others())).toContain('Alice')
    expect(names(pa.others())).toContain('Bob')
    // `others` excludes self; `states` includes it.
    expect(pa.others().some((p) => p.isLocal)).toBe(false)
    expect(pa.states().some((p) => p.state.name === 'Alice')).toBe(true)
  }, 30_000)

  it('a live cursor update (setLocalField) propagates to the other peer', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-cursor`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
      () => pa.dispose(),
      () => pb.dispose(),
    )

    await waitFor(() => pb.others().some((p) => p.state.name === 'Alice'))
    pa.setLocalField('cursor', { x: 42, y: 7 })
    await waitFor(() => {
      const alice = pb.others().find((p) => p.state.name === 'Alice')
      return alice?.state.cursor?.x === 42 && alice?.state.cursor?.y === 7
    })
    expect(pb.others().find((p) => p.state.name === 'Alice')?.state.cursor).toEqual({ x: 42, y: 7 })
  }, 30_000)

  it('a THIRD client sees existing peers INSTANTLY on join (stateful-relay join-presence)', async () => {
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-join`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
      () => pa.dispose(),
      () => pb.dispose(),
    )
    // Let A + B register their presence in the room.
    await waitFor(() => pb.others().some((p) => p.state.name === 'Alice'))
    await waitFor(() => pa.others().some((p) => p.state.name === 'Bob'))

    // C joins AFTER A + B are present — the relay sends C the room's current
    // awareness on connect, so C sees BOTH immediately (a stateless relay can't).
    const c = createYjsDoc()
    const pc = syncedAwareness<Presence>(c, { name: 'Carol' })
    const tc = connectViaWebSocket(c, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => tc.disconnect(), () => pc.dispose())

    await waitFor(() => {
      const seen = pc.others().map((p) => p.state.name)
      return seen.includes('Alice') && seen.includes('Bob')
    })
    expect(names(pc.others())).toEqual(['Alice', 'Bob'])
    // And no phantom relay-self entry leaked into the join state.
    expect(pc.others().every((p) => p.state && typeof p.state.name === 'string')).toBe(true)
  }, 30_000)

  it('the RELAY purges a CRASHED peer (unclean disconnect, no departure announce)', async () => {
    // The production-critical guarantee: a tab that CRASHES (network drop, kill)
    // can't announce its own departure — so the relay MUST purge its presence on
    // socket close, or a ghost cursor/avatar lingers forever. We model the crash
    // with a RAW socket that sends presence then terminates abruptly (it never
    // sends a y-protocols removal), isolating the relay's socket-close purge.
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-crash`
    const b = createYjsDoc()
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(() => tb.disconnect(), () => pb.dispose())
    await waitFor(() => tb.connected)

    // A raw "ghost" client announces presence, then vanishes WITHOUT a clean
    // disconnect (no removeAwarenessStates frame).
    const ghostAw = new Awareness(new Y.Doc())
    ghostAw.setLocalState({ name: 'Ghost' })
    const ghost = new WSImpl(url)
    ghost.binaryType = 'arraybuffer'
    await new Promise<void>((res, rej) => {
      ghost.onopen = () => res()
      ghost.onerror = () => rej(new Error('ghost failed to open'))
    })
    ghost.send(encodeSyncMessage(MSG_AWARENESS, encodeAwarenessUpdate(ghostAw, [ghostAw.clientID])))
    await waitFor(() => pb.others().some((p) => p.state.name === 'Ghost'))
    expect(names(pb.others())).toContain('Ghost')

    // Abrupt termination — no announce. ONLY the relay's close-handler purge can
    // drop Ghost from B.
    ghost.close()
    await waitFor(() => !pb.others().some((p) => p.state.name === 'Ghost'))
    expect(names(pb.others())).not.toContain('Ghost')
    ghostAw.destroy()
  }, 30_000)

  it('presence syncs across tabs over BroadcastChannel (no relay)', async () => {
    const channel = `aw-bc-${crypto.randomUUID()}`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'TabA' })
    const pb = syncedAwareness<Presence>(b, { name: 'TabB' })
    const la = connectViaBroadcastChannel(a, channel)
    const lb = connectViaBroadcastChannel(b, channel)
    disposers.push(
      () => la.disconnect(),
      () => lb.disconnect(),
      () => pa.dispose(),
      () => pb.dispose(),
    )

    await waitFor(() => pb.others().some((p) => p.state.name === 'TabA'))
    await waitFor(() => pa.others().some((p) => p.state.name === 'TabB'))
    expect(names(pb.others())).toContain('TabA')
    expect(names(pa.others())).toContain('TabB')
  })

  it('does NOT relay a REMOTE-applied presence across transports (shared REMOTE_ORIGIN — no cross-transport loop)', async () => {
    // Doc D + E are two "tabs" linked over BroadcastChannel. D ALSO (in a real
    // app) has its own relay connection. A presence that D received over the
    // relay is applied under REMOTE_ORIGIN — and must NOT be re-broadcast onto
    // BroadcastChannel, or two transports would ping-pong remote presence. (E
    // gets remote peers from its OWN relay connection, not via D.)
    const channel = `aw-loop-${crypto.randomUUID()}`
    const d = createYjsDoc()
    const e = createYjsDoc()
    const pd = syncedAwareness<Presence>(d, { name: 'Dave' })
    const pe = syncedAwareness<Presence>(e, { name: 'Eve' })
    const ld = connectViaBroadcastChannel(d, channel)
    const le = connectViaBroadcastChannel(e, channel)
    disposers.push(
      () => ld.disconnect(),
      () => le.disconnect(),
      () => pd.dispose(),
      () => pe.dispose(),
    )

    // Local presence DOES cross BroadcastChannel: E sees Dave.
    await waitFor(() => pe.others().some((p) => p.state.name === 'Dave'))

    // Simulate D receiving a remote peer over a DIFFERENT transport — exactly
    // what connectViaWebSocket does on recv: apply under REMOTE_ORIGIN.
    const remote = createYjsDoc()
    const remoteAw = getDocAwareness(remote)
    remoteAw.setLocalState({ name: 'RemoteRicky' })
    applyAwarenessUpdate(
      pd.awareness,
      encodeAwarenessUpdate(remoteAw, [remoteAw.clientID]),
      REMOTE_ORIGIN,
    )
    disposers.push(() => remoteAw.destroy())

    // D sees Ricky locally...
    expect(pd.others().some((p) => p.state.name === 'RemoteRicky')).toBe(true)
    // ...but D must NOT relay a REMOTE presence onto BroadcastChannel — E never
    // learns Ricky from D. Generous window for an (erroneous) relay to occur.
    await new Promise((r) => setTimeout(r, 250))
    expect(pe.others().some((p) => p.state.name === 'RemoteRicky')).toBe(false)
  })

  it('disposing ONE syncedAwareness view does NOT break a second view or a connected transport', async () => {
    // Lifecycle contract: the Awareness is doc-scoped (shared by transports +
    // every view). A view's dispose must detach ONLY its own listener, never
    // destroy the shared instance.
    server = await createSyncServer({ port: 0 })
    const url = `ws://127.0.0.1:${server.port}/aw-multiview`
    const a = createYjsDoc()
    const b = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    const pa2 = syncedAwareness<Presence>(a) // a SECOND view on the SAME doc
    const pb = syncedAwareness<Presence>(b, { name: 'Bob' })
    const ta = connectViaWebSocket(a, url, { reconnect: false, WebSocketImpl: WSImpl })
    const tb = connectViaWebSocket(b, url, { reconnect: false, WebSocketImpl: WSImpl })
    disposers.push(
      () => ta.disconnect(),
      () => tb.disconnect(),
      () => pa.dispose(),
      () => pb.dispose(),
    )
    await waitFor(() => pb.others().some((p) => p.state.name === 'Alice'))

    // Dispose the SECOND view. Pre-fix this called `aw.destroy()` on the shared
    // Awareness → killed the transport's listener + the first view. Post-fix it
    // only detaches pa2's `change` listener.
    pa2.dispose()

    // A's first view + the transport are still live: B's cursor update reaches A.
    pb.setLocalField('cursor', { x: 7, y: 7 })
    await waitFor(
      () => pa.others().find((p) => p.state.name === 'Bob')?.state.cursor?.x === 7,
    )
    expect(pa.others().find((p) => p.state.name === 'Bob')?.state.cursor).toEqual({ x: 7, y: 7 })
  }, 30_000)

  it('doc.destroy() tears down the doc-owned awareness', () => {
    const a = createYjsDoc()
    const pa = syncedAwareness<Presence>(a, { name: 'Alice' })
    expect(peekDocAwareness(a)).toBeDefined()
    pa.dispose() // a view dispose must NOT remove the doc's awareness
    expect(peekDocAwareness(a)).toBeDefined()
    a.destroy() // the DOC owns teardown
    expect(peekDocAwareness(a)).toBeUndefined()
  })
})
