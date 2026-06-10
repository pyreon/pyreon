import * as Y from 'yjs'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import { REMOTE_ORIGIN } from './types'
import { peekDocAwareness } from './yjs-awareness'
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
export function connectYDocs(a: YjsCrdtDoc, b: YjsCrdtDoc): { disconnect: () => void } {
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
  | { kind: 'awareness'; update: Uint8Array } // ephemeral presence (who's here + cursor)

/** The `{ added, updated, removed }` clientId lists a y-protocols awareness event carries. */
interface AwarenessChange {
  added: number[]
  updated: number[]
  removed: number[]
}

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

  // Awareness (ephemeral presence) across tabs — same channel, separate message
  // kind. Wired ONLY when the app opted in (peek, don't create). Reuse the SHARED
  // REMOTE_ORIGIN tag so a received awareness is applied but NOT re-broadcast by
  // this OR a sibling WS transport on the same doc (the cross-transport loop guard).
  const aw = peekDocAwareness(doc)
  const onAwarenessUpdate =
    aw &&
    (({ added, updated, removed }: AwarenessChange, origin: unknown) => {
      if (!connected || origin === REMOTE_ORIGIN) return
      const changed = [...added, ...updated, ...removed]
      bc.postMessage({ kind: 'awareness', update: encodeAwarenessUpdate(aw, changed) } satisfies BcMessage)
    })
  if (aw && onAwarenessUpdate) aw.on('update', onAwarenessUpdate)

  bc.onmessage = (event: MessageEvent<BcMessage>) => {
    if (!connected) return
    const msg = event.data
    // Defensive: a version-mismatched / buggy tab could post a malformed
    // payload, and Yjs THROWS on a bad update / state vector. Drop it rather
    // than leak the throw out of the event handler.
    try {
      if (msg.kind === 'sv') {
        // Send the peer exactly the updates their state vector is missing.
        bc.postMessage({
          kind: 'update',
          update: Y.encodeStateAsUpdate(doc.yDoc, msg.sv),
        } satisfies BcMessage)
        // An `sv` is also "a tab just (re)joined" — reply with our presence so it
        // learns us. BroadcastChannel delivers only to CURRENT subscribers, so a
        // joiner misses our one-shot connect announce; this `sv`-triggered reply
        // is the cross-tab analog of the relay's join-state-on-connect.
        if (aw) {
          bc.postMessage({
            kind: 'awareness',
            update: encodeAwarenessUpdate(aw, [aw.clientID]),
          } satisfies BcMessage)
        }
      } else if (msg.kind === 'awareness') {
        if (aw) applyAwarenessUpdate(aw, msg.update, REMOTE_ORIGIN)
      } else {
        Y.applyUpdate(doc.yDoc, msg.update, REMOTE_ORIGIN)
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Pyreon] connectViaBroadcastChannel: dropped a malformed message:', err)
      }
    }
  }

  // Announce ourselves: ask existing peers for whatever we're missing, and (if
  // presence is in use) publish our local awareness so other tabs see us.
  bc.postMessage({ kind: 'sv', sv: Y.encodeStateVector(doc.yDoc) } satisfies BcMessage)
  if (aw) {
    bc.postMessage({
      kind: 'awareness',
      update: encodeAwarenessUpdate(aw, [aw.clientID]),
    } satisfies BcMessage)
  }

  return {
    disconnect() {
      if (aw && onAwarenessUpdate) {
        // Announce departure WHILE still connected (the listener posts the
        // removal — there is no relay here, so this IS the cleanup), then detach.
        try {
          removeAwarenessStates(aw, [aw.clientID], 'local')
        } catch {
          // awareness already destroyed (primitive disposed first)
        }
        aw.off('update', onAwarenessUpdate)
      }
      connected = false
      doc.yDoc.off('update', onUpdate)
      bc.close()
    },
  }
}
