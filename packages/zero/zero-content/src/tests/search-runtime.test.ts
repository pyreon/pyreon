/**
 * loadSearchIndex — fetch + merge per-collection indexes. Uses mocked
 * fetch since the runtime targets browsers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import MiniSearch from 'minisearch'
import {
  _resetSearchForTesting,
  loadSearchIndex,
} from '../search/search-runtime'
import { buildIndexJson, makeSearchDoc } from '../search/index-builder'

afterEach(() => _resetSearchForTesting())

function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  } as unknown as Response
}

describe('loadSearchIndex', () => {
  it('loads the catalog + per-collection chunks + returns a MiniSearch', async () => {
    // Build a real chunk so MiniSearch.loadJS can round-trip it.
    const docsChunkJson = JSON.parse(
      buildIndexJson([
        makeSearchDoc('docs', {
          slug: 'zero',
          title: 'Zero',
          headings: ['Intro'],
          body: 'reactive primitives signals computed effects',
        }),
        makeSearchDoc('docs', {
          slug: 'router',
          title: 'Router',
          headings: ['Routes'],
          body: 'fs-router catch-all routes navigation',
        }),
      ]),
    )
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/search-index.json') {
        return mockResponse({
          collections: [{ name: 'docs', url: '/search-index-docs.json' }],
        })
      }
      if (url === '/search-index-docs.json') {
        return mockResponse(docsChunkJson)
      }
      return mockResponse({}, false)
    })
    const ms = await loadSearchIndex(
      '/search-index.json',
      fetchFn as unknown as typeof fetch,
    )
    expect(ms).toBeInstanceOf(MiniSearch)
    const results = ms.search('reactive')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.title).toBe('Zero')
  })

  it('caches the instance — repeat calls return the same MiniSearch', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/search-index.json') {
        return mockResponse({ collections: [] })
      }
      return mockResponse({}, false)
    })
    const a = await loadSearchIndex('/search-index.json', fetchFn as never)
    const b = await loadSearchIndex('/search-index.json', fetchFn as never)
    expect(a).toBe(b)
    // Catalog should only be fetched once.
    expect(
      (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === '/search-index.json',
      ),
    ).toHaveLength(1)
  })

  it('throws when the catalog response is not ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse({}, false))
    await expect(
      loadSearchIndex('/search-index.json', fetchFn as never),
    ).rejects.toThrow('Failed to load search catalog')
  })

  it('throws when a per-collection chunk is not ok', async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/search-index.json') {
        return mockResponse({
          collections: [{ name: 'docs', url: '/search-index-docs.json' }],
        })
      }
      return mockResponse({}, false)
    })
    await expect(
      loadSearchIndex('/search-index.json', fetchFn as never),
    ).rejects.toThrow('Failed to load search index')
  })

  it('honours a custom catalogUrl', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse({ collections: [] }))
    await loadSearchIndex('/custom/index.json', fetchFn as never)
    expect(fetchFn).toHaveBeenCalledWith('/custom/index.json')
  })
})
