import { signal, wrapSignal } from '@pyreon/reactivity'
import {
  getEntriesByBackend,
  getEntry,
  type RegistryEntry,
  releaseWithOwner,
  retainEntry,
  setEntry,
  warnIfOptionsDiffer,
} from './registry'
import type { StorageOptions, StorageSignal } from './types'
import { attempt, deserialize, getWebStorage, isBrowser, serialize } from './utils'

// ─── Cross-tab sync ──────────────────────────────────────────────────────────

// Refcount the live `useStorage` consumers so we can detach the `storage`
// event listener when nothing subscribes anymore. Each `useStorage` call
// retains; its owner scope's disposal releases (`releaseWithOwner`). Before the
// refcount, the listener was attached on first `useStorage` and NEVER removed,
// leaking a window-level handler for the lifetime of the page.
let activeCount = 0
let storageHandler: ((e: StorageEvent) => void) | null = null

function onStorageEvent(e: StorageEvent): void {
  /* v8 ignore next — only ever attached in a browser (retainStorageListener) */
  if (!isBrowser()) return
  // Only localStorage events concern `useStorage`. A same-origin
  // sessionStorage event (iframes of the same tab) must not be routed into
  // local signals just because it shares a key.
  // (Read `window.localStorage` directly: the event already proves storage is
  // available, so there is nothing to probe.)
  if (e.storageArea != null && e.storageArea !== window.localStorage) return

  // `key === null` is `localStorage.clear()` in another tab. Every value this
  // tab holds for a local key is now gone from storage, so every local signal
  // resets — ignoring it left e.g. an auth token alive in memory after another
  // tab logged out by clearing storage.
  if (e.key === null) {
    for (const entry of getEntriesByBackend('local')) {
      applyInbound(entry, entry.defaultValue)
    }
    return
  }

  const entry = getEntry('local', e.key)
  if (!entry) return

  const newValue =
    e.newValue !== null
      ? deserialize(e.newValue, entry.defaultValue, entry.options)
      : entry.defaultValue

  applyInbound(entry, newValue)
}

// Apply a value the other tab ALREADY persisted. Never through `entry.signal.set`
// — that is the persisting wrapper, and writing an inbound value back undoes a
// removal made in the other tab (the default gets re-written) and makes two tabs
// on different `version`s re-serialize each other's value forever.
function applyInbound(entry: RegistryEntry, value: unknown): void {
  /* v8 ignore next — every local entry registers `applyExternal` (createStorageSignal) */
  if (entry.applyExternal) entry.applyExternal(value)
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
  _resetUnloadFlush()
}

/**
 * Release one refcount on the cross-tab listener. Detaches the window-level
 * handler when the count drops to zero. Runs when a `useStorage` consumer's
 * owner scope is disposed (never from `.remove()`, which keeps the binding).
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

// ─── Debounced-write flush-on-unload ─────────────────────────────────────────
//
// When `writeDebounceMs` is set, a `.set` schedules the persist write instead
// of doing it synchronously. To guarantee the last value isn't lost on an
// abrupt tab close, every signal with a PENDING write registers its flush here
// and ONE shared `pagehide`/`beforeunload` listener flushes them all. A single
// idempotent listener (not one per signal) avoids the event-listener pile-up
// leak class — `pagehide` covers the mobile bfcache case `beforeunload` misses.
const pendingFlushes = new Set<() => unknown>()
let unloadListenerAttached = false

function flushAllPending(): void {
  // Copy first — each flush deletes itself from the set.
  for (const flush of [...pendingFlushes]) flush()
}

function ensureUnloadFlush(): void {
  /* v8 ignore next — SSR guard */
  if (unloadListenerAttached || !isBrowser()) return
  unloadListenerAttached = true
  window.addEventListener('pagehide', flushAllPending)
  window.addEventListener('beforeunload', flushAllPending)
}

/**
 * Register a flush to run on `pagehide`/`beforeunload`. Shared with
 * `useIndexedDB`, whose debounced writes need the same last-value guarantee.
 */
export function registerPendingFlush(flush: () => unknown): void {
  pendingFlushes.add(flush)
  ensureUnloadFlush()
}

export function unregisterPendingFlush(flush: () => unknown): void {
  pendingFlushes.delete(flush)
}

