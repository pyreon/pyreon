import { isServer } from '@pyreon/reactivity'
import type { StorageOptions, StorageSignal } from './types'

// ─── Signal Registry ─────────────────────────────────────────────────────────

export interface RegistryEntry<T = unknown> {
  signal: StorageSignal<T>
  defaultValue: T
  backend: string
  /**
   * The options the signal was created with. Held so the cross-tab `storage`
   * event handler can deserialize an inbound raw value through the SAME
   * serializer/deserializer + version/migrate pipeline the writer used —
   * without it, a versioned or custom-serialized value synced from another tab
   * would land as the raw envelope / raw string.
   */
  options?: StorageOptions<T>
  /**
   * Per-key consumer refcount. Incremented each `useStorage(key, …)` call
   * (including same-key cached returns); decremented on each `.remove()`.
   * The entry is destroyed only when the count drops to 0 — keeping it
   * alive while N-1 consumers still hold the signal preserves cross-tab
   * sync routing for surviving consumers. See the entry's prose comment
   * in `local.ts:useStorage` for the bug class (post-#725/#729 sweep).
   */
  refCount: number
  /**
   * Apply a value that ALREADY lives in the backing store (an inbound
   * cross-tab `storage` event). Sets the shared base signal and cancels any
   * pending debounced write — it must NOT go through `signal.set`, which
   * persists: persisting an inbound value writes it back, so a removal in
   * another tab is undone here and two tabs on different `version`s
   * re-serialize each other's value forever.
   */
  applyExternal?: (value: T) => void
}

// Default: module-level singleton — correct for a browser, where one process
// serves one user. On a SERVER it is a cross-request bleed: this registry
// caches the RESOLVED SIGNAL per key, so request B's `useCookie('session')`
// returns the signal request A created, holding A's value. `useCookie`'s
// accessor-shaped `setCookieSource` seam was built for exactly that
// concurrency case, and this cache sat ABOVE it and short-circuited the read —
// the seam was correct and unreachable past request #1.
//
// So this mirrors `@pyreon/store`'s registry EXACTLY: a `getRegistry()`
// indirection plus, under `isServer`, a `globalThis` setter that
// @pyreon/runtime-server picks up lazily inside `runWithRequestContext` /
// `renderToString` / `renderToStream`. Neither package imports the other.
const _defaultRegistry = new Map<string, unknown>()
let _registryProvider: () => Map<string, unknown> | undefined = () => _defaultRegistry

/**
 * Override the storage registry provider.
 * Called by @pyreon/runtime-server to inject a per-request isolated registry so
 * cached storage/cookie signals never leak between concurrent SSR requests.
 *
 * A provider returns `undefined` to mean "no request scope here — use the
 * process default". That is load-bearing, not a detail: an ALS-backed provider
 * is out of scope for every call that is not inside a render, and the obvious
 * spelling (`() => als.getStore() ?? new Map()`) fabricates a THROWAWAY map for
 * those calls, so a signal created outside a render would be dropped on the
 * next read — breaking the refcount contract `retainEntry`/`releaseEntry` rely
 * on. `undefined` keeps the pre-isolation behaviour exactly where isolation has
 * nothing to say.
 */
export function setRegistryProvider(
  fn: () => Map<string, unknown> | undefined,
): void {
  _registryProvider = fn
}

function getRegistry(): Map<string, unknown> {
  return _registryProvider() ?? _defaultRegistry
}

/**
 * Publish the setter on a `globalThis` seam so the SSR renderer wires
 * per-request isolation WITHOUT anyone remembering to. Same shape and same
 * reason as `@pyreon/store`'s `__PYREON_STORE_SET_REGISTRY_PROVIDER__` and
 * styler's `__PYREON_STYLER_COLLECT__`: an opt-in hook that N call sites must
 * remember to wire is a silent-hole generator, so the safe behaviour is the
 * DEFAULT at the shared choke point. `@pyreon/server` and `@pyreon/zero` own
 * the server and neither depends on `@pyreon/storage`, so nobody upstream
 * COULD have opted in.
 *
 * Server-only: in a browser one process serves one user, so the module-level
 * registry is correct and this costs nothing.
 */
if (isServer) {
  ;(
    globalThis as {
      __PYREON_STORAGE_SET_REGISTRY_PROVIDER__?: (
        fn: () => Map<string, unknown> | undefined,
      ) => void
    }
  ).__PYREON_STORAGE_SET_REGISTRY_PROVIDER__ = setRegistryProvider
}

// The per-request map holds TWO kinds of value, under disjoint key prefixes:
// registry entries (`entry:<backend>:<key>`) and the scoped sub-maps a backend
// uses for its own module-level state (`scope:<namespace>`). One map rather
// than two seams because both must be isolated by the SAME request boundary —
// isolating the signal while its bytes stay process-global just moves the
// bleed one layer down (see `useMemoryStorage`).
const ENTRY_PREFIX = 'entry:'
const SCOPE_PREFIX = 'scope:'

/**
 * Build a composite key from backend type + storage key to avoid
 * collisions between different backends using the same key name.
 */
function registryKey(backend: string, key: string): string {
  return `${ENTRY_PREFIX}${backend}:${key}`
}

/**
 * A request-scoped `Map` for a backend's OWN state, living inside whichever
 * registry is active — so it is per-request on a server and process-wide in a
 * browser, exactly like the entries beside it.
 *
 * `useMemoryStorage`'s byte store is the reason this exists: isolating the
 * cached SIGNAL is not enough on its own, because a fresh signal seeded from a
 * process-global byte store still reads the previous request's value.
 */
