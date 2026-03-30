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
  /** Called when deserialization fails — returns fallback or void for default */
  onError?: (error: Error) => T | undefined
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
