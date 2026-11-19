/**
 * Search index cache — stale-load resolution (leak class F).
 *
 * - Unmounting every `<Search>` while the index was still loading released
 *   the cache, but the load then finished and re-pinned the whole MiniSearch
 *   with zero subscribers.
 * - A failed load stayed cached as a rejected promise, so every later load of
 *   that URL failed until the last subscriber unmounted.
 * - A load for an older catalog URL that finished last overwrote the current
 *   one.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetSearchForTesting,
  _searchCacheStateForTesting,
  acquireSearchInstance,
  loadSearchIndex,
} from '../search/search-runtime'

afterEach(() => _resetSearchForTesting())

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const catalog = (chunk: string) => ok({ collections: [{ name: 'docs', url: chunk }] })
const chunk = (title: string) => ok({ docs: [{ id: title, title, body: title, url: `/${title}` }] })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })

  return { promise, resolve }
}

describe('search index cache — stale loads', () => {
  it('a load that finishes after the last subscriber released does not re-pin the index', async () => {
    const gate = deferred<Response>()
    const fetchFn = (async (url: string) =>
      url === '/cat.json' ? gate.promise : chunk('a')) as unknown as typeof fetch
    const release = acquireSearchInstance()
    const load = loadSearchIndex('/cat.json', fetchFn)
    release()
    gate.resolve(catalog('/a.json'))
    await load
    expect(_searchCacheStateForTesting()).toEqual({ instance: false, loading: false })
  })

  it('a failed load is not cached: the next load of the same URL retries', async () => {
    let calls = 0
    const fetchFn = (async (url: string) => {
      if (url === '/cat.json') {
        calls++
        if (calls === 1) return { ok: false, status: 503 } as unknown as Response

        return catalog('/a.json')
      }

      return chunk('a')
    }) as unknown as typeof fetch
    const release = acquireSearchInstance()
    await expect(loadSearchIndex('/cat.json', fetchFn)).rejects.toThrow(/503/)
    const ms = await loadSearchIndex('/cat.json', fetchFn)
    expect(ms.search('a').length).toBe(1)
    expect(_searchCacheStateForTesting()).toEqual({ instance: true, loading: false })
    release()
  })

  it('a load for an older catalog URL that finishes last does not replace the current index', async () => {
    const slow = deferred<Response>()
    const fetchFn = (async (url: string) => {
      if (url === '/old.json') return slow.promise
      if (url === '/new.json') return catalog('/new-chunk.json')
      if (url === '/new-chunk.json') return chunk('fresh')

      return chunk('stale')
    }) as unknown as typeof fetch
    const release = acquireSearchInstance()
    const old = loadSearchIndex('/old.json', fetchFn)
    const current = await loadSearchIndex('/new.json', fetchFn)
    slow.resolve(catalog('/old-chunk.json'))
    await old
    expect(await loadSearchIndex('/new.json', fetchFn)).toBe(current)
    release()
  })
})
