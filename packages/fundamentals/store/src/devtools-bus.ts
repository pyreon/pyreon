/**
 * The registry-change channel between the store runtime and
 * `@pyreon/store/devtools`. Kept out of both entries so `_notifyChange` is
 * not public API (it is re-exported only from `@pyreon/store/internal`).
 */

const _listeners = new Set<() => void>()

/** @internal — called by defineStore/resetStore to notify devtools. */
export function _notifyChange(): void {
  // Size guard: the common case (no devtools attached) skips the for..of
  // iterator allocation on every store creation / reset.
  if (_listeners.size === 0) return
  for (const listener of _listeners) listener()
}

/** Add a registry-change listener. Returns the unsubscribe. */
export function addChangeListener(listener: () => void): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}
