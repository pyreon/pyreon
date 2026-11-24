/**
 * Symbol used to attach an `@internal` debug view of the per-path
 * signal cache to the store proxy. Tests reach in via this to assert
 * on cache size — production consumers never see it (string-keyed
 * proxy traps short-circuit on symbol props in the existing `get`
 * trap; the symbol is exported for test access only, through
 * `@pyreon/solid-compat/internal`).
 *
 * @internal
 */
export const _STORE_SIGNAL_CACHE = Symbol.for('pyreon/solid-compat:store-signal-cache')
