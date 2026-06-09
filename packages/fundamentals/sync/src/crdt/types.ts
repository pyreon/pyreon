/**
 * Engine-neutral CRDT seam.
 *
 * This is the ONLY surface a concrete CRDT engine implements. The reactive
 * bridge (`syncedSignal` / `syncedStore`) is written entirely against these
 * interfaces and imports no engine — so the same bridge runs over a raw
 * `Y.Doc`, a turnkey platform (Jazz CoValues), or the in-memory
 * {@link FakeCrdtAdapter} used in tests. Swapping engines re-platforms the
 * *infrastructure* (persistence / transport / relay), NOT this client bridge.
 *
 * **Scope (v1): scalar map fields only.** A `CrdtMap` is a flat key → scalar
 * register. Nested CRDT structures (`Y.Array` lists, `Y.Text` strings) are a
 * later phase; v1 stores collections as whole-value-replaced scalars, which is
 * correct but coarse (a list change replaces the whole array). See the package
 * README for the phase roadmap.
 */

/**
 * Opaque token identifying the source of a transaction.
 *
 * The bridge tags its own writes with {@link LOCAL_ORIGIN} and applies inbound
 * remote changes under {@link REMOTE_ORIGIN}. **The observer applies changes
 * regardless of origin** — origin is NOT used to gate the local UI update (the
 * signal's built-in `Object.is` write-skip dedupes the echo for scalar values).
 * Origin exists so the *transport* layer can avoid re-broadcasting a change it
 * just received (don't echo a `REMOTE` update back onto the wire) — that guard
 * lives in the transport, never in the observer. A custom origin (any value) is
 * permitted; it is compared by identity.
 */
export type CrdtOrigin = unknown

/** Tags a transaction that originated from a local `.set` on this peer. */
export const LOCAL_ORIGIN: unique symbol = Symbol.for('pyreon.sync.local')

/** Tags a transaction applied from a remote peer (inbound over the transport). */
export const REMOTE_ORIGIN: unique symbol = Symbol.for('pyreon.sync.remote')

/**
 * A keyed map of scalar CRDT values — the unit a `syncedSignal` binds to.
 *
 * Reads are synchronous; writes must happen inside {@link CrdtDoc.transact} so
 * they carry an origin and fire observers exactly once per transaction.
 */
export interface CrdtMap {
  /** Current value for `key`, or `undefined` if absent. */
  get(key: string): unknown
  /** Set `key`. Must be called inside a {@link CrdtDoc.transact} callback. */
  set(key: string, value: unknown): void
  /** Whether `key` currently has a value. */
  has(key: string): boolean
  /** Snapshot of the currently-present keys. */
  keys(): string[]
  /**
   * Observe changes to this map. The callback fires synchronously at the end of
   * EVERY committed transaction that touched this map — local AND remote — with
   * the set of keys whose value changed and the transaction's origin. Returns an
   * unsubscribe function.
   */
  observe(cb: (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void): () => void
}

/**
 * A CRDT document — a collection of named maps and the transaction boundary.
 */
export interface CrdtDoc {
  /** Get (lazily creating) the named top-level map. Same name → same map. */
  getMap(name: string): CrdtMap
  /**
   * Run `fn` as one atomic transaction tagged with `origin` (defaults to
   * {@link LOCAL_ORIGIN}). All map mutations inside `fn` commit together and
   * observers fire once at the end with `origin`. Nested `transact` calls flatten
   * into the outermost transaction (its origin wins) — matching Yjs semantics.
   */
  transact(fn: () => void, origin?: CrdtOrigin): void
  /** Tear down the document and detach all observers. Idempotent. */
  destroy(): void
}

/**
 * The engine factory. A concrete engine (Yjs / Jazz / fake) provides one of
 * these; everything above the seam takes a `CrdtDoc` and never touches the
 * engine directly.
 */
export interface CrdtAdapter {
  /** Create a fresh, empty document. */
  createDoc(): CrdtDoc
}
