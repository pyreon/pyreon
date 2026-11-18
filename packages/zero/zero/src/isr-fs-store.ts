import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ISRCacheEntry, ISRStore } from './isr'

// Server-only: exported from `@pyreon/zero/server`, never from the edge entry
// or the client-safe main entry (`node:*` imports).

/** File-name suffixes. `+` and `=` never appear raw in `encodeURIComponent`
 * output, so no entry name can end in a sidecar suffix or look hashed. */
const ENTRY_SUFFIX = '.json'
const TAGS_SUFFIX = '+tags.json'
const TMP_SUFFIX = '.tmp'
const HASHED_PREFIX = '='
/** The single tag index older versions kept; migrated and removed at start. */
const LEGACY_TAGS_FILE = '_tags.json'
/** Longest readable name; leaves room for the suffixes under the usual
 * 255-byte file-name limit. */
const MAX_READABLE_NAME = 180

interface TagRecord {
  key: string
  tags: string[]
}

// Test-only probe (leak lock): what an fs store indexes in memory. WeakMap
// keyed by the store, so the probe never keeps a store alive.
const _fsIndexProbes = new WeakMap<object, () => { entries: number; tags: number }>()

/** @internal Test-only: entries and distinct tags a `createFsStore` store indexes. */
export function _isrFsIndexStats(store: ISRStore<unknown>): { entries: number; tags: number } {
  return _fsIndexProbes.get(store)?.() ?? { entries: -1, tags: -1 }
}

/**
 * The file name (without suffix) for a cache key. A short key whose encoding
 * has no upper-case letters keeps a readable name, as earlier versions did.
 * Any other key gets a SHA-256 name: a long key (a long query string would
 * otherwise fail with ENAMETOOLONG and silently never cache), and a key with
 * upper-case letters (on a case-insensitive file system, `/About` and `/about`
 * would otherwise share one file and serve each other's page).
 */
function nameFor(key: string): string {
  const encoded = encodeURIComponent(key).replace(/\*/g, '%2A')
  // `encodeURIComponent` emits upper-case hex in escapes; only a LITERAL
  // upper-case letter in the key makes the name case-sensitive.
  const caseSensitive = /[A-Z]/.test(key)
  if (encoded.length <= MAX_READABLE_NAME && !caseSensitive && encoded !== '_tags') return encoded
  return HASHED_PREFIX + createHash('sha256').update(key).digest('hex')
}

/**
 * Filesystem-backed ISR store for self-hosted node/bun deploys. The memory
 * default means every server restart is a cold cache and a thundering herd on
 * the origin; a content-dir store survives restarts.
 *
 * **Bounded.** At most `maxEntries` entries (default `1000`, the same as
 * `createMemoryStore`) are kept on disk. Past the cap, the least recently
 * written or read entry is evicted: its file AND its tags. The cap holds
 * across restarts — a new store counts the entries already in `dir` (oldest
 * by modification time first) and trims the directory to the cap before its
 * first operation. Recency from reads is kept in memory only, so after a
 * restart the order is by last write.
 *
 * **Layout.** One JSON file per entry, plus — for a tagged entry — a small
 * `+tags.json` sidecar holding the key and its tags. A tagged cache miss
 * therefore writes O(1) bytes, never a shared index of every key. `delete`,
 * eviction and tag invalidation remove both files. Every write goes to a
 * temporary file that is then renamed over the target, so a crash mid-write
 * never leaves a torn entry; leftover temporary files are removed at start.
 * A `_tags.json` index written by an earlier version is migrated into
 * sidecars and removed.
 *
 * **Ordering.** All writes and removals for one key run in call order, so
 * concurrent `set`s of one key leave the last value and a `delete` issued
 * after a `set` wins. `clear()` waits for the writes issued before it.
 *
 * Every fs error degrades to cache-miss behaviour, never a throw on the
 * request path. The in-memory index and the cap are per process: processes
 * sharing one `dir` each adopt an entry they read from disk, but a tag
 * recorded by another process is only seen after a restart. Multi-instance
 * deploys want a shared external store (Redis/KV).
 */
