import type { StorageOptions } from './types'
import { isClient } from '@pyreon/reactivity'

// ─── SSR Detection ───────────────────────────────────────────────────────────

/**
 * Check if we're running in a browser environment.
 */
export function isBrowser(): boolean {
  return isClient
}

// ─── Serialization ───────────────────────────────────────────────────────────
//
// When `options.version` is set, the serialized inner string is wrapped in a
// tiny JSON envelope carrying the version, so a later load with a newer
// `version` can `migrate` the old shape. The envelope keys are deliberately
// obscure to make a real user value that happens to look like an envelope
// vanishingly unlikely.

const VERSION_KEY = '__pyreonStorageV'
const VALUE_KEY = '__pyreonStorageD'

interface Envelope {
  [VERSION_KEY]: number
  [VALUE_KEY]: string
}

function isEnvelope(x: unknown): x is Envelope {
  if (typeof x !== 'object' || x === null) return false
  const rec = x as Record<string, unknown>
  return typeof rec[VERSION_KEY] === 'number' && typeof rec[VALUE_KEY] === 'string'
}

/** Best-effort parse — the persisted inner passed to `migrate`. */
function looseParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

/**
 * Serialize a value to a string for storage. Honors `options.serializer`
 * (default JSON.stringify) and, when `options.version` is set, wraps the
 * result in a versioned envelope.
 */
export function serialize<T>(value: T, options?: StorageOptions<T>): string {
  const inner = options?.serializer ? options.serializer(value) : JSON.stringify(value)
  if (options?.version === undefined) return inner
  const envelope: Envelope = { [VERSION_KEY]: options.version, [VALUE_KEY]: inner }
  return JSON.stringify(envelope)
}

/**
 * Deserialize a raw string from storage back to a typed value.
 * Returns the default value if deserialization fails.
 *
 * With `options.version` set, understands the versioned envelope: on a version
 * match it deserializes normally; on a mismatch (or a legacy unversioned value,
 * treated as version `0`) it runs `options.migrate`.
 */
export function deserialize<T>(raw: string, defaultValue: T, options?: StorageOptions<T>): T {
  const deserializer = options?.deserializer
  const onError = options?.onError
  const version = options?.version
  const migrate = options?.migrate
  try {
    if (version === undefined) {
      // Unversioned — the plain fast path (unchanged behavior).
      return deserializer ? deserializer(raw) : (JSON.parse(raw) as T)
    }

    const parsed = JSON.parse(raw) as unknown
    if (isEnvelope(parsed)) {
      const storedVersion = parsed[VERSION_KEY]
      const inner = parsed[VALUE_KEY]
      if (storedVersion === version) {
        return deserializer ? deserializer(inner) : (JSON.parse(inner) as T)
      }
      // Version mismatch → migrate the OLD persisted shape.
      if (migrate) return migrate(looseParse(inner), storedVersion)
      // No migrate supplied — best-effort deserialize (may be the wrong shape).
      return deserializer ? deserializer(inner) : (JSON.parse(inner) as T)
    }

    // Not an envelope → a legacy value written before `version` was introduced.
    // Treat it as version 0 so an app that adds versioning upgrades cleanly.
    if (migrate) return migrate(parsed, 0)
    return parsed as T
  } catch (e) {
    if (onError) {
      const result = onError(e as Error)
      return result !== undefined ? result : defaultValue
    }
    return defaultValue
  }
}

// ─── Safe Storage Access ─────────────────────────────────────────────────────

/**
 * Safely get a Web Storage instance (localStorage or sessionStorage).
 * Returns null if not available (SSR, security restrictions, etc.).
 */
export function getWebStorage(type: 'local' | 'session'): Storage | null {
  /* v8 ignore next — SSR/isBrowser guard; tests run with happy-dom */
  if (!isBrowser()) return null
  try {
    const storage = type === 'local' ? window.localStorage : window.sessionStorage
    // Test that it actually works (can throw in private browsing)
    const testKey = '__pyreon_storage_test__'
    storage.setItem(testKey, '1')
    storage.removeItem(testKey)
    return storage
  } catch {
    return null
  }
}
