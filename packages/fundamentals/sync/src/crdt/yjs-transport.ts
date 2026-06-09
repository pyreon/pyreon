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

// Cross-tab / cross-context wire messages. Uint8Array payloads are
// structured-clonable, so they survive BroadcastChannel.postMessage as-is.
type BcMessage =
  | { kind: 'sv'; sv: Uint8Array } // state vector — "send me what I'm missing"
  | { kind: 'update'; update: Uint8Array } // a diff or a live update

/**
 * Sync a {@link YjsCrdtDoc} across same-origin browsing contexts (tabs / windows)
 * via `BroadcastChannel` — zero network, the canonical local-first multi-tab
 * transport. Browser-only (constructs `BroadcastChannel` lazily, so importing
 * this module under Node/SSR is safe; only calling it touches the global).
 *
 * Implements the minimal y-protocols sync handshake so a LATE-joining tab
 * converges, not just live edits:
 * - on connect, broadcast our state vector (`sv`) — peers reply with the diff we lack;
 * - on receiving an `sv`, reply with `encodeStateAsUpdate(doc, theirSv)` (exactly what they're missing);
 * - on receiving an `update`, `applyUpdate(..., REMOTE)` so it is NOT echoed back;
 * - on a local (non-REMOTE) update, broadcast it.
 *
 * Same echo rule as {@link connectYDocs} — a received (`REMOTE`-origin) update is
 * never re-broadcast, so there is no cross-tab loop.
 */
export function connectViaBroadcastChannel(
  doc: YjsCrdtDoc,
  channelName: string,
): { disconnect: () => void } {
  const bc = new BroadcastChannel(channelName)
  let connected = true

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (!connected || origin === REMOTE_ORIGIN) return
    bc.postMessage({ kind: 'update', update } satisfies BcMessage)
  }
  doc.yDoc.on('update', onUpdate)

  bc.onmessage = (event: MessageEvent<BcMessage>) => {
    if (!connected) return
    const msg = event.data
    if (msg.kind === 'sv') {
      // Send the peer exactly the updates their state vector is missing.
      bc.postMessage({
        kind: 'update',
        update: Y.encodeStateAsUpdate(doc.yDoc, msg.sv),
      } satisfies BcMessage)
    } else {
      Y.applyUpdate(doc.yDoc, msg.update, REMOTE_ORIGIN)
    }
  }

  // Announce ourselves: ask existing peers for whatever we're missing.
  bc.postMessage({ kind: 'sv', sv: Y.encodeStateVector(doc.yDoc) } satisfies BcMessage)

  return {
    disconnect() {
      connected = false
      doc.yDoc.off('update', onUpdate)
      bc.close()
    },
  }
}
