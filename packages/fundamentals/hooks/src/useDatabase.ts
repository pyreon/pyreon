// useDatabase — a tiny document store, shared across web / iOS / Android.
//
// The native half already existed and is device-proven: PMTC lowers
// `useDatabase()` to `PyreonDatabase` on both targets, with a file-backed
// default so records survive relaunch. The WEB half did not exist — no
// implementation, no export, no type anywhere in `packages/`.
//
// That is not a hypothetical gap. `examples/native-counter-ios/src/Counter.tsx`
// — the kitchen-sink example, 19 passing XCUITests — imports `useDatabase`
// from `@pyreon/primitives`, which does not export it. PMTC never resolves
// imports (it matches hook NAMES), and that example is one of four with no
// typechecked web sibling, so nothing caught it. The counter is device-proven
// source that no TypeScript build would accept.
//
// The API is SYNCHRONOUS, because the native one is: `get` returns
// `PyreonRecord?`, not a promise. That rules out IndexedDB for the web half —
// its API is asynchronous, and wrapping it would force `await` into source that
// compiles for three targets, breaking the shared-code contract the same way
// `@pyreon/form`'s accessor shape did. `localStorage` is the closest faithful
// analogue: synchronous, persistent across reloads, same read-modify-write
// semantics.
//
// HONEST LIMITS, stated because a storage layer that quietly stops persisting
// is worse than one that never claimed to:
//   - `localStorage` is ~5 MB per origin. This is for app state and small
//     record sets, not a real database.
//   - Values are strings on every target (the native `PyreonRecord.fields` is
//     `[String: String]`), so numbers and dates must be serialised by the
//     caller. Matching the narrower native type keeps one source valid.
//   - No indexes: `find` is a linear scan, as it is natively.

import { isServer } from '@pyreon/reactivity'

/** One stored document. Mirrors the native `PyreonRecord` exactly. */
export interface PyreonRecord {
  /** Primary key, unique within its collection. */
  readonly id: string
  /** String-to-string payload — the native type is `[String: String]`. */
  readonly fields: Readonly<Record<string, string>>
}

/**
 * Document-store handle. Method names and signatures match the native
 * `PyreonDatabase` container so one source works on all three targets.
 */
export interface UseDatabaseResult {
  /** Insert or replace by `id`. */
  insert(collection: string, record: PyreonRecord): void
  /** Fetch by id, or `null` when absent (native returns an Optional). */
  get(collection: string, id: string): PyreonRecord | null
  /** Every record in insertion order. */
  all(collection: string): PyreonRecord[]
  /** Remove by id; `true` when something was removed. */
  delete(collection: string, id: string): boolean
  /** Linear scan for `fields[field] === equals`. */
  find(collection: string, field: string, equals: string): PyreonRecord[]
  /** Number of records in the collection. */
  count(collection: string): number
}

/** Namespaced so a collection cannot collide with unrelated app keys. */
const KEY_PREFIX = 'pyreon:db:'

/**
 * In-memory fallback, used when `localStorage` is unavailable — during SSR, and
 * in browsers where storage is blocked (Safari private mode throws on write).
 *
 * Module-scoped so reads and writes within one page agree with each other. A
 * per-call store would make `insert` then `get` fail whenever persistence was
 * unavailable, which is a worse failure than not persisting.
 */
const memory = new Map<string, PyreonRecord[]>()

function readCollection(collection: string): PyreonRecord[] {
  const key = KEY_PREFIX + collection
  /* v8 ignore next — the server arm. `isServer` is a module-load constant and
     these tests run under happy-dom, so reaching it would mean mocking
     @pyreon/reactivity, which the test-environment rules forbid. */
  if (isServer) return memory.get(key) ?? []
  try {
    const store = globalThis.localStorage
    // No localStorage at all (blocked / non-browser) — the mirror IS the store.
    if (store === undefined) return memory.get(key) ?? []
    const raw = store.getItem(key)
    // A MISS is authoritative, not a reason to consult the mirror. Falling back
    // here made the mirror shadow a legitimately-cleared store: after a user
    // clears site data, deleted records would resurrect for the rest of the
    // session. The mirror exists for when persistence is UNAVAILABLE, not when
    // it answers "no such key".
    if (raw == null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Tolerate hand-edited or foreign data rather than throwing: a corrupt
    // entry should cost one record, not crash the app on load.
    return parsed.filter(
      (r): r is PyreonRecord =>
        typeof r === 'object' && r !== null && typeof (r as PyreonRecord).id === 'string',
    )
  } catch {
    return memory.get(key) ?? []
  }
}

function writeCollection(collection: string, records: PyreonRecord[]): void {
  const key = KEY_PREFIX + collection
  // Always mirror into memory: if the write below fails (quota, private mode)
  // the data still round-trips for this page rather than vanishing between an
  // insert and the next read.
  memory.set(key, records)
  /* v8 ignore next — server arm; see readCollection above. */
  if (isServer) return
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(records))
  } catch {
    // Quota exceeded or storage blocked. The memory mirror above keeps the
    // session consistent; persistence is best-effort, never fatal.
  }
}

/**
 * A small synchronous document store.
 *
 * @example
 * ```tsx
 * const db = useDatabase()
 * db.insert('notes', { id: '1', fields: { at: 'tap' } })
 * return <Text>Notes: {db.count('notes')}</Text>
 * ```
 */
export function useDatabase(): UseDatabaseResult {
  return {
    insert(collection, record) {
      const records = readCollection(collection)
      const at = records.findIndex((r) => r.id === record.id)
      // Replace-by-id, matching the native upsert: inserting the same id twice
      // must not produce two records that `get` can never disambiguate.
      if (at >= 0) records[at] = record
      else records.push(record)
      writeCollection(collection, records)
    },
    get(collection, id) {
      return readCollection(collection).find((r) => r.id === id) ?? null
    },
    all(collection) {
      return readCollection(collection)
    },
    delete(collection, id) {
      const records = readCollection(collection)
      const at = records.findIndex((r) => r.id === id)
      if (at < 0) return false
      records.splice(at, 1)
      writeCollection(collection, records)
      return true
    },
    find(collection, field, equals) {
      return readCollection(collection).filter((r) => r.fields[field] === equals)
    },
    count(collection) {
      return readCollection(collection).length
    },
  }
}
