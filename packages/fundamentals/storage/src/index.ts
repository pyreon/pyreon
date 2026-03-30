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
export { _resetRegistry } from './registry'
