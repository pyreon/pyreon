// The web half of `useDatabase`, which did not exist.
//
// PMTC lowers `useDatabase()` to `PyreonDatabase` on both native targets and it
// is device-proven (file-backed, survives relaunch). There was no web
// implementation, no export, and no type anywhere in `packages/`.
//
// That is not hypothetical: the kitchen-sink counter example — 19 passing
// XCUITests — imported `useDatabase` from `@pyreon/primitives`, which does not
// export it. PMTC matches hook NAMES and never resolves imports, and that
// example is one of four with no typechecked web sibling, so nothing caught it.
//
// The API is SYNCHRONOUS because the native one is (`get` returns
// `PyreonRecord?`, not a promise). That rules out IndexedDB, whose async API
// would force `await` into source compiling for three targets — the same
// shared-code break that made `@pyreon/form` non-shared. `localStorage` is the
// faithful analogue.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase, type PyreonRecord } from '../useDatabase'

const rec = (id: string, fields: Record<string, string> = {}): PyreonRecord => ({ id, fields })

describe('useDatabase (web)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear()
  })

  it('starts empty', () => {
    const db = useDatabase()
    expect(db.count('notes')).toBe(0)
    expect(db.all('notes')).toEqual([])
    expect(db.get('notes', 'missing')).toBeNull()
  })

  it('insert then read back — the counter\'s exact usage', () => {
    const db = useDatabase()
    db.insert('notes', rec('1', { at: 'tap' }))
    expect(db.count('notes')).toBe(1)
    expect(db.get('notes', '1')?.fields.at).toBe('tap')
  })

  it('get returns null (not undefined) for a miss — the native Optional', () => {
    // Swift returns `PyreonRecord?`; null is the honest JS mapping, and a
    // consumer checking `=== null` must not be surprised by undefined.
    expect(useDatabase().get('notes', 'nope')).toBeNull()
  })

  it('insert REPLACES by id rather than duplicating', () => {
    const db = useDatabase()
    db.insert('notes', rec('1', { v: 'first' }))
    db.insert('notes', rec('1', { v: 'second' }))
    // Two records with one id would leave `get` unable to disambiguate, and
    // diverges from the native upsert.
    expect(db.count('notes')).toBe(1)
    expect(db.get('notes', '1')?.fields.v).toBe('second')
  })

  it('delete reports whether it removed anything', () => {
    const db = useDatabase()
    db.insert('notes', rec('1'))
    expect(db.delete('notes', '1')).toBe(true)
    expect(db.delete('notes', '1')).toBe(false)
    expect(db.count('notes')).toBe(0)
  })

  it('find scans by field value', () => {
    const db = useDatabase()
    db.insert('notes', rec('1', { kind: 'a' }))
    db.insert('notes', rec('2', { kind: 'b' }))
    db.insert('notes', rec('3', { kind: 'a' }))
    expect(db.find('notes', 'kind', 'a').map((r) => r.id)).toEqual(['1', '3'])
    expect(db.find('notes', 'kind', 'zzz')).toEqual([])
  })

  it('collections are isolated', () => {
    const db = useDatabase()
    db.insert('notes', rec('1'))
    db.insert('tasks', rec('1'))
    db.delete('notes', '1')
    // A shared keyspace would make one collection's delete affect another.
    expect(db.count('notes')).toBe(0)
    expect(db.count('tasks')).toBe(1)
  })

  it('persists across handles — the point of a database', () => {
    useDatabase().insert('notes', rec('1', { at: 'tap' }))
    // A fresh handle must see it; per-handle state would make the hook a
    // glorified local variable.
    expect(useDatabase().get('notes', '1')?.fields.at).toBe('tap')
  })

  it('all() preserves insertion order', () => {
    const db = useDatabase()
    for (const id of ['c', 'a', 'b']) db.insert('notes', rec(id))
    expect(db.all('notes').map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('survives corrupt stored data instead of throwing', () => {
    // Hand-edited or foreign data under our key should cost records, not crash
    // the app during render.
    globalThis.localStorage?.setItem('pyreon:db:notes', '{not json')
    expect(() => useDatabase().all('notes')).not.toThrow()
    globalThis.localStorage?.setItem('pyreon:db:notes', '[{"nope":1},{"id":"ok","fields":{}}]')
    const kept = useDatabase().all('notes')
    expect(kept.map((r) => r.id)).toEqual(['ok'])
  })

  it('namespaces its keys', () => {
    useDatabase().insert('notes', rec('1'))
    // An unnamespaced key would collide with unrelated app storage.
    expect(globalThis.localStorage?.getItem('pyreon:db:notes')).toBeTruthy()
    expect(globalThis.localStorage?.getItem('notes')).toBeNull()
  })

  // The shared-code contract: PMTC emits these as members on the native
  // container and matches on NAME. A rename here silently breaks native.
  it('exposes the exact method names the native container uses', () => {
    const db = useDatabase()
    for (const m of ['insert', 'get', 'all', 'delete', 'find', 'count'] as const) {
      expect(typeof db[m], `missing method: ${m}`).toBe('function')
    }
  })
})

// ── Degradation ───────────────────────────────────────────────────────────
//
// Everything below was untested. The reads and writes both carry deliberate,
// commented decisions about what to do when persistence misbehaves — and those
// decisions are the ones that produce user-visible bugs when they change (a
// cleared store resurrecting deleted records, an insert vanishing before the
// next read). Each spec pins one of them.

describe('useDatabase — persistence degradation', () => {
  // Each spec uses its OWN collection. The in-memory mirror is module-scoped
  // by design (so reads and writes agree within one page), which means it also
  // outlives a test — sharing a collection name let one spec's records leak
  // into the next and made two of these fail for a reason that had nothing to
  // do with the behaviour under test.
  let n = 0
  let coll = ''
  let key = ''
  let real: Storage | undefined

  beforeEach(() => {
    real = globalThis.localStorage
    coll = `degrade-${++n}`
    key = `pyreon:db:${coll}`
    globalThis.localStorage?.clear()
  })

  afterEach(() => {
    if (real) Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true })
  })

  const swapStorage = (impl: Partial<Storage> | undefined) => {
    Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true })
  }

  it('a MISS is authoritative — a cleared store does NOT resurrect records', () => {
    // The mirror exists for when persistence is UNAVAILABLE, not when it
    // answers "no such key". Consulting it on a miss made deleted records come
    // back for the rest of the session after a user cleared site data.
    const db = useDatabase()
    db.insert(coll, rec('a'))
    expect(db.count(coll)).toBe(1)

    globalThis.localStorage?.clear()
    expect(db.all(coll)).toEqual([])
  })

  it('falls back to the in-memory mirror when localStorage is absent entirely', () => {
    swapStorage(undefined)
    const db = useDatabase()
    db.insert(coll, rec('m1'))
    // insert-then-read must agree even with no persistence at all.
    expect(db.all(coll).map((r) => r.id)).toEqual(['m1'])
  })

  it('survives a throwing getItem by reading the mirror', () => {
    const db = useDatabase()
    db.insert(coll, rec('kept'))
    swapStorage({
      getItem: () => {
        throw new Error('SecurityError: access denied')
      },
      setItem: () => {},
    })
    expect(db.all(coll).map((r) => r.id)).toEqual(['kept'])
  })

  it('returns EMPTY when getItem throws and nothing was ever mirrored', () => {
    // The sibling spec above covers a throwing store whose mirror IS populated.
    // This is the other side, and it is the FIRST read of a fresh page in a
    // context where storage access throws (Safari private mode, a blocked
    // third-party frame): the mirror has no entry for this collection, so the
    // fallback has to produce an empty list rather than `undefined` — every
    // caller does `.map` / `.length` on the result.
    swapStorage({
      getItem: () => {
        throw new Error('SecurityError: access denied')
      },
      setItem: () => {},
    })
    const db = useDatabase()
    expect(db.all(coll)).toEqual([])
    expect(db.count(coll)).toBe(0)
    expect(db.get(coll, 'anything')).toBeNull()
  })

  it('still round-trips when setItem throws (quota / private mode)', () => {
    // The write is mirrored BEFORE the persist attempt precisely so a quota
    // failure costs persistence, not the data for this page.
    swapStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    const db = useDatabase()
    expect(() => db.insert(coll, rec('q1'))).not.toThrow()
  })

  it('treats a non-array payload as empty rather than throwing', () => {
    real?.setItem(key, JSON.stringify({ not: 'an array' }))
    expect(useDatabase().all(coll)).toEqual([])
  })

  it('unparseable JSON falls back to the mirror, NOT to a hard empty', () => {
    // A parse failure means persistence is broken, which is exactly the case
    // the mirror covers — so an insert made this session must still be
    // readable. (With an untouched collection the mirror is empty and the
    // result is [], which is why this needs its own collection to be honest
    // about which branch it is pinning.)
    const db = useDatabase()
    db.insert(coll, rec('mirrored'))
    real?.setItem(key, '{ this is not json')
    expect(db.all(coll).map((r) => r.id)).toEqual(['mirrored'])
  })

  it('drops individual corrupt records instead of losing the whole collection', () => {
    // One hand-edited entry should cost one record, not crash the app on load.
    real?.setItem(key, JSON.stringify([{ id: 'ok', fields: {} }, { noId: true }, null, 'nope']))
    expect(useDatabase().all(coll).map((r) => r.id)).toEqual(['ok'])
  })
})
