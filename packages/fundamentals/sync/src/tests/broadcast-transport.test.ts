// @vitest-environment node
// Node ships a global BroadcastChannel (worker_threads); two instances with the
// same name communicate within one process — enough to exercise the cross-tab
// transport without a browser. Each test uses a UNIQUE channel name because
// BroadcastChannel is process-global by name (shared across vitest's worker).
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type YjsCrdtDoc, createYjsDoc } from '../crdt/yjs-adapter'
import { connectViaBroadcastChannel, connectYDocs } from '../crdt/yjs-transport'
import { syncedSignal } from '../synced-signal'

const waitFor = (cond: () => boolean, timeoutMs = 5000): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cond()) resolve()
      else if (Date.now() - start > timeoutMs) reject(new Error('waitFor: timed out'))
      else setTimeout(tick, 10)
    }
    tick()
  })

// Number of distinct clients in a doc's state vector — 2 means each peer has
// seen the other's seed, i.e. the connect handshake has exchanged state.
const clientCount = (doc: YjsCrdtDoc): number =>
  Y.decodeStateVector(Y.encodeStateVector(doc.yDoc)).size

// Wait until both peers have exchanged seeds. THEN a subsequent edit is causally
// AFTER both create-if-missing seeds, so it deterministically supersedes them
// (vs racing the handshake, where a concurrent edit + seed conflict resolves by
// clientID — correct CRDT convergence, but a non-deterministic winner). This
// mirrors real usage: a human edits long after the tabs have handshaken.
const settle = (a: YjsCrdtDoc, b: YjsCrdtDoc) =>
  waitFor(() => clientCount(a) >= 2 && clientCount(b) >= 2)

describe('connectViaBroadcastChannel — same-origin cross-context sync', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanup.splice(0)) c()
  })

  it('a live edit propagates to a peer on the same channel', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-converge')
    const cb = connectViaBroadcastChannel(b, 'bc-converge')
    cleanup.push(
      () => ca.disconnect(),
      () => cb.disconnect(),
    )
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })

    await settle(a, b)
    sa.set('hello-bc') // causally after both seeds → deterministically wins
    await waitFor(() => sb() === 'hello-bc')
    expect(sb()).toBe('hello-bc')
  })

  it('a late-joining peer catches up via the state-vector handshake', async () => {
    const a = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-late')
    cleanup.push(() => ca.disconnect())
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('early-edit')
    await new Promise((r) => setTimeout(r, 30))

    // B joins AFTER A's edit, with NO competing seed — its `sv` broadcast pulls
    // the diff from A (so the catch-up is deterministic, not a concurrent race).
    const b = createYjsDoc()
    const cb = connectViaBroadcastChannel(b, 'bc-late')
    cleanup.push(() => cb.disconnect())

    await waitFor(() => b.getMap('pyreon').get('k') === 'early-edit')
    expect(b.getMap('pyreon').get('k')).toBe('early-edit')
  })

  it('does not echo — a received update is not re-broadcast (no loop)', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-echo')
    const cb = connectViaBroadcastChannel(b, 'bc-echo')
    cleanup.push(
      () => ca.disconnect(),
      () => cb.disconnect(),
    )
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })

    await settle(a, b)
    sa.set('once')
    await waitFor(() => sb() === 'once')
    // If there were an echo loop the value would keep churning; assert it stays
    // put across several ticks and both agree.
    await new Promise((r) => setTimeout(r, 80))
    expect(sa()).toBe('once')
    expect(sb()).toBe('once')
  })

  it('SURVIVES a malformed message on the channel (no throw out of the handler)', async () => {
    const a = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-garbage')
    cleanup.push(() => ca.disconnect())

    // A rogue tab posts garbage on the same channel — Yjs would throw on both.
    const rogue = new BroadcastChannel('bc-garbage')
    cleanup.push(() => rogue.close())
    rogue.postMessage({ kind: 'update', update: new Uint8Array([255, 254, 253]) })
    rogue.postMessage({ kind: 'sv', sv: new Uint8Array([255, 254, 253]) })
    await new Promise((r) => setTimeout(r, 80))

    // The transport dropped them; the doc is still usable.
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    sa.set('still-ok')
    expect(sa()).toBe('still-ok')
  })

  it('disconnect detaches the listener — no further propagation', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-disc')
    const cb = connectViaBroadcastChannel(b, 'bc-disc')
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })
    await settle(a, b)
    sa.set('before')
    await waitFor(() => sb() === 'before')

    cb.disconnect() // B stops listening
    sa.set('after')
    await new Promise((r) => setTimeout(r, 80))
    expect(sb()).toBe('before') // B did NOT receive the post-disconnect edit
    ca.disconnect()
  })

  it('a local edit after THIS peer disconnects is never broadcast', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const ca = connectViaBroadcastChannel(a, 'bc-self-disc')
    const cb = connectViaBroadcastChannel(b, 'bc-self-disc')
    cleanup.push(() => cb.disconnect())
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })
    await settle(a, b)

    ca.disconnect() // A stops — its onUpdate must early-return on `!connected`
    sa.set('after-self-disconnect')
    await new Promise((r) => setTimeout(r, 80))
    expect(sb()).toBe('') // nothing was posted from A, so B never saw it
  })
})

describe('connectYDocs — in-memory peer link', () => {
  it('disconnect stops the live relay (later edits do not propagate)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const link = connectYDocs(a, b)
    const sa = syncedSignal({ doc: a, key: 'k', initial: '' })
    const sb = syncedSignal({ doc: b, key: 'k', initial: '' })
    sa.set('live')
    expect(sb()).toBe('live') // in-memory link is synchronous

    link.disconnect()
    sa.set('after-disconnect') // relayTo early-returns on `!connected`
    expect(sb()).toBe('live') // B did not receive the post-disconnect edit
    sa.dispose()
    sb.dispose()
  })
})
