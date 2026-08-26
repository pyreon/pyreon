import { type Signal, onCleanup, signal, wrapSignal } from '@pyreon/reactivity'
import { docHasUnsyncedTransport, whenDocSynced } from './crdt/doc-sync'
import { observeMapKey } from './crdt/map-dispatch'
import { type CrdtDoc, LOCAL_ORIGIN } from './crdt/types'

/** Default map name when none is given — one logical store per map. */
export const DEFAULT_MAP = 'pyreon'

/**
 * Suffix for the companion map that holds create-if-missing DEFAULTS.
 *
 * Kept OUT of the data map on purpose: a default written alongside real data can
 * win a `Y.Map` clientId tie-break and destroy it (#2519). Reads prefer the data
 * map, so a default can never outrank a real value.
 */
export const DEFAULTS_SUFFIX = ':defaults'

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
  const mapName = options.map ?? DEFAULT_MAP
  const map = doc.getMap(mapName)

  // The SEED lives in a separate key space, and that is a correctness property,
  // not tidiness.
  //
  // Seeding `initial` into the SAME map as real data makes a default able to
  // BEAT that data: two fresh peers in an empty room both seed on sync, so one
  // peer's seed is causally CONCURRENT with the other's real write, and `Y.Map`
  // resolves concurrency by clientId — which Yjs assigns RANDOMLY. Roughly half
  // the time the default wins and the real value is permanently lost (the "two
  // devices open, one types, the other's default wipes it" report, #2519;
  // reproduced at 4 failures in 8 runs).
  //
  // Deferring the seed until first sync (#2385) fixed only the case where a
  // value ALREADY existed; it cannot fix a genuinely empty room, and gating the
  // write on `whenSynced()` does not help either because the seed fires AT sync.
  //
  // Writing defaults to their own map removes the collision entirely: reads
  // PREFER the real map, so a default can never outrank real data no matter how
  // the clientId tie falls. Concurrent defaults still tie among themselves,
  // which is harmless — peers converge on one default instead of diverging.
  const defaults = doc.getMap(`${mapName}${DEFAULTS_SUFFIX}`)

  /** Real value if present, else a shared default, else the local `initial`. */
  const resolve = (): T => {
    if (map.has(key)) return map.get(key) as T
    if (defaults.has(key)) return defaults.get(key) as T
    return initial
  }

  // OPTIMISTIC local value: show `initial` immediately when the key is absent
  // everywhere, WITHOUT writing it — the CRDT write is the SEED, below.
  const base = signal<T>(resolve())

  // The ONE update path. Applies every change to `base` regardless of origin;
  // the signal's Object.is guard makes the local echo a no-op for scalars.
  //
  // Routed through the per-(doc, map) dispatcher (`observeMapKey`) instead of a
  // raw per-field `map.observe`: N fields over one map share ONE engine
  // observer, and this handler runs only when a committed transaction actually
  // changed `key` — the dispatcher evaluates the exact `changedKeys.has(key)`
  // predicate the raw observer applied, by key-indexed lookup. Timing (sync at
  // commit) and origin behavior (fires for local AND remote — loop prevention
  // stays in the transport + the signal's Object.is echo no-op) are unchanged;
  // see the map-dispatch module doc.
  const off = observeMapKey(map, key, () => {
    base.set(resolve())
  })

  // Defaults are watched too, so a peer's default reaches a peer that has none.
  // `resolve()` keeps the precedence: a real value already present WINS, so a
  // late-arriving default can never overwrite it.
  const offDefaults = observeMapKey(defaults, key, () => {
    if (map.has(key)) return
    base.set(resolve())
  })

  let disposed = false
  let cancelSeed: (() => void) | undefined

  // Create-if-missing SEED — the CRDT write, into the DEFAULTS map (see above).
  // Skipped when a real value exists (persisted / from a peer) or another peer
  // already published the same default.
  const seedIfAbsent = () => {
    if (disposed || map.has(key) || defaults.has(key)) return
    doc.transact(() => defaults.set(key, initial), LOCAL_ORIGIN)
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
    offDefaults()
  }
  // Auto-dispose when created inside a reactive scope. A no-op outside one
  // (onCleanup only registers against an active cleanup collector), so
  // module-scope / component-body callers must call `.dispose()` themselves or
  // use the `syncedStore` layer.
  onCleanup(facade.dispose)

  return facade
}