export function createFsStore<E = ISRCacheEntry>(
  dir: string,
  opts: { maxEntries?: number } = {},
): ISRStore<E> {
  const maxEntries = Math.max(1, opts.maxEntries ?? 1000)
  const entryPath = (name: string) => join(dir, name + ENTRY_SUFFIX)
  const tagsPath = (name: string) => join(dir, name + TAGS_SUFFIX)

  // In-memory index, rebuilt from disk at start. `entries` is in recency
  // order (oldest first). Tags: name → record, and tag → names.
  const entries = new Set<string>()
  const tagsOf = new Map<string, TagRecord>()
  const byTag = new Map<string, Set<string>>()

  const index = (name: string, record: TagRecord): void => {
    tagsOf.set(name, record)
    for (const tag of record.tags) {
      let names = byTag.get(tag)
      if (!names) {
        names = new Set()
        byTag.set(tag, names)
      }
      names.add(name)
    }
  }
  const unindex = (name: string): void => {
    const record = tagsOf.get(name)
    if (!record) return
    tagsOf.delete(name)
    for (const tag of record.tags) {
      const names = byTag.get(tag)
      if (!names) continue
      names.delete(name)
      if (names.size === 0) byTag.delete(tag)
    }
  }

  // Per-key lanes: fs mutations for one name run in call order. A lane is
  // dropped by identity once its last operation settles, so the map holds
  // only names with work in flight.
  const lanes = new Map<string, Promise<void>>()
  const enqueue = (name: string, op: () => Promise<void>): Promise<void> => {
    const next = (lanes.get(name) ?? Promise.resolve()).then(op).catch(() => {
      // Best-effort: a failed write is a miss next time; a failed removal
      // leaves a file the next start counts against the cap.
    })
    lanes.set(name, next)
    void next.then(() => {
      if (lanes.get(name) === next) lanes.delete(name)
    })
    return next
  }

  let tmpSeq = 0
  const writeAtomic = async (path: string, data: string): Promise<void> => {
    const tmp = `${path}.${process.pid}-${tmpSeq++}${TMP_SUFFIX}`
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(tmp, data, 'utf-8')
      await rename(tmp, path)
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {})
      throw err
    }
  }
  const removeFiles = (name: string): Promise<void> =>
    enqueue(name, async () => {
      await Promise.all([rm(entryPath(name), { force: true }), rm(tagsPath(name), { force: true })])
    })

  // Evict oldest-first past the cap: the entry file AND its tags. Returns
  // the removals so the caller can wait for the disk to match the index.
  const evictOverflow = (): Promise<void>[] => {
    const removals: Promise<void>[] = []
    while (entries.size > maxEntries) {
      const oldest = entries.values().next().value as string
      entries.delete(oldest)
      unindex(oldest)
      removals.push(removeFiles(oldest))
    }

    return removals
  }
  // Mark `name` most recent, then enforce the cap.
  const touch = (name: string): Promise<void>[] => {
    entries.delete(name)
    entries.add(name)
    return evictOverflow()
  }

  const loadTagRecord = async (file: string): Promise<TagRecord | null> => {
    try {
      const raw = JSON.parse(await readFile(file, 'utf-8')) as Partial<TagRecord>
      if (typeof raw.key !== 'string' || !Array.isArray(raw.tags)) return null
      const tags = raw.tags.filter((t): t is string => typeof t === 'string')
      return { key: raw.key, tags: [...new Set(tags)] }
    } catch {
      return null
    }
  }

  const migrateLegacyIndex = async (): Promise<void> => {
    const file = join(dir, LEGACY_TAGS_FILE)
    const tagsByKey = new Map<string, string[]>()
    try {
      const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
      for (const [tag, keys] of Object.entries(raw)) {
        if (!Array.isArray(keys)) continue
        for (const key of keys) {
          if (typeof key !== 'string') continue
          const own = tagsByKey.get(key) ?? []
          own.push(tag)
          tagsByKey.set(key, own)
        }
      }
    } catch {
      // Unreadable: nothing to migrate.
    }
    const writes: Promise<void>[] = []
    for (const [key, tags] of tagsByKey) {
      const name = nameFor(key)
      // Only keys still cached, and a sidecar already on disk wins.
      if (!entries.has(name) || tagsOf.has(name)) continue
      const record = { key, tags: [...new Set(tags)] }
      index(name, record)
      writes.push(enqueue(name, () => writeAtomic(tagsPath(name), JSON.stringify(record))))
    }
    await Promise.all(writes)
    await rm(file, { force: true }).catch(() => {})
  }

  const init = async (): Promise<void> => {
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return // No directory yet: an empty cache.
    }
    const found: { name: string; mtime: number }[] = []
    const sidecars: string[] = []
    let legacy = false
    for (const file of files) {
      const path = join(dir, file)
      if (file.endsWith(TMP_SUFFIX)) {
        // A write torn by a crash: never renamed into place, never served.
        await rm(path, { force: true }).catch(() => {})
      } else if (file === LEGACY_TAGS_FILE) {
        legacy = true
      } else if (file.endsWith(TAGS_SUFFIX)) {
        sidecars.push(file.slice(0, -TAGS_SUFFIX.length))
      } else if (file.endsWith(ENTRY_SUFFIX)) {
        const info = await stat(path).catch(() => null)
        if (info?.isFile()) found.push({ name: file.slice(0, -ENTRY_SUFFIX.length), mtime: info.mtimeMs })
      }
    }
    found.sort((a, b) => a.mtime - b.mtime || (a.name < b.name ? -1 : 1))
    for (const { name } of found) entries.add(name)
    for (const name of sidecars) {
      const record = entries.has(name) ? await loadTagRecord(tagsPath(name)) : null
      if (record && record.tags.length > 0) index(name, record)
      else await rm(tagsPath(name), { force: true }).catch(() => {})
    }
    if (legacy) await migrateLegacyIndex()
    // Trim a directory left over the cap (an earlier version, a lowered cap).
    await Promise.all(evictOverflow())
  }

  // Every operation waits for `barrier`: the start-up scan, then any
  // `clear()` in progress.
  let barrier: Promise<void> | null = null
  const ready = (): Promise<void> => (barrier ??= init())

  const store: ISRStore<E> = {
    async get(key) {
      await ready()
      const name = nameFor(key)
      try {
        const value = JSON.parse(await readFile(entryPath(name), 'utf-8')) as E
        // A hit refreshes recency. A file this process did not index (another
        // process sharing `dir` wrote it) is adopted and counted.
        await Promise.all(touch(name))
        return value
      } catch {
        return undefined
      }
    },
    async set(key, entry) {
      await ready()
      const name = nameFor(key)
      const removals = touch(name)
      const data = JSON.stringify(entry)
      await Promise.all([enqueue(name, () => writeAtomic(entryPath(name), data)), ...removals])
    },
    async delete(key) {
      await ready()
      const name = nameFor(key)
      entries.delete(name)
      unindex(name)
      await removeFiles(name)
    },
    async clear() {
      const previous = ready()
      barrier = (async () => {
        await previous
        // Writes issued before the clear land first, then everything goes.
        await Promise.all(lanes.values())
        entries.clear()
        tagsOf.clear()
        byTag.clear()
        let files: string[] = []
        try {
          files = await readdir(dir)
        } catch {
          return
        }
        await Promise.all(
          files
            .filter(
              (f) =>
                f.endsWith(ENTRY_SUFFIX) || f.endsWith(TMP_SUFFIX) || f === LEGACY_TAGS_FILE,
            )
            .map((f) => rm(join(dir, f), { force: true }).catch(() => {})),
        )
      })()
      await barrier
    },
    async setTags(key, tags) {
      await ready()
      const name = nameFor(key)
      const own = [...new Set(tags)]
      const previous = tagsOf.get(name)
      // Tags belong to the CACHED entry, as in the memory store.
      const cached = entries.has(name)
      if (
        cached
        && previous
        && previous.key === key
        && previous.tags.length === own.length
        && own.every((t) => previous.tags.includes(t))
      ) {
        return // Unchanged: no write.
      }
      unindex(name)
      if (!cached || own.length === 0) {
        if (previous) await enqueue(name, () => rm(tagsPath(name), { force: true }))
        return
      }
      const record = { key, tags: own }
      index(name, record)
      const data = JSON.stringify(record)
      await enqueue(name, () => writeAtomic(tagsPath(name), data))
    },
    async keysByTag(tag) {
      await ready()
      const names = byTag.get(tag)
      if (!names) return []
      const keys: string[] = []
      for (const name of names) {
        const record = tagsOf.get(name)
        if (record && entries.has(name)) keys.push(record.key)
      }

      return keys
    },
  }
  _fsIndexProbes.set(store, () => ({ entries: entries.size, tags: byTag.size }))

  return store
}
