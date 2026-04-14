import { signal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
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
  // Return existing signal if already registered
  const existing = getEntry<T>('local', key)
  if (existing) return existing.signal

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

  // The callable signal function (read)
  const storageSig = (() => sig()) as unknown as StorageSignal<T>

  // Delegate all signal methods
  storageSig.peek = () => sig.peek()
  storageSig.subscribe = (listener: () => void) => sig.subscribe(listener)
  storageSig.direct = (updater: () => void) => sig.direct(updater)
  storageSig.debug = () => sig.debug()

  Object.defineProperty(storageSig, 'label', {
    get: () => sig.label,
    set: (v: string | undefined) => {
      sig.label = v
    },
  })

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

  // Add remove method
  storageSig.remove = () => {
    sig.set(defaultValue)
    if (storage) {
      storage.removeItem(key)
    }
    removeEntry(backend, key)
    if (backend === 'local') {
      releaseStorageListener()
    }
  }

  return storageSig
}
