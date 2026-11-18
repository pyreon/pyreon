// @vitest-environment node
/**
 * ISR bookkeeping must stay bounded by what is actually cached or in flight.
 *
 * - The memory store's tag index only ever grew: `setTags` added, while
 *   `delete()` and LRU eviction never pruned (only a later `keysByTag` for
 *   that exact tag did, and it refreshed LRU order as a side effect).
 * - The fs store's bounds (entries, tags, write cost) are locked in
 *   `isr-fs-store-bounds.test.ts`.
 * - The handler's per-key epoch map kept one entry per key ever invalidated
 *   (`revalidateNow`), forever, though an epoch only guards a render that is
 *   in flight.
 */
import { describe, expect, it } from 'vitest'
import {
  _isrEpochEntryCount,
  _isrTagIndexSize,
  createISRHandler,
  createMemoryStore,
} from '../isr'

const entry = (html = 'x') => ({ html, headers: {}, timestamp: 1 })

describe('createMemoryStore — tag index bounded by the cache', () => {
  it('1000 keys with unique tags through a 10-entry cache index at most 10 tags', () => {
    const store = createMemoryStore({ maxEntries: 10 })
    for (let i = 0; i < 1000; i++) {
      store.set(`/p/${i}`, entry())
      store.setTags?.(`/p/${i}`, [`tag-${i}`])
    }
    expect(_isrTagIndexSize(store)).toBe(10)
    // The survivors are still found by tag.
    expect(store.keysByTag?.('tag-999')).toEqual(['/p/999'])
    expect(store.keysByTag?.('tag-0')).toEqual([])
  })

  it('delete() prunes the key from the index', () => {
    const store = createMemoryStore()
    store.set('/a', entry())
    store.setTags?.('/a', ['posts', 'home'])
    store.delete?.('/a')
    expect(_isrTagIndexSize(store)).toBe(0)
  })

  it('setTags replaces the key\'s previous tags', () => {
    const store = createMemoryStore()
    store.set('/a', entry())
    store.setTags?.('/a', ['old'])
    store.setTags?.('/a', ['new'])
    expect(store.keysByTag?.('old')).toEqual([])
    expect(store.keysByTag?.('new')).toEqual(['/a'])
    expect(_isrTagIndexSize(store)).toBe(1)
  })

  it('setTags for a key that is not cached indexes nothing', () => {
    const store = createMemoryStore()
    store.setTags?.('/never-set', ['t'])
    expect(_isrTagIndexSize(store)).toBe(0)
  })

  it('keysByTag does not refresh LRU order', () => {
    const store = createMemoryStore({ maxEntries: 2 })
    store.set('/a', entry('a'))
    store.setTags?.('/a', ['t'])
    store.set('/b', entry('b'))
    // A tag LOOKUP is not a use of the page: /a stays the oldest.
    expect(store.keysByTag?.('t')).toEqual(['/a'])
    store.set('/c', entry('c'))
    expect(store.get('/a')).toBeUndefined()
    expect(store.get('/b')).toBeDefined()
  })

  it('clear() empties the index', () => {
    const store = createMemoryStore()
    store.set('/a', entry())
    store.setTags?.('/a', ['t'])
    store.clear?.()
    expect(_isrTagIndexSize(store)).toBe(0)
  })
})

describe('createISRHandler — epochs only for renders in flight', () => {
  it('revalidateNow for 10,000 distinct keys with nothing in flight keeps no epoch entries', async () => {
    const handler = createISRHandler(
      async () => new Response('<p>x</p>', { headers: { 'content-type': 'text/html' } }),
      { revalidate: 60 },
    )
    for (let i = 0; i < 10_000; i++) await handler.revalidateNow(`/p/${i}`)
    expect(_isrEpochEntryCount(handler)).toBe(0)
  })

  it('a render in flight is still guarded, and its epoch entry is dropped when it settles', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let renders = 0
    const handler = createISRHandler(
      async () => {
        renders++
        await gate
        return new Response('<p>old</p>', { headers: { 'content-type': 'text/html' } })
      },
      { revalidate: 60 },
    )
    const pending = handler(new Request('http://x/a'))
    await Promise.resolve()
    expect(_isrEpochEntryCount(handler)).toBe(1)
    // Invalidated while the cold render runs: its result must not be stored.
    await handler.revalidateNow('/a')
    release()
    await pending
    expect(_isrEpochEntryCount(handler)).toBe(0)
    await handler(new Request('http://x/a'))
    expect(renders).toBe(2)
  })

  it('revalidateAll guards every render in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let renders = 0
    const handler = createISRHandler(
      async () => {
        renders++
        await gate
        return new Response('<p>old</p>', { headers: { 'content-type': 'text/html' } })
      },
      { revalidate: 60 },
    )
    const pending = handler(new Request('http://x/a'))
    await Promise.resolve()
    await handler.revalidateAll()
    release()
    await pending
    await handler(new Request('http://x/a'))
    expect(renders).toBe(2)
    expect(_isrEpochEntryCount(handler)).toBe(0)
  })
})