/** Test-only: detach the unload-flush listeners + drop pending writes. */
export function _resetUnloadFlush(): void {
  if (unloadListenerAttached && isBrowser()) {
    window.removeEventListener('pagehide', flushAllPending)
    window.removeEventListener('beforeunload', flushAllPending)
  }
  pendingFlushes.clear()
  unloadListenerAttached = false
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
 * theme.remove()     // clears storage, resets to default; theme stays bound
 * ```
 *
 * The binding lives as long as the calling owner scope (the component): when
 * the last consumer of `key` is disposed, the registry entry and its share of
 * the cross-tab listener are released. Called outside any scope, it lives for
 * the page.
 */
export function useStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions<T>,
): StorageSignal<T> {
  // Every call holds one refcount on the per-key registry entry AND on the
  // cross-tab listener, and releases both when its owner scope is disposed.
  // `.remove()` releases neither: it deletes the value, the binding stays (#4381).
  const existing = getEntry<T>('local', key)
  if (existing) {
    warnIfOptionsDiffer('local', key, existing, defaultValue, options)
    retainEntry('local', key)
    retainStorageListener()
    releaseWithOwner('local', key, releaseStorageListener)
    return existing.signal
  }

  const storage = getWebStorage('local')

  // Read initial value from storage
  let initialValue = defaultValue
  /* v8 ignore next — defensive null storage guard */
  if (storage) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      initialValue = deserialize(raw, defaultValue, options)
    }
  }

  const sig = signal<T>(initialValue)

  // Create the storage signal by extending the base signal
  const storageSig = createStorageSignal(sig, key, defaultValue, 'local', options)
  retainStorageListener()
  releaseWithOwner('local', key, releaseStorageListener)

  return storageSig
}

// ─── Storage Signal Factory ──────────────────────────────────────────────────

/**
 * Wraps a base signal with storage persistence behavior and registers it.
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

  // Persist the value NOW (synchronous serialize + setItem).
  const writeNow = (value: T): void => {
    /* v8 ignore next — defensive null storage guard */
    if (!storage) return
    // Storage full or blocked — the signal still updates and the previously
    // stored value stays in storage (reads keep returning it on the next
    // load); the failure reaches `onError` so quota problems aren't silent.
    attempt(options, () => storage.setItem(key, serialize(value, options)))
  }

  // Opt-in write coalescing (localStorage/sessionStorage). The signal updates
  // synchronously regardless; only the persist write is debounced so a
  // high-frequency setter doesn't pay synchronous main-thread I/O per `.set`.
  const debounceMs = options?.writeDebounceMs ?? 0
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let pendingValue: T = defaultValue
  let hasPending = false

  // Flush a pending debounced write immediately (timer fire, unload, or remove).
  const flush = (): void => {
    // Defensive guards: flush is only ever enqueued alongside a live timer +
    // pending write (scheduled together in scheduleWrite, torn down together
    // here / in cancelPending), so the false/return sides are never reached.
    /* v8 ignore next 4 */
    if (writeTimer !== null) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    /* v8 ignore next */
    if (!hasPending) return
    hasPending = false
    pendingFlushes.delete(flush)
    writeNow(pendingValue)
  }

  const scheduleWrite = (value: T): void => {
    pendingValue = value
    hasPending = true
    pendingFlushes.add(flush)
    ensureUnloadFlush()
    if (writeTimer !== null) clearTimeout(writeTimer)
    writeTimer = setTimeout(flush, debounceMs)
  }

  // Cancel a pending debounced write WITHOUT persisting (used by `.remove()`,
  // which clears storage anyway — flushing first would re-create the entry).
  const cancelPending = (): void => {
    if (writeTimer !== null) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    hasPending = false
    pendingFlushes.delete(flush)
  }

  // `wrapSignal` (from @pyreon/reactivity) delegates reads (incl. `.direct` +
  // `_v` for the compiler's `_bindText` fast path) to the SHARED base `sig` and
  // routes writes through our persist function; `.update` defaults to
  // `set(fn(peek()))`. Each call returns a distinct facade, so per-consumer
  // `.remove()` refcounting works over the shared base.
  const storageSig = wrapSignal(sig, {
    set: (value: T) => {
      sig.set(value)
      if (debounceMs > 0) scheduleWrite(value)
      else writeNow(value)
    },
  }) as unknown as StorageSignal<T>

  // `.remove()` deletes the stored value and resets the shared signal to its
  // default. It does NOT end the binding (#4381): the registry entry and the
  // cross-tab listener stay, so a later `.set()` persists again and another
  // tab's write still arrives. Releasing them here used to leave every consumer
  // that kept using the key holding a dead signal. The binding is released on
  // its lifecycle path instead: the owner scope's disposal (`releaseWithOwner`).
  storageSig.remove = () => {
    cancelPending()
    sig.set(defaultValue)
    /* v8 ignore next — defensive null storage guard */
    if (!storage) return
    attempt(options, () => storage.removeItem(key))
  }

  // Inbound cross-tab value: update the shared base signal only, and drop any
  // pending debounced write — that write holds a value OLDER than the one the
  // other tab just persisted, and flushing it would clobber the newer one.
  const applyExternal = (value: T): void => {
    cancelPending()
    sig.set(value)
  }

  setEntry(backend, key, storageSig, defaultValue, options, applyExternal)

  return storageSig
}
