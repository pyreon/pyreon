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
  const store = new FsStore<E>(dir, Math.max(1, opts.maxEntries ?? 1000))
  _fsIndexProbes.set(store, () => store.stats())

  return store
}

/** The in-memory view of the directory: entries in recency order (oldest
 * first), and the tags of each tagged entry both ways. */
class FsIndex {
  readonly entries = new Set<string>()
  private readonly tagsOf = new Map<string, TagRecord>()
  private readonly byTag = new Map<string, Set<string>>()

  tagsFor(name: string): TagRecord | undefined {
    return this.tagsOf.get(name)
  }

  tag(name: string, record: TagRecord): void {
    this.untag(name)
    this.tagsOf.set(name, record)
    for (const tag of record.tags) {
      let names = this.byTag.get(tag)
      if (!names) {
        names = new Set()
        this.byTag.set(tag, names)
      }
      names.add(name)
    }
  }

  untag(name: string): void {
    const record = this.tagsOf.get(name)
    if (!record) return
    this.tagsOf.delete(name)
    for (const tag of record.tags) {
      const names = this.byTag.get(tag)
      if (!names) continue
      names.delete(name)
      if (names.size === 0) this.byTag.delete(tag)
    }
  }

  forget(name: string): void {
    this.entries.delete(name)
    this.untag(name)
  }

  keysByTag(tag: string): string[] {
    const keys: string[] = []
    for (const name of this.byTag.get(tag) ?? []) {
      const record = this.tagsOf.get(name)
      if (record && this.entries.has(name)) keys.push(record.key)
    }

    return keys
  }

  clear(): void {
    this.entries.clear()
    this.tagsOf.clear()
    this.byTag.clear()
  }

  stats(): { entries: number; tags: number } {
    return { entries: this.entries.size, tags: this.byTag.size }
  }
}

let tmpSeq = 0

/** tmp + rename: a crash mid-write never leaves a torn file in place. */
async function writeAtomic(dir: string, path: string, data: string): Promise<void> {
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

async function readTagRecord(file: string): Promise<TagRecord | null> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Partial<TagRecord>
    if (typeof raw.key !== 'string' || !Array.isArray(raw.tags)) return null
    const tags = raw.tags.filter((t): t is string => typeof t === 'string')

    return { key: raw.key, tags: [...new Set(tags)] }
  } catch {
    return null
  }
}

/** key → tags from an earlier version's `_tags.json` (tag → keys). */
async function readLegacyIndex(file: string): Promise<Map<string, string[]>> {
  const tagsByKey = new Map<string, string[]>()
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
    for (const [tag, keys] of Object.entries(raw)) {
      if (!Array.isArray(keys)) continue
      for (const key of keys) {
        if (typeof key !== 'string') continue
        tagsByKey.set(key, [...(tagsByKey.get(key) ?? []), tag])
      }
    }
  } catch {
    // Unreadable: nothing to migrate.
  }

  return tagsByKey
}

interface DirScan {
  /** Entry names, oldest modification first. */
  entries: string[]
  sidecars: string[]
  legacy: boolean
}

/** Read `dir`, removing temp files a crash left behind. */
async function scanDir(dir: string): Promise<DirScan> {
  const scan: DirScan = { entries: [], sidecars: [], legacy: false }
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return scan // No directory yet: an empty cache.
  }
  const found: { name: string; mtime: number }[] = []
  for (const file of files) {
    const path = join(dir, file)
    if (file.endsWith(TMP_SUFFIX)) {
      await rm(path, { force: true }).catch(() => {})
    } else if (file === LEGACY_TAGS_FILE) {
      scan.legacy = true
    } else if (file.endsWith(TAGS_SUFFIX)) {
      scan.sidecars.push(file.slice(0, -TAGS_SUFFIX.length))
    } else if (file.endsWith(ENTRY_SUFFIX)) {
      const info = await stat(path).catch(() => null)
      if (info?.isFile()) found.push({ name: file.slice(0, -ENTRY_SUFFIX.length), mtime: info.mtimeMs })
    }
  }
  found.sort((a, b) => a.mtime - b.mtime || (a.name < b.name ? -1 : 1))
  scan.entries = found.map((f) => f.name)

  return scan
}

class FsStore<E> implements ISRStore<E> {
  private readonly index = new FsIndex()
  /** Per-name fs mutation chains, dropped by identity once settled: the map
   * holds only names with work in flight. */
  private readonly lanes = new Map<string, Promise<void>>()
  /** Every operation waits for this: the start-up scan, then any `clear()`. */
  private barrier: Promise<void> | null = null

  constructor(
    private readonly dir: string,
    private readonly maxEntries: number,
  ) {}

  stats(): { entries: number; tags: number } {
    return this.index.stats()
  }

  private entryPath(name: string): string {
    return join(this.dir, name + ENTRY_SUFFIX)
  }

  private tagsPath(name: string): string {
    return join(this.dir, name + TAGS_SUFFIX)
  }

  private ready(): Promise<void> {
    return (this.barrier ??= this.init())
  }

