import * as Y from 'yjs'
import { REMOTE_ORIGIN } from './types'
import type { YjsCrdtDoc } from './yjs-adapter'

/**
 * Wire two {@link YjsCrdtDoc}s into a live in-memory peer link — the real-Yjs
 * analog of `connectFakeDocs`, and the transport stand-in for tests + the
 * single-page browser POC.
 *
 * Two parts:
 * 1. **Initial state merge** — on connect, exchange full document state both
 *    ways via `encodeStateAsUpdate` / `applyUpdate`. This is the genuine
 *    CRDT property the fake can't model: two docs that diverged while
 *    disconnected (offline edits) CONVERGE on reconnect, no lost update.
 * 2. **Live relay** — each `yDoc.on('update', …)` forwards local-origin updates
 *    to the peer under {@link REMOTE_ORIGIN}, and NEVER re-forwards an update it
 *    received (origin === REMOTE_ORIGIN) — the same echo-prevention rule as
 *    `connectFakeDocs`, here against the real binary wire format.
 *
 * `disconnect()` detaches the live relay (the offline case); state already
 * exchanged stays. A later reconnect re-runs the initial merge.
 */
export function connectYDocs(
  a: YjsCrdtDoc,
  b: YjsCrdtDoc,
): { disconnect: () => void } {
  let connected = true

  // Snapshot both states BEFORE applying either, then cross-apply — converges
  // divergent (offline) state. Yjs updates are idempotent, so any overlap merges
  // to nothing.
  const aState = Y.encodeStateAsUpdate(a.yDoc)
  const bState = Y.encodeStateAsUpdate(b.yDoc)
  Y.applyUpdate(b.yDoc, aState, REMOTE_ORIGIN)
  Y.applyUpdate(a.yDoc, bState, REMOTE_ORIGIN)

  const relayTo = (to: YjsCrdtDoc) => (update: Uint8Array, origin: unknown) => {
    if (!connected) return
    // Never echo a received update back onto the wire.
    if (origin === REMOTE_ORIGIN) return
    Y.applyUpdate(to.yDoc, update, REMOTE_ORIGIN)
  }
  const onA = relayTo(b)
  const onB = relayTo(a)
  a.yDoc.on('update', onA)
  b.yDoc.on('update', onB)

  return {
    disconnect() {
      connected = false
      a.yDoc.off('update', onA)
      b.yDoc.off('update', onB)
    },
  }
}
