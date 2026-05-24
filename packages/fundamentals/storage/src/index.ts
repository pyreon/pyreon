/**
 * @pyreon/storage — Reactive client-side storage for Pyreon.
 *
 * Signal-backed persistence across localStorage, sessionStorage, cookies,
 * IndexedDB, and custom backends. Every stored value is a reactive signal
 * that persists writes automatically.
 *
 * @example
 * ```ts
 * import { useStorage, useCookie, useIndexedDB } from '@pyreon/storage'
 *
 * // localStorage — persistent, cross-tab synced
 * const theme = useStorage('theme', 'light')
 * theme()            // read reactively
 * theme.set('dark')  // updates signal + localStorage
 *
 * // Cookie — SSR-readable, configurable expiry
 * const locale = useCookie('locale', 'en', { maxAge: 365 * 86400 })
 *
 * // IndexedDB — large data, debounced writes
 * const draft = useIndexedDB('article-draft', { title: '', body: '' })
 * ```
 */

import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/storage
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/storage', '0.24.6', import.meta.url)

// ─── Hooks ───────────────────────────────────────────────────────────────────

export { setCookieSource, useCookie } from './cookie'
export { createStorage, useMemoryStorage } from './custom'
export { useIndexedDB } from './indexed-db'
export { useStorage } from './local'
export { useSessionStorage } from './session'

// ─── Utilities ───────────────────────────────────────────────────────────────

export { clearStorage, removeStorage } from './clear'

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  AsyncStorageBackend,
  CookieOptions,
  IndexedDBOptions,
  StorageBackend,
  StorageOptions,
  StorageSignal,
} from './types'

// ─── Testing ─────────────────────────────────────────────────────────────────

export { _resetDBCache } from './indexed-db'
export { _resetStorageListener } from './local'
export { _resetRegistry } from './registry'
