import { signal, wrapSignal } from '@pyreon/reactivity'
import { getEntry, releaseEntry, retainEntry, setEntry } from './registry'
import type { StorageOptions, StorageSignal } from './types'
import { deserialize, getWebStorage, isBrowser, serialize } from './utils'

// ─── Cross-tab sync ──────────────────────────────────────────────────────────

// Refcount the active localStorage signals so we can detach the `storage`
// event listener when nothing subscribes anymore. Before the refcount, the
// listener was attached on first `useStorage` and NEVER removed, leaking a
// window-level handler across the lifetime of the page even after all
// signals disposed via `.remove()`.
let activeCount = 0
let storageHandler: ((e: StorageEvent) => void) | null = null

function onStorageEvent(e: StorageEvent): void {
  if (!e.key) return
  const entry = getEntry('local', e.key)
  if (!entry) return

  const newValue =
    e.newValue !== null ? deserialize(e.newValue, entry.defaultValue) : entry.defaultValue

  entry.signal.set(newValue)
}

function retainStorageListener(): void {
  /* v8 ignore next — SSR guard */
  if (!isBrowser()) return
  activeCount++
  if (storageHandler === null) {
    storageHandler = onStorageEvent
    window.addEventListener('storage', storageHandler)
  }
}

/**
 * Test-only: force-detach the cross-tab listener and reset the refcount.
 * Used in test teardown to keep `_resetRegistry` and listener state in sync.
 */
export function _resetStorageListener(): void {
  if (storageHandler !== null && isBrowser()) {
    window.removeEventListener('storage', storageHandler)
  }
  storageHandler = null
  activeCount = 0
}

/**
 * Release one refcount on the cross-tab listener. Detaches the window-level
 * handler when the count drops to zero. Called from `.remove()`.
 */
export function releaseStorageListener(): void {
  /* v8 ignore next 2 — SSR + already-released defensive guards */
  if (!isBrowser()) return
  if (activeCount === 0) return
  activeCount--
  if (activeCount === 0 && storageHandler !== null) {
    window.removeEventListener('storage', storageHandler)
    storageHandler = null
  }
}

// ─── useStorage ──────────────────────────────────────────────────────────────

/**
 * Reactive signal backed by localStorage. Automatically syncs across
 * browser tabs via the native `storage` event.
 *
 * @example
 * ```ts
 * const theme = useStorage('theme', 'light')
 * theme()            // 'light' (or stored value)
 * theme.set('dark')  // updates signal + localStorage
 * theme.remove()     // clears storage, resets to default
 * ```
 */
export function useStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions<T>,
): StorageSignal<T> {
  // Same-key consumers must each retain the per-key registry refcount AND
  // the cross-tab listener. Pre-fix: only the FIRST call retained, but
  // every `.remove()` released — driving refcounts below the actual
  // consumer count. The post-fix invariant is that the entry destruction
  // (and cross-tab listener detach) happens only on the LAST consumer's
  // `.remove()`, not the first.
  const existing = getEntry<T>('local', key)
  if (existing) {
    retainEntry('local', key)
    retainStorageListener()
    return existing.signal
  }

  const storage = getWebStorage('local')

  // Read initial value from storage
  let initialValue = defaultValue
  /* v8 ignore next — defensive null storage guard */
  if (storage) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      initialValue = deserialize(raw, defaultValue, options?.deserializer, options?.onError)
    }
  }

  const sig = signal<T>(initialValue)

  // Create the storage signal by extending the base signal
  const storageSig = createStorageSignal(sig, key, defaultValue, 'local', options)

  setEntry('local', key, storageSig, defaultValue)
  retainStorageListener()

  return storageSig
}

// ─── Storage Signal Factory ──────────────────────────────────────────────────

/**
 * Wraps a base signal with storage persistence behavior.
 * Used by both useStorage and useSessionStorage.
 */
export function createStorageSignal<T>(
  sig: ReturnType<typeof signal<T>>,
  key: string,
  defaultValue: T,
  backend: 'local' | 'session',
  options?: StorageOptions<T>,
): StorageSignal<T> {
  const storage = getWebStorage(backend)

  // `wrapSignal` (from @pyreon/reactivity) delegates reads (incl. `.direct` +
  // `_v` for the compiler's `_bindText` fast path) to the SHARED base `sig` and
  // routes writes through our persist function; `.update` defaults to
  // `set(fn(peek()))`. Each call returns a distinct facade, so per-consumer
  // `.remove()` refcounting works over the shared base.
  const storageSig = wrapSignal(sig, {
    set: (value: T) => {
      sig.set(value)
      /* v8 ignore next — defensive null storage guard */
      if (storage) {
        try {
          storage.setItem(key, serialize(value, options?.serializer))
        } catch {
          // Storage full or blocked — signal still updates
        }
      }
    },
  }) as unknown as StorageSignal<T>

  // Add remove method.
  //
  // `.remove()` clears the underlying storage entry, resets the shared
  // signal to its default, and releases ONE refcount on BOTH the per-key
  // registry entry AND the cross-tab listener. The registry entry is
  // destroyed only when its refcount drops to 0 (true last-consumer
  // release) — preserving cross-tab routing for surviving N-1 consumers.
  //
  // Pre-fix `.remove()` unconditionally deleted the registry entry,
  // orphaning every sibling consumer from cross-tab updates the moment
  // any one of them called `.remove()`. Post-fix: surviving consumers
  // keep receiving cross-tab events; the entry destruction (and
  // listener detach via `releaseStorageListener`) is gated on the LAST
  // consumer's release.
  storageSig.remove = () => {
    sig.set(defaultValue)
    /* v8 ignore next — defensive null storage guard */
    if (storage) {
      storage.removeItem(key)
    }
    releaseEntry(backend, key)
    if (backend === 'local') {
      releaseStorageListener()
    }
  }

  return storageSig
}
