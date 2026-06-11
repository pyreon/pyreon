import { type Signal, onCleanup, signal } from '@pyreon/reactivity'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import type { YjsCrdtDoc } from './yjs-adapter'

/**
 * Yjs **awareness** — ephemeral, never-persisted presence (who's online + their
 * live cursor), a SEPARATE protocol from the document CRDT. Doc updates merge +
 * persist; awareness is a transient register that auto-expires and is cleaned up
 * the moment a peer disconnects. This is the layer behind "live cursors" and
 * "N people here" avatars.
 *
 * Engine-specific (in `@pyreon/sync/yjs`, not behind the engine-neutral seam) —
 * awareness is inherently coupled to the CRDT's clock/clientID, like
 * {@link syncedText} / {@link syncedList}.
 */

// One Awareness per Y.Doc, SHARED by the transports + the reactive primitive.
// Keyed by the underlying Y.Doc so a transport can look one up WITHOUT creating
// it — apps that never call `syncedAwareness` pay zero awareness overhead (the
// transports skip the awareness channel entirely when none exists).
const docAwareness = new WeakMap<object, Awareness>()

/** Get (lazily creating + caching) the {@link Awareness} for a doc. */
export function getDocAwareness(doc: YjsCrdtDoc): Awareness {
  let aw = docAwareness.get(doc.yDoc)
  if (!aw) {
    aw = new Awareness(doc.yDoc)
    docAwareness.set(doc.yDoc, aw)
  }
  return aw
}

/**
 * Get the doc's {@link Awareness} WITHOUT creating one — returns `undefined` when
 * no `syncedAwareness` has been created for this doc. The transports call this so
 * the awareness channel stays inert (zero cost) for non-presence apps.
 */
export function peekDocAwareness(doc: YjsCrdtDoc): Awareness | undefined {
  return docAwareness.get(doc.yDoc)
}

/**
 * Tear down the doc's {@link Awareness} (if any) — the DOC owns this lifecycle,
 * NOT an individual `syncedAwareness` view. Called by `YjsCrdtDoc.destroy()`.
 * Announces our departure (so a still-attached transport broadcasts the removal),
 * destroys the awareness, and drops the cache entry. Idempotent.
 */
export function destroyDocAwareness(doc: YjsCrdtDoc): void {
  const aw = docAwareness.get(doc.yDoc)
  if (!aw) return
  docAwareness.delete(doc.yDoc)
  try {
    removeAwarenessStates(aw, [aw.clientID], 'doc-destroy')
  } catch {
    // already torn down — nothing to announce
  }
  aw.destroy()
}

/** One peer's presence: its clientId, its state, and whether it is us. */
export interface PeerState<T> {
  clientId: number
  state: T
  isLocal: boolean
}

/**
 * A reactive view over a doc's awareness — `local`/`others`/`states` are read
 * signals that recompute on every awareness change (a peer joins, leaves, or
 * moves their cursor); `setLocal`/`setLocalField` publish our own presence.
 */
export interface SyncedAwareness<T> {
  /** Replace our entire local presence state (broadcast to peers on the next tick). */
  setLocal(state: T): void
  /** Patch one field of our local presence (e.g. `setLocalField('cursor', { x, y })`). */
  setLocalField<K extends keyof T>(key: K, value: T[K]): void
  /** Our own current presence state, or `null` if we haven't published one. */
  local: Signal<T | null>
  /** Every OTHER peer's presence (excludes us) — the avatars + cursors to render. */
  others: Signal<PeerState<T>[]>
  /** Every peer's presence INCLUDING us. */
  states: Signal<PeerState<T>[]>
  /** The raw `y-protocols` Awareness — escape hatch for advanced use. */
  awareness: Awareness
  /**
   * Detach THIS view's change observer (stops it tracking). Idempotent. Does NOT
   * destroy the doc-shared {@link Awareness} — that is owned by the doc
   * (`YjsCrdtDoc.destroy()`), and departure is announced by the transport on
   * disconnect. Auto-called on the owning component's unmount via `onCleanup`.
   */
  dispose(): void
}

/**
 * Bind reactive presence to a {@link YjsCrdtDoc}. Returns read signals that track
 * peers' presence and methods to publish your own — wired to whichever transports
 * are (or later get) connected to the doc, since they share the doc's single
 * {@link Awareness}.
 *
 * Awareness is **ephemeral**: it is NEVER persisted (don't put durable data in
 * it — use {@link syncedSignal}/{@link syncedStore} for that), and a peer's state
 * is removed the moment it disconnects.
 *
 * @example
 * const presence = syncedAwareness<{ name: string; cursor?: { x: number; y: number } }>(
 *   doc, { name: "Vít" },
 * )
 * // window.addEventListener('mousemove', e => presence.setLocalField('cursor', { x: e.clientX, y: e.clientY }))
 * // <For each={() => presence.others()} by={p => p.clientId}>{p => <Cursor at={p.state.cursor} />}</For>
 */
export function syncedAwareness<T extends object>(
  doc: YjsCrdtDoc,
  initial?: T,
): SyncedAwareness<T> {
  const aw = getDocAwareness(doc)
  // y-protocols types the state as an index-signature object; `T extends object`
  // (so plain `interface` shapes work, which lack an implicit index signature).
  if (initial !== undefined) aw.setLocalState(initial as Record<string, unknown>)

  // Build a stable snapshot of present peers (skip null = a removed-but-pending
  // entry). A fresh array every call so the signal's Object.is guard always
  // notifies — presence genuinely changed.
  const snapshot = (): PeerState<T>[] => {
    const out: PeerState<T>[] = []
    for (const [clientId, state] of aw.getStates()) {
      if (state == null) continue
      out.push({ clientId, state: state as T, isLocal: clientId === aw.clientID })
    }
    return out
  }
  const readLocal = (): T | null => (aw.getLocalState() as T | null) ?? null

  const initialSnap = snapshot()
  const states = signal<PeerState<T>[]>(initialSnap)
  const others = signal<PeerState<T>[]>(initialSnap.filter((p) => !p.isLocal))
  const local = signal<T | null>(readLocal())

  // `change` fires on actual state add/update/remove (not pure clock bumps), so
  // the UI recomputes only when presence really changed.
  const onChange = () => {
    const snap = snapshot()
    states.set(snap)
    others.set(snap.filter((p) => !p.isLocal))
    local.set(readLocal())
  }
  aw.on('change', onChange)

  let disposed = false
  const api: SyncedAwareness<T> = {
    setLocal: (state: T) => aw.setLocalState(state as Record<string, unknown>),
    setLocalField: (key, value) => aw.setLocalStateField(key as string, value),
    local,
    others,
    states,
    awareness: aw,
    // Dispose THIS reactive view only — detach its `change` listener so it stops
    // tracking. It must NOT destroy the shared, doc-level Awareness: transports
    // (peekDocAwareness) and any OTHER syncedAwareness view hold the same
    // instance, so destroying it here would strand them (and via onCleanup, a
    // component unmount would silently kill the doc's presence). The Awareness is
    // owned by the doc — torn down by `YjsCrdtDoc.destroy()` → destroyDocAwareness.
    // Departure announcements live in the TRANSPORT disconnect + the relay's
    // socket-close cleanup, not here.
    dispose: () => {
      if (disposed) return
      disposed = true
      aw.off('change', onChange)
    },
  }
  onCleanup(api.dispose)
  return api
}
