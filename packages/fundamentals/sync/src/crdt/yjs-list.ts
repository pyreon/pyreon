import { type Signal, onCleanup, signal, wrapSignal } from '@pyreon/reactivity'
import { LOCAL_ORIGIN } from './types'
import type { YjsCrdtDoc } from './yjs-adapter'

/** A `Signal<T[]>` backed by a collaborative `Y.Array`. */
export interface SyncedList<T> extends Signal<T[]> {
  /** Append items to the end. */
  push(...items: T[]): void
  /** Insert items at `index`. */
  insert(index: number, items: T[]): void
  /** Delete `count` items (default 1) starting at `index`. */
  delete(index: number, count?: number): void
  /** Detach the Y.Array observer. Idempotent. */
  dispose(): void
}

/**
 * Bind a `Signal<T[]>` to a Yjs `Y.Array` — a COLLABORATIVE list with positional
 * CRDT merge. Concurrent `push`/`insert` from two peers are BOTH kept (no item
 * dropped); render it with a keyed `<For each={() => list()} by={…}>` so a remote
 * change reconciles O(changed), not a full re-render.
 *
 * Engine-specific (lives in `@pyreon/sync/yjs`) — like `syncedText`, a list CRDT
 * is coupled to the engine's array type, so it is not behind the engine-neutral
 * seam.
 *
 * Use `.push` / `.insert` / `.delete` (positional ops Y.Array merges faithfully)
 * for true concurrent editing. `.set(nextArray)` does a whole-list replace
 * (clear + insert) — convenient, but a replace from two peers resolves by that
 * coarse op, not a positional merge, so prefer the positional ops where
 * concurrency matters.
 */
export function syncedList<T>(doc: YjsCrdtDoc, key: string): SyncedList<T> {
  const yarr = doc.yDoc.getArray<T>(key)
  const base = signal<T[]>(yarr.toArray())

  // The single update path: Y.Array → base, on every committed change (local and
  // remote). `toArray()` returns a fresh array each time, so the keyed `<For>`
  // reconciles against the new snapshot.
  const observer = () => base.set(yarr.toArray())
  yarr.observe(observer)

  const facade = wrapSignal(base, {
    set: (next: T[]) => {
      doc.yDoc.transact(() => {
        if (yarr.length > 0) yarr.delete(0, yarr.length)
        if (next.length > 0) yarr.insert(0, [...next])
      }, LOCAL_ORIGIN)
    },
  }) as SyncedList<T>

  facade.push = (...items: T[]) => {
    doc.yDoc.transact(() => yarr.push(items), LOCAL_ORIGIN)
  }
  facade.insert = (index: number, items: T[]) => {
    doc.yDoc.transact(() => yarr.insert(index, items), LOCAL_ORIGIN)
  }
  facade.delete = (index: number, count = 1) => {
    doc.yDoc.transact(() => yarr.delete(index, count), LOCAL_ORIGIN)
  }

  let disposed = false
  facade.dispose = () => {
    if (disposed) return
    disposed = true
    yarr.unobserve(observer)
  }
  onCleanup(facade.dispose)

  return facade
}
