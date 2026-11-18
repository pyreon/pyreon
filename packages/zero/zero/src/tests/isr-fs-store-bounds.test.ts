// @vitest-environment node
/**
 * `createFsStore` must hold the same contract as `createMemoryStore`: what is
 * on disk is bounded by `maxEntries`, and every side index is bounded by what
 * is cached.
 *
 * It used to keep one file per cache key forever. The default cache key is
 * `pathname + search`, so an anonymous visitor requesting distinct query
 * strings could fill the disk. Its `_tags.json` sidecar was also rewritten in
 * full on every tagged miss (O(cached keys) bytes per miss).
 *
 * Every test works in its own `mkdtemp` directory and removes it.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createISRHandler } from '../isr'
import { _isrFsIndexStats, createFsStore } from '../isr-fs-store'

const entry = (html = 'x') => ({ html, headers: {}, timestamp: 1 })
const tick = () => new Promise((r) => setTimeout(r, 15))

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-isr-fs-bounds-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const files = () => readdirSync(dir)

describe('createFsStore — entries bounded by maxEntries', () => {
  it('N distinct keys leave at most maxEntries files, newest kept', async () => {
    const store = createFsStore(dir, { maxEntries: 10 })
    for (let i = 0; i < 50; i++) await store.set(`/p?q=${i}`, entry(String(i)))
    expect(files()).toHaveLength(10)
    expect(await store.get('/p?q=39')).toBeUndefined()
    expect(await store.get('/p?q=40')).toEqual(entry('40'))
    expect(await store.get('/p?q=49')).toEqual(entry('49'))
  })

  it('defaults to 1000 entries, the memory store default', async () => {
    const store = createFsStore(dir)
    for (let i = 0; i < 1010; i++) await store.set(`/p?q=${i}`, entry())
    expect(files()).toHaveLength(1000)
  })

  it('a read refreshes recency, as in the memory store (LRU)', async () => {
    const store = createFsStore(dir, { maxEntries: 2 })
    await store.set('/a', entry('a'))
    await store.set('/b', entry('b'))
    await store.get('/a')
    await store.set('/c', entry('c'))
    expect(await store.get('/a')).toEqual(entry('a'))
    expect(await store.get('/b')).toBeUndefined()
  })

  it('eviction drops the evicted key from the tag index, in memory and on disk', async () => {
    const store = createFsStore(dir, { maxEntries: 3 })
    for (let i = 0; i < 100; i++) {
      await store.set(`/p/${i}`, entry())
      await store.setTags?.(`/p/${i}`, [`t${i}`, 'all'])
    }
    expect(_isrFsIndexStats(store)).toEqual({ entries: 3, tags: 4 })
    expect(await store.keysByTag?.('t0')).toEqual([])
    expect((await store.keysByTag?.('all'))?.toSorted()).toEqual(['/p/97', '/p/98', '/p/99'])
    // A restarted instance agrees (no stale tag references survive on disk).
    const restarted = createFsStore(dir, { maxEntries: 3 })
    expect(await restarted.keysByTag?.('t0')).toEqual([])
    expect((await restarted.keysByTag?.('all'))?.toSorted()).toEqual(['/p/97', '/p/98', '/p/99'])
    expect(_isrFsIndexStats(restarted)).toEqual({ entries: 3, tags: 4 })
  })
})

describe('createFsStore — the bound survives a restart', () => {
  it('a new instance counts what is already on disk', async () => {
    const a = createFsStore(dir, { maxEntries: 5 })
    for (let i = 0; i < 5; i++) {
      await a.set(`/old/${i}`, entry())
      await tick()
    }
    const b = createFsStore(dir, { maxEntries: 5 })
    for (let i = 0; i < 3; i++) await b.set(`/new/${i}`, entry())
    expect(files()).toHaveLength(5)
    // Oldest first: the three oldest previous entries went.
    expect(await b.get('/old/0')).toBeUndefined()
    expect(await b.get('/old/2')).toBeUndefined()
    expect(await b.get('/old/3')).toEqual(entry())
  })

  it('a directory over the bound (an older version, a lowered cap) is trimmed at start', async () => {
    const a = createFsStore(dir, { maxEntries: 100 })
    for (let i = 0; i < 20; i++) await a.set(`/k/${i}`, entry())
    const b = createFsStore(dir, { maxEntries: 5 })
    expect(await b.get('/k/19')).toEqual(entry())
    expect(files()).toHaveLength(5)
  })
})

describe('createFsStore — tag writes are O(1) per miss', () => {
  it('a tagged miss writes bytes independent of how many keys are tagged', async () => {
    const store = createFsStore(dir, { maxEntries: 5000 })
    const longKey = (i: number) => `/posts/${'x'.repeat(40)}/${i}`
    for (let i = 0; i < 400; i++) {
      await store.set(longKey(i), entry())
      await store.setTags?.(longKey(i), ['posts'])
    }
    const before = new Map(files().map((f) => [f, statSync(join(dir, f)).mtimeMs]))
    await tick()
    await store.set(longKey(400), entry())
    await store.setTags?.(longKey(400), ['posts'])
    let written = 0
    for (const f of files()) {
      const st = statSync(join(dir, f))
      if (before.get(f) !== st.mtimeMs) written += st.size
    }
    // One entry plus its own tags: well under 1 KB. Rewriting a shared index
    // of 401 keys is ~20 KB.
    expect(written).toBeLessThan(1000)
    expect((await store.keysByTag?.('posts'))?.length).toBe(401)
  })

  it('delete() and revalidateTag drop the key from the persisted index', async () => {
    const store = createFsStore(dir)
    await store.set('/a', entry())
    await store.setTags?.('/a', ['posts'])
    await store.set('/b', entry())
    await store.setTags?.('/b', ['posts', 'b'])
    await store.delete?.('/a')
    expect(await createFsStore(dir).keysByTag?.('posts')).toEqual(['/b'])
    const isr = createISRHandler(async () => new Response('x'), { revalidate: 60, store })
    expect(await isr.revalidateTag('b')).toEqual({ dropped: 1 })
    const restarted = createFsStore(dir)
    expect(await restarted.keysByTag?.('posts')).toEqual([])
    expect(_isrFsIndexStats(store)).toEqual({ entries: 0, tags: 0 })
    expect(files()).toEqual([])
  })

  it('setTags replaces the key\'s tags; an uncached key indexes nothing', async () => {
    const store = createFsStore(dir)
    await store.set('/a', entry())
    await store.setTags?.('/a', ['old'])
    await store.setTags?.('/a', ['new'])
    await store.setTags?.('/never-cached', ['ghost'])
    const restarted = createFsStore(dir)
    expect(await restarted.keysByTag?.('old')).toEqual([])
    expect(await restarted.keysByTag?.('new')).toEqual(['/a'])
    expect(await restarted.keysByTag?.('ghost')).toEqual([])
  })

  it('re-recording the same tags writes nothing', async () => {
    const store = createFsStore(dir)
    await store.set('/a', entry())
    await store.setTags?.('/a', ['posts'])
    const before = new Map(files().map((f) => [f, statSync(join(dir, f)).mtimeMs]))
    await tick()
    await store.setTags?.('/a', ['posts'])
    for (const f of files()) expect(statSync(join(dir, f)).mtimeMs).toBe(before.get(f))
  })
})

describe('createFsStore — concurrency', () => {
  it('concurrent sets of distinct keys never exceed the bound', async () => {
    const store = createFsStore(dir, { maxEntries: 10 })
    await Promise.all(Array.from({ length: 60 }, (_, i) => store.set(`/c/${i}`, entry())))
    expect(files()).toHaveLength(10)
    expect(_isrFsIndexStats(store).entries).toBe(10)
  })

  it('concurrent sets of one key leave one file holding the last write', async () => {
    const store = createFsStore(dir)
    await Promise.all([store.set('/k', entry('1')), store.set('/k', entry('2')), store.set('/k', entry('3'))])
    expect(files()).toHaveLength(1)
    expect(await createFsStore(dir).get('/k')).toEqual(entry('3'))
  })

  it('a delete issued after a set wins, even while the set is still writing', async () => {
    const store = createFsStore(dir)
    await Promise.all([store.set('/k', entry()), store.delete?.('/k')])
    expect(files()).toEqual([])
    expect(await store.get('/k')).toBeUndefined()
  })

  it('clear() drops writes issued before it and resets the count', async () => {
    const store = createFsStore(dir, { maxEntries: 3 })
    await Promise.all([store.set('/a', entry()), store.set('/b', entry()), store.clear?.()])
    expect(files()).toEqual([])
    for (let i = 0; i < 3; i++) await store.set(`/n/${i}`, entry())
    expect(files()).toHaveLength(3)
    expect(await store.get('/n/0')).toEqual(entry())
  })
})

describe('createFsStore — crash safety and upgrades', () => {
  it('a torn temp file left by a crash is removed at start and never served', async () => {
    const a = createFsStore(dir)
    await a.set('/a', entry())
    writeFileSync(join(dir, `${encodeURIComponent('/b')}.json.123.tmp`), '{"html":"x","hea')
    const b = createFsStore(dir)
    expect(await b.get('/a')).toEqual(entry())
    expect(await b.get('/b')).toBeUndefined()
    expect(files()).toHaveLength(1)
  })

  it('an unparseable entry reads as a miss', async () => {
    const store = createFsStore(dir)
    await store.set('/a', entry())
    const [name] = files()
    writeFileSync(join(dir, name as string), '{"html":')
    expect(await createFsStore(dir).get('/a')).toBeUndefined()
  })

  it('migrates a legacy `_tags.json` index and removes it', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${encodeURIComponent('/a')}.json`), JSON.stringify(entry()))
    writeFileSync(join(dir, '_tags.json'), JSON.stringify({ posts: ['/a', '/gone'] }))
    const store = createFsStore(dir)
    expect(await store.keysByTag?.('posts')).toEqual(['/a'])
    expect(existsSync(join(dir, '_tags.json'))).toBe(false)
    expect(await createFsStore(dir).keysByTag?.('posts')).toEqual(['/a'])
  })

  it('a key too long for a file name still caches (hashed file name)', async () => {
    const store = createFsStore(dir)
    const key = `/search?q=${'y'.repeat(2000)}`
    await store.set(key, entry('long'))
    await store.setTags?.(key, ['s'])
    const restarted = createFsStore(dir)
    expect(await restarted.get(key)).toEqual(entry('long'))
    expect(await restarted.keysByTag?.('s')).toEqual([key])
    for (const f of files()) expect(f.length).toBeLessThan(200)
  })

  it('keys differing only in letter case never share a file (case-insensitive file systems)', async () => {
    const store = createFsStore(dir)
    await store.set('/about', entry('lower'))
    await store.set('/About', entry('upper'))
    expect(await store.get('/about')).toEqual(entry('lower'))
    expect(await store.get('/About')).toEqual(entry('upper'))
    expect(files()).toHaveLength(2)
  })
})
