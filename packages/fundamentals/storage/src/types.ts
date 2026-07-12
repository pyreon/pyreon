import type { Signal } from '@pyreon/reactivity'

// ─── Storage Signal ──────────────────────────────────────────────────────────

/**
 * A signal backed by a storage backend. Behaves like a normal signal
 * but persists writes to the underlying storage mechanism.
 */
export interface StorageSignal<T> extends Signal<T> {
  /** Remove the value from storage and reset to the default value */
  remove(): void
}

// ─── Shared Options ──────────────────────────────────────────────────────────

/**
 * Base options shared by all storage hooks.
 */
export interface StorageOptions<T> {
  /** Custom serializer — default: JSON.stringify */
  serializer?: (value: T) => string
  /** Custom deserializer — default: JSON.parse */
  deserializer?: (raw: string) => T
  /**
   * Called on a storage FAILURE. Two failure modes reach it:
   *
   * - **Deserialization failure** (the stored string is corrupt / not the
   *   expected shape) — return a fallback value to use instead, or `undefined`
   *   (or nothing) to fall back to `defaultValue`.
   * - **Write failure** (`setItem` threw — quota exceeded, private-browsing
   *   block, disabled storage) — the signal has already updated in memory; the
   *   return value is IGNORED (this is a notification so you can surface the
   *   quota error to the user). The old silent-swallow behavior is preserved
   *   when no `onError` is supplied.
   */
  onError?: (error: Error) => T | undefined
  /**
   * Persisted-schema version. When set, the value is stored inside a small
   * JSON envelope carrying this version number, so a later load with a HIGHER
   * `version` can transform the old shape via `migrate`. Omit for unversioned
   * storage (the default — a plain serialized value, no envelope).
   *
   * @example
   * // v1 shipped { name: string }; v2 splits it into first/last:
   * useStorage('profile', { first: '', last: '' }, {
   *   version: 2,
   *   migrate: (old, from) =>
   *     from < 2 && old && typeof old === 'object' && 'name' in old
   *       ? { first: String((old as { name: string }).name).split(' ')[0] ?? '', last: '' }
   *       : (old as { first: string; last: string }),
   * })
   */
  version?: number
  /**
   * Transform a persisted value written under an OLDER `version` into the
   * current shape. Called with the old persisted value and the version it was
   * stored under (a value with no envelope — written before versioning was
   * added — is treated as version `0`). Returns the migrated value; it is used
   * as-is (NOT re-run through `deserializer`). Only consulted when a `version`
   * mismatch is detected on read.
   */
  migrate?: (persisted: unknown, fromVersion: number) => T
  /**
   * Debounce the persistence WRITE by this many ms (localStorage /
   * sessionStorage only). The signal still updates SYNCHRONOUSLY on every
   * `.set` (the UI stays reactive); only the synchronous `JSON.stringify` +
   * `setItem` is coalesced, so a high-frequency setter (e.g. a draft persisted
   * on every keystroke) doesn't block the main thread per write. The latest
   * value wins, and a pending write is flushed on `pagehide`/`beforeunload`
   * so the last value is never lost on tab close. Omit (or `0`) for the
   * default synchronous write. Has no effect on cookie / IndexedDB / memory
   * backends.
   */
  writeDebounceMs?: number
}

// ─── Cookie Options ──────────────────────────────────────────────────────────

/**
 * Options for the useCookie hook.
 */
export interface CookieOptions<T> extends StorageOptions<T> {
  /** Max age in seconds */
  maxAge?: number
  /** Expiry date (alternative to maxAge) */
  expires?: Date
  /** Cookie path — default: '/' */
  path?: string
  /** Cookie domain */
  domain?: string
  /** HTTPS only — default: false */
  secure?: boolean
  /** SameSite policy — default: 'lax' */
  sameSite?: 'strict' | 'lax' | 'none'
}

// ─── IndexedDB Options ───────────────────────────────────────────────────────

/**
 * Options for the useIndexedDB hook.
 */
export interface IndexedDBOptions<T> extends StorageOptions<T> {
  /** Database name — default: 'pyreon-storage' */
  dbName?: string
  /** Object store name — default: 'kv' */
  storeName?: string
  /** Write debounce in ms — default: 100 */
  debounceMs?: number
}

// ─── Custom Storage Backend ──────────────────────────────────────────────────

/**
 * Interface for a custom storage backend used with createStorage.
 */
export interface StorageBackend {
  /** Read a raw string value by key. Return null if not found. */
  get(key: string): string | null
  /** Write a raw string value by key */
  set(key: string, value: string): void
  /** Remove a value by key */
  remove(key: string): void
}

/**
 * Async variant for backends like IndexedDB.
 */
export interface AsyncStorageBackend {
  /** Read a raw string value by key */
  get(key: string): Promise<string | null>
  /** Write a raw string value by key */
  set(key: string, value: string): Promise<void>
  /** Remove a value by key */
  remove(key: string): Promise<void>
}