export function getScopedMap<V>(namespace: string): Map<string, V> {
  const registry = getRegistry()
  const key = SCOPE_PREFIX + namespace
  let scoped = registry.get(key) as Map<string, V> | undefined
  if (scoped === undefined) {
    scoped = new Map<string, V>()
    registry.set(key, scoped)
  }
  return scoped
}

/**
 * Get an existing signal from the registry.
 */
export function getEntry<T>(backend: string, key: string): RegistryEntry<T> | undefined {
  return getRegistry().get(registryKey(backend, key)) as RegistryEntry<T> | undefined
}

/**
 * Register a new signal in the registry. New entries start at refCount = 1
 * (the first consumer). `retainEntry` is the API for additional consumers
 * (cached returns from `useStorage`).
 */
export function setEntry<T>(
  backend: string,
  key: string,
  signal: StorageSignal<T>,
  defaultValue: T,
  options?: StorageOptions<T>,
  applyExternal?: (value: T) => void,
): void {
  // Cast through `RegistryEntry` (T → unknown): `options` carries contravariant
  // callbacks (`serializer`/`migrate`) so `StorageOptions<T>` isn't structurally
  // assignable to the map's `StorageOptions<unknown>` slot under
  // `exactOptionalPropertyTypes` — the registry is internally untyped by design
  // (`getEntry<T>` casts back on read).
  getRegistry().set(registryKey(backend, key), {
    signal,
    defaultValue,
    backend,
    refCount: 1,
    options,
    applyExternal,
  } as RegistryEntry)
}

/**
 * Increment the per-key consumer refcount. Called for same-key cached
 * returns in `useStorage` so a single consumer's `.remove()` doesn't
 * destroy the entry while siblings still hold the signal.
 */
export function retainEntry(backend: string, key: string): void {
  const entry = getRegistry().get(registryKey(backend, key)) as RegistryEntry | undefined
  /* v8 ignore next — defensive null entry guard; caller chain always has live entry */
  if (entry) entry.refCount++
}

/**
 * Decrement the per-key consumer refcount. Returns `true` if the entry
 * was removed (count reached 0), `false` if the entry remains (other
 * consumers exist). Used by `.remove()` to gate listener-detach +
 * registry-delete behind a true LAST-consumer release.
 */
export function releaseEntry(backend: string, key: string): boolean {
  const composite = registryKey(backend, key)
  const registry = getRegistry()
  const entry = registry.get(composite) as RegistryEntry | undefined
  /* v8 ignore next — defensive null entry guard; release pairs with retain */
  if (!entry) return false
  entry.refCount--
  if (entry.refCount <= 0) {
    registry.delete(composite)
    return true
  }
  return false
}

/**
 * Remove an entry from the registry unconditionally (bypasses refcount).
 * Used by `removeStorage(key)` — the user-facing "destroy this key
 * everywhere" API — and by test cleanup. Per-consumer `.remove()` goes
 * through `releaseEntry` instead.
 */
export function removeEntry(backend: string, key: string): void {
  getRegistry().delete(registryKey(backend, key))
}

/**
 * Get all entries for a specific backend.
 */
export function getEntriesByBackend(backend: string): RegistryEntry[] {
  const entries: RegistryEntry[] = []
  for (const [key, value] of getRegistry()) {
    // Skip the `scope:` sub-maps that share this registry — they carry no
    // `backend` field, and reading one as an entry would be a silent lie.
    if (!key.startsWith(ENTRY_PREFIX)) continue
    const entry = value as RegistryEntry
    if (entry.backend === backend) entries.push(entry)
  }
  return entries
}

// ─── Same-key option mismatch (dev) ───────────────────────────────────────────
//
// Same-key calls share ONE signal (that is the registry's whole contract), so a
// second `useX(key, otherDefault, otherOptions)` silently gets the FIRST call's
// default, serializer, version, cookie attributes, … Warn once per key in dev.
// Bounded by the number of distinct keys an app uses; dev-only.
const warnedMismatch = new Set<string>()

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      /* v8 ignore next — circular default: cannot compare, do not warn */
      return true
    }
  }
  return false
}

function firstDifference(
  prevDefault: unknown,
  nextDefault: unknown,
  prevOptions: object | undefined,
  nextOptions: object | undefined,
): string | null {
  if (!sameValue(prevDefault, nextDefault)) return 'default value'
  const prev = (prevOptions ?? {}) as Record<string, unknown>
  const next = (nextOptions ?? {}) as Record<string, unknown>
  for (const name of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[name]
    const b = next[name]
    // Inline callbacks are a new function on every call — compare presence only.
    if (typeof a === 'function' && typeof b === 'function') continue
    if (!sameValue(a, b)) return `\`${name}\` option`
  }
  return null
}

/**
 * Dev-only: warn (once per key) when a same-key call passes a default or
 * options that differ from the call that created the shared signal — those
 * differences are silently ignored.
 */
export function warnIfOptionsDiffer<T>(
  backend: string,
  key: string,
  entry: RegistryEntry<T>,
  defaultValue: T,
  options: StorageOptions<T> | undefined,
): void {
  if (process.env.NODE_ENV === 'production') return
  const id = `${backend}:${key}`
  if (warnedMismatch.has(id)) return
  const diff = firstDifference(entry.defaultValue, defaultValue, entry.options, options)
  if (diff === null) return
  warnedMismatch.add(id)
  // oxlint-disable-next-line no-console
  console.warn(
    `[Pyreon] @pyreon/storage: "${key}" (${backend}) is already in use with a different ${diff}. ` +
      'Every call for the same key shares ONE signal, so this call\'s default and options are ignored. ' +
      'Pass the same default and options everywhere, or use a different key.',
  )
}

/**
 * Clear all entries from the registry. Used for testing.
 */
export function _resetRegistry(): void {
  getRegistry().clear()
  warnedMismatch.clear()
}