  /** Run `op` after every earlier fs mutation for `name`. Best-effort: a
   * failed write is a miss next time; a failed removal leaves a file the next
   * start counts against the cap. */
  private enqueue(name: string, op: () => Promise<void>): Promise<void> {
    const next = (this.lanes.get(name) ?? Promise.resolve()).then(op).catch(() => {})
    this.lanes.set(name, next)
    void next.then(() => {
      if (this.lanes.get(name) === next) this.lanes.delete(name)
    })

    return next
  }

  private removeFiles(name: string): Promise<void> {
    return this.enqueue(name, async () => {
      await Promise.all([
        rm(this.entryPath(name), { force: true }),
        rm(this.tagsPath(name), { force: true }),
      ])
    })
  }

  /** Evict oldest-first past the cap: the entry file AND its tags. Returns
   * the removals so the caller can wait for the disk to match the index. */
  private evictOverflow(): Promise<void>[] {
    const removals: Promise<void>[] = []
    while (this.index.entries.size > this.maxEntries) {
      const oldest = this.index.entries.values().next().value as string
      this.index.forget(oldest)
      removals.push(this.removeFiles(oldest))
    }

    return removals
  }

  /** Mark `name` most recent, then enforce the cap. */
  private touch(name: string): Promise<void>[] {
    this.index.entries.delete(name)
    this.index.entries.add(name)

    return this.evictOverflow()
  }

  private writeTags(name: string, record: TagRecord): Promise<void> {
    const data = JSON.stringify(record)

    return this.enqueue(name, () => writeAtomic(this.dir, this.tagsPath(name), data))
  }

  private async init(): Promise<void> {
    const scan = await scanDir(this.dir)
    for (const name of scan.entries) this.index.entries.add(name)
    for (const name of scan.sidecars) {
      const record = this.index.entries.has(name) ? await readTagRecord(this.tagsPath(name)) : null
      if (record && record.tags.length > 0) this.index.tag(name, record)
      else await rm(this.tagsPath(name), { force: true }).catch(() => {})
    }
    if (scan.legacy) await this.migrateLegacyIndex()
    // Trim a directory left over the cap (an earlier version, a lowered cap).
    await Promise.all(this.evictOverflow())
  }

  private async migrateLegacyIndex(): Promise<void> {
    const file = join(this.dir, LEGACY_TAGS_FILE)
    const writes: Promise<void>[] = []
    for (const [key, tags] of await readLegacyIndex(file)) {
      const name = nameFor(key)
      // Only keys still cached; a sidecar already on disk wins.
      if (!this.index.entries.has(name) || this.index.tagsFor(name)) continue
      const record = { key, tags: [...new Set(tags)] }
      this.index.tag(name, record)
      writes.push(this.writeTags(name, record))
    }
    await Promise.all(writes)
    await rm(file, { force: true }).catch(() => {})
  }

  async get(key: string): Promise<E | undefined> {
    await this.ready()
    const name = nameFor(key)
    try {
      const value = JSON.parse(await readFile(this.entryPath(name), 'utf-8')) as E
      // A hit refreshes recency. A file this process did not index (another
      // process sharing `dir` wrote it) is adopted and counted.
      await Promise.all(this.touch(name))

      return value
    } catch {
      return undefined
    }
  }

  async set(key: string, entry: E): Promise<void> {
    await this.ready()
    const name = nameFor(key)
    const removals = this.touch(name)
    const data = JSON.stringify(entry)
    await Promise.all([
      this.enqueue(name, () => writeAtomic(this.dir, this.entryPath(name), data)),
      ...removals,
    ])
  }

  async delete(key: string): Promise<void> {
    await this.ready()
    const name = nameFor(key)
    this.index.forget(name)
    await this.removeFiles(name)
  }

  async clear(): Promise<void> {
    const previous = this.ready()
    this.barrier = (async () => {
      await previous
      // Writes issued before the clear land first, then everything goes.
      await Promise.all(this.lanes.values())
      this.index.clear()
      const files = await readdir(this.dir).catch(() => [] as string[])
      await Promise.all(
        files
          .filter((f) => f.endsWith(ENTRY_SUFFIX) || f.endsWith(TMP_SUFFIX))
          .map((f) => rm(join(this.dir, f), { force: true }).catch(() => {})),
      )
    })()
    await this.barrier
  }

  async setTags(key: string, tags: readonly string[]): Promise<void> {
    await this.ready()
    const name = nameFor(key)
    const own = [...new Set(tags)]
    const previous = this.index.tagsFor(name)
    // Tags belong to the CACHED entry, as in the memory store.
    const cached = this.index.entries.has(name)
    if (cached && previous && sameTags(previous, key, own)) return // Unchanged: no write.
    this.index.untag(name)
    if (!cached || own.length === 0) {
      if (previous) await this.enqueue(name, () => rm(this.tagsPath(name), { force: true }))
      return
    }
    const record = { key, tags: own }
    this.index.tag(name, record)
    await this.writeTags(name, record)
  }

  async keysByTag(tag: string): Promise<string[]> {
    await this.ready()

    return this.index.keysByTag(tag)
  }
}

function sameTags(record: TagRecord, key: string, tags: readonly string[]): boolean {
  return (
    record.key === key
    && record.tags.length === tags.length
    && tags.every((t) => record.tags.includes(t))
  )
}
