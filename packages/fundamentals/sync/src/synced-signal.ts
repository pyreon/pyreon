import { type Signal, onCleanup, signal, wrapSignal } from '@pyreon/reactivity'
import { type CrdtDoc, LOCAL_ORIGIN } from './crdt/types'

/** Default map name when none is given — one logical store per map. */
export const DEFAULT_MAP = 'pyreon'

/** A signal whose value is backed by a CRDT map entry. */
export interface SyncedSignal<T> extends Signal<T> {
  /**
   * Detach the CRDT observer for this signal. Idempotent. Call it when the
   * signal outlives no reactive scope (module-scope / manual lifecycle); inside
   * a reactive scope it auto-disposes via `onCleanup`.
   */
  dispose(): void
}

export interface SyncedSignalOptions<T> {
  /** The CRDT document holding the value. */
  doc: CrdtDoc
  /** Named map within the doc. Defaults to {@link DEFAULT_MAP}. */
  map?: string
  /** Key within the map. */
  key: string
  /**
   * Seed value, written into the CRDT **only if the key is absent**
   * (create-if-missing). If the key already exists — hydrated from persistence
   * or received from a peer — the existing CRDT value is the source of truth and
   * `initial` is ignored. This is the local-first convention.
   */
  initial: T
}

/**
 * Bind a `Signal<T>` to a single scalar entry in a CRDT map. The returned value
 * is a NORMAL signal (built via `wrapSignal`, so reads / `_v` / `.direct` all
 * delegate to a base signal) — the compiler's `_bindText`/`_bindDirect` fast
 * paths and every effect treat it exactly like any other signal. That is the
 * whole point: a remote op becomes one `base.set`, which drives one fine-grained
 * DOM update — no re-render, no diff.
 *
 * **The update loop (single source of truth).** Writes go ONLY to the CRDT; the
 * map observer is the ONE path that ever touches the base signal:
 *
 * 1. `synced.set(v)` → `doc.transact(() => map.set(key, v), LOCAL)`. It does NOT
 *    write the base signal — doing both would double-apply.
 * 2. `map.observe` fires at every committed transaction (local AND remote) →
 *    `base.set(map.get(key))`. This is the only writer of `base`.
 * 3. Echo is harmless: when the observer re-reports the value `base` already
 *    holds, `base.set` is an `Object.is` no-op (true for scalar values — the v1
 *    scope). The NETWORK loop is prevented in the transport (it never
 *    re-broadcasts a `REMOTE`-origin update), not here.
 *
 * **Scope: scalar values.** v1 stores whole values per key; the echo no-op and
 * "one op → one update" hold for scalars (string / number / boolean). Objects
 * and arrays are compared by reference, so a coarse whole-value replace still
 * works but re-fires per replace — granular collections are a later phase.
 *
 * @example
 * const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
 * // <h1>{() => title()}</h1>  — surgical update when any peer edits the title
 * title.set('Roadmap')         // writes the CRDT; the observer updates the DOM
 */
export function syncedSignal<T>(options: SyncedSignalOptions<T>): SyncedSignal<T> {
  const { doc, key, initial } = options
  const map = doc.getMap(options.map ?? DEFAULT_MAP)

  // Create-if-missing. The CRDT is authoritative: only seed when the key is
  // absent, so a value already present (persisted / from a peer) is never
  // clobbered by a fresh peer's default.
  if (!map.has(key)) {
    doc.transact(() => map.set(key, initial), LOCAL_ORIGIN)
  }

  const base = signal<T>(map.get(key) as T)

  // The ONE update path. Applies every change to `base` regardless of origin;
  // the signal's Object.is guard makes the local echo a no-op for scalars.
  const off = map.observe((changedKeys) => {
    if (!changedKeys.has(key)) return
    base.set(map.get(key) as T)
  })

  // Writes route to the CRDT only — never to `base` directly (the observer owns
  // that). `update` inherits this via wrapSignal's default (`set(fn(peek()))`).
  const facade = wrapSignal(base, {
    set: (v) => {
      doc.transact(() => map.set(key, v), LOCAL_ORIGIN)
    },
  }) as SyncedSignal<T>

  let disposed = false
  facade.dispose = () => {
    if (disposed) return
    disposed = true
    off()
  }
  // Auto-dispose when created inside a reactive scope. A no-op outside one
  // (onCleanup only registers against an active cleanup collector), so
  // module-scope / component-body callers must call `.dispose()` themselves or
  // use the `syncedStore` layer.
  onCleanup(facade.dispose)

  return facade
}
