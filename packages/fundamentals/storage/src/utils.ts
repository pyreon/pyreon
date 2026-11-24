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
 * Returns null only when the storage cannot be READ (SSR, a sandboxed
 * document, storage disabled by policy).
 *
 * Availability is probed with a READ, never a write. A full storage (every
 * `setItem` throws `QuotaExceededError`, Safari's legacy private mode, a
 * per-origin quota of 0) still holds its data and still answers `getItem`, so
 * it must stay available for reads. The old write probe treated it as absent:
 * `useStorage` returned the default instead of the stored value, and `.set()`
 * / `.remove()` became silent no-ops (#4812). Write failures are reported by
 * each write site through `onError`; they never change what reads return.
 */
export function getWebStorage(type: 'local' | 'session'): Storage | null {
  /* v8 ignore next — SSR/isBrowser guard; tests run with happy-dom */
  if (!isBrowser()) return null
  try {
    const storage = type === 'local' ? window.localStorage : window.sessionStorage
    // The accessor itself throws `SecurityError` where storage is blocked;
    // `getItem` throws where the object exists but access is denied.
    storage.getItem('__pyreon_storage_test__')
    return storage
  } catch {
    return null
  }
}

/** Normalise whatever a storage API threw into an `Error` for `onError`. */
export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

type ErrorChannel = { onError?: ((error: Error) => unknown) | undefined } | undefined

/** A rejection handler that reports to `onError` (a notification; its return is ignored). */
export const reportTo =
  (options: ErrorChannel) =>
  (e: unknown): void => {
    options?.onError?.(toError(e))
  }

/**
 * Run one storage write or remove. A throw (quota, blocked storage, a refused
 * cookie) never escapes `.set()` / `.remove()` after the signal moved: it is
 * reported to `onError`, the same way for every backend (#4812).
 */
export function attempt(options: ErrorChannel, op: () => void): void {
  try {
    op()
  } catch (e) {
    reportTo(options)(e)
  }
}
