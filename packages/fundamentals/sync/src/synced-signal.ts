import { type Signal, onCleanup, signal, wrapSignal } from '@pyreon/reactivity'
import { docHasUnsyncedTransport, whenDocSynced } from './crdt/doc-sync'
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
   *
   * **The seed write is DEFERRED until first sync when a transport is attached**
   * (issue #2380): a fresh peer no longer writes its default before the sync
   * round-trip completes, so a peer's real value can never be clobbered by a
   * default on a random-clientId tie-break. `initial` still shows immediately as
   * the OPTIMISTIC local value; it is only WRITTEN to the CRDT once sync confirms
   * the key is still absent (empty room). Attach the transport (and any
   * persistence) BEFORE creating the synced signal for this guarantee. Residual:
   * two FRESH peers seeding an EMPTY room with DIFFERENT `initial` values for the
   * same key is an inherent conflict that still tie-breaks — gate app defaults
   * behind `transport.synced` if that matters.
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

  // OPTIMISTIC local value: show `initial` immediately when the key is locally
  // absent, WITHOUT writing it to the CRDT yet — the CRDT write is the SEED,
  // deferred below. If the key is already present (persisted / already-synced
  // peer value), THAT value is authoritative and `initial` is ignored.
  const base = signal<T>(map.has(key) ? (map.get(key) as T) : initial)

  // The ONE update path. Applies every change to `base` regardless of origin;
  // the signal's Object.is guard makes the local echo a no-op for scalars.
  const off = map.observe((changedKeys) => {
    if (!changedKeys.has(key)) return
    base.set(map.get(key) as T)
  })

  let disposed = false
  let cancelSeed: (() => void) | undefined

  // Create-if-missing SEED — the CRDT write. Only when the key is STILL absent
  // (a value already present — persisted / from a peer — is never clobbered).
  const seedIfAbsent = () => {
    if (disposed || map.has(key)) return
    doc.transact(() => map.set(key, initial), LOCAL_ORIGIN)
  }
  if (docHasUnsyncedTransport(doc)) {
    // A transport is attached but has NOT finished its first sync — DEFER the
    // seed (issue #2380). When sync completes, re-check `map.has(key)`: a peer
    // value that arrived during sync has already been applied by the observer
    // (populating `base`), so `seedIfAbsent` correctly SKIPS. Only a genuinely
    // empty room seeds `initial`. The deferral is CANCELED on dispose so no write
    // ever lands after teardown.
    cancelSeed = whenDocSynced(doc, () => {
      cancelSeed = undefined
      seedIfAbsent()
    })
  } else {
    // No transport (provably local / alone) OR already synced → seed now.
    seedIfAbsent()
  }

  // Writes route to the CRDT only — never to `base` directly (the observer owns
  // that). `update` inherits this via wrapSignal's default (`set(fn(peek()))`).
  const facade = wrapSignal(base, {
    set: (v) => {
      doc.transact(() => map.set(key, v), LOCAL_ORIGIN)
    },
  }) as SyncedSignal<T>

  facade.dispose = () => {
    if (disposed) return
    disposed = true
    cancelSeed?.()
    off()
  }
  // Auto-dispose when created inside a reactive scope. A no-op outside one
  // (onCleanup only registers against an active cleanup collector), so
  // module-scope / component-body callers must call `.dispose()` themselves or
  // use the `syncedStore` layer.
  onCleanup(facade.dispose)

  return facade
}
