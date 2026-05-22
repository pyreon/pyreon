import { defineCrossModuleState, signal } from '@pyreon/reactivity'
import { getEntry, releaseEntry, retainEntry, setEntry } from './registry'
import type { StorageOptions, StorageSignal } from './types'
import { deserialize, getWebStorage, isBrowser, serialize } from './utils'
import { wrapBaseSignal } from './wrap-base-signal'

// ─── Cross-tab sync ──────────────────────────────────────────────────────────

// Refcount the active localStorage signals so we can detach the `storage`
// event listener when nothing subscribes anymore. Before the refcount, the
// listener was attached on first `useStorage` and NEVER removed, leaking a
// window-level handler across the lifetime of the page even after all
// signals disposed via `.remove()`.
//
// Hosted on globalThis so duplicate `@pyreon/storage` instances share ONE
// listener + ONE refcount — without this, two instances each install
// their own `storage` event listener (handler pile-up) AND maintain
// separate refcounts (listener detaches before all subscribers release).
interface CrossTabState {
  activeCount: number
  storageHandler: ((e: StorageEvent) => void) | null
}
const _crossTabState = defineCrossModuleState<CrossTabState>(
  'pyreon-storage/cross-tab-state',
  () => ({ activeCount: 0, storageHandler: null }),
)

function onStorageEvent(e: StorageEvent): void {
  if (!e.key) return
  const entry = getEntry('local', e.key)
  if (!entry) return

  const newValue =
    e.newValue !== null ? deserialize(e.newValue, entry.defaultValue) : entry.defaultValue

  entry.signal.set(newValue)
}

function retainStorageListener(): void {
  if (!isBrowser()) return
  _crossTabState.activeCount++
  if (_crossTabState.storageHandler === null) {
    _crossTabState.storageHandler = onStorageEvent
    window.addEventListener('storage', _crossTabState.storageHandler)
  }
}

/**
 * Test-only: force-detach the cross-tab listener and reset the refcount.
 * Used in test teardown to keep `_resetRegistry` and listener state in sync.
 */
export function _resetStorageListener(): void {
  if (_crossTabState.storageHandler !== null && isBrowser()) {
    window.removeEventListener('storage', _crossTabState.storageHandler)
  }
  _crossTabState.storageHandler = null
  _crossTabState.activeCount = 0
}

/**
 * Release one refcount on the cross-tab listener. Detaches the window-level
 * handler when the count drops to zero. Called from `.remove()`.
 */
export function releaseStorageListener(): void {
  if (!isBrowser()) return
  if (_crossTabState.activeCount === 0) return
  _crossTabState.activeCount--
  if (_crossTabState.activeCount === 0 && _crossTabState.storageHandler !== null) {
    window.removeEventListener('storage', _crossTabState.storageHandler)
    _crossTabState.storageHandler = null
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

  // Shared base wrapper — callable + `.peek` / `.subscribe` / `.direct` /
  // `.debug` / `.label` / forwarded `_v`. See `wrap-base-signal.ts` for
  // the full contract (including why `_v` forwarding is load-bearing for
  // the compiler-emitted `_bindText` fast path).
  const storageSig = wrapBaseSignal(sig) as unknown as StorageSignal<T>

  // Override set to persist
  storageSig.set = (value: T) => {
    sig.set(value)
    if (storage) {
      try {
        storage.setItem(key, serialize(value, options?.serializer))
      } catch {
        // Storage full or blocked — signal still updates
      }
    }
  }

  // Override update to persist
  storageSig.update = (fn: (current: T) => T) => {
    const newValue = fn(sig.peek())
    storageSig.set(newValue)
  }

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
