import type { CrdtDoc } from './types'

/**
 * The doc↔transport SYNC seam — engine-neutral, so `syncedSignal` (which only
 * ever holds a {@link CrdtDoc}) can ask "does this doc have a transport that has
 * NOT finished its first sync yet?" WITHOUT importing any engine. It mirrors the
 * doc-owned awareness registry (`yjs-awareness.ts`): a transport REGISTERS its
 * sync state onto the doc when it attaches; the create-if-missing seed consults
 * the doc, never the transport directly.
 *
 * **Why it exists (issue #2380).** `syncedSignal`'s create-if-missing seed used
 * to write `map.set(key, initial)` the moment the key was locally absent — BEFORE
 * the transport synced. Two fresh peers both seed, and if a peer's seed is still
 * causally CONCURRENT with another peer's real `.set()`, `Y.Map` resolves the tie
 * by RANDOM clientId — so a fresh peer's default can permanently clobber a real
 * value. Deferring the seed until first sync (this seam) closes that window: by
 * the time the seed re-checks, any peer value has already arrived and the seed is
 * skipped.
 */

/**
 * A transport's initial-sync state, as the seed-deferral logic sees it. A
 * transport (e.g. the WebSocket transport) provides one when it attaches.
 */
export interface DocTransportSyncState {
  /**
   * `true` once this transport's initial sync round-trip has completed — i.e. we
   * sent our state vector and received the relay/peer's response to it. Resets to
   * `false` across a disconnect and becomes `true` again after each reconnect's
   * round-trip.
   */
  readonly synced: boolean
  /**
   * Register `cb` to fire the FIRST time {@link synced} becomes `true` — or
   * SYNCHRONOUSLY right now if it is already `true`. Returns an unsubscribe. A
   * one-shot: it never fires again after the first sync (a later reconnect does
   * not re-fire it), which is exactly what a create-if-missing seed wants.
   */
  onSynced(cb: () => void): () => void
}

// One transport-set per doc, keyed by the CrdtDoc object identity. A WeakMap so a
// disposed doc's entry is collectable. The doc object is the identity both the
// transport (which is handed the doc) and `syncedSignal({ doc })` share — the
// engine-neutral analog of `yjs-awareness`'s keying on `doc.yDoc`.
const docTransports = new WeakMap<CrdtDoc, Set<DocTransportSyncState>>()

/**
 * Register a transport's {@link DocTransportSyncState} on `doc` — called when the
 * transport attaches. Returns a detach fn the transport calls on `disconnect()`.
 */
export function registerDocTransport(doc: CrdtDoc, state: DocTransportSyncState): () => void {
  let set = docTransports.get(doc)
  if (!set) {
    set = new Set()
    docTransports.set(doc, set)
  }
  set.add(state)
  return () => {
    docTransports.get(doc)?.delete(state)
  }
}

/**
 * Does `doc` have ≥1 attached transport that has NOT yet completed its first
 * sync? A doc with no transport (provably alone / no network) returns `false` —
 * so the seed path takes the immediate branch, unchanged.
 */
export function docHasUnsyncedTransport(doc: CrdtDoc): boolean {
  const set = docTransports.get(doc)
  if (!set) return false
  for (const t of set) if (!t.synced) return true
  return false
}

/**
 * Run `cb` once `doc` is "synced enough" to safely re-check a create-if-missing
 * seed — i.e. once every transport that was UNSYNCED at call time has completed
 * its first sync round-trip. Fires `cb` synchronously if the doc is already
 * synced (or has no transport). Returns a CANCEL fn — call it to drop the pending
 * callback (e.g. when the owning signal is disposed before sync), so no write
 * lands after dispose.
 */
export function whenDocSynced(doc: CrdtDoc, cb: () => void): () => void {
  const set = docTransports.get(doc)
  const pending = set ? [...set].filter((t) => !t.synced) : []
  if (pending.length === 0) {
    cb()
    return () => {}
  }
  let done = false
  let remaining = pending.length
  const offs: Array<() => void> = []
  const cancel = () => {
    if (done) return
    done = true
    for (const off of offs) off()
  }
  for (const t of pending) {
    offs.push(
      t.onSynced(() => {
        if (done) return
        if (--remaining === 0) {
          done = true
          cb()
        }
      }),
    )
  }
  return cancel
}
