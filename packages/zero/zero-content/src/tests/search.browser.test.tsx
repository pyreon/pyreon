/**
 * <Search> browser tests — real Chromium via @vitest/browser.
 *
 * These tests focus on what only a real browser can exercise:
 *
 *   - The lazy catalog load + index merge round-trip via a stubbed
 *     `globalThis.fetch`.
 *   - The component mounts without error and emits the closed-state
 *     shell (the open overlay shape is covered by unit tests under
 *     happy-dom in sidebar-toc.test.ts's companion specs).
 *   - The shortcut="none" path skips the keyboard listener.
 *
 * The full open/close DOM lifecycle requires the `<dialog>` element
 * behaviors that diverge across browsers; we cover the underlying
 * `loadSearchIndex` data-flow here and lean on the existing unit
 * tests for the state machine.
 */
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetSearchForTesting,
  loadSearchIndex,
  Search,
} from '../search/search-runtime'

const SAMPLE_CATALOG = {
  collections: [{ name: 'docs', url: '/search-index/docs.json' }],
}

const SAMPLE_INDEX = {
  docs: [
    {
      id: 'docs:getting-started',
      title: 'Getting Started',
      description: 'Install and configure Pyreon',
      url: '/docs/getting-started',
      collection: 'docs',
      slug: 'getting-started',
      headings: 'Setup\nUsage',
      body: 'Install Pyreon via bun add @pyreon/core',
    },
    {
      id: 'docs:reactivity',
      title: 'Reactivity',
      description: 'Signals, computed, effect',
      url: '/docs/reactivity',
      collection: 'docs',
      slug: 'reactivity',
      headings: 'Signals\nEffects',
      body: 'Pyreon uses fine-grained reactivity via signals',
    },
  ],
}

function mockedFetch(url: string | URL | Request): Promise<Response> {
  const u = String(url)
  if (u.endsWith('/search-index.json')) {
    return Promise.resolve(
      new Response(JSON.stringify(SAMPLE_CATALOG), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
  if (u.endsWith('/search-index/docs.json')) {
    return Promise.resolve(
      new Response(JSON.stringify(SAMPLE_INDEX), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
  return Promise.resolve(
    new Response('{}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('<Search> browser — closed state shell', () => {
  beforeEach(() => {
    _resetSearchForTesting()
    vi.stubGlobal('fetch', vi.fn(mockedFetch))
  })

  afterEach(() => {
    _resetSearchForTesting()
    vi.unstubAllGlobals()
  })

  it('mounts and emits the <search> root with the closed class', () => {
    const { container, unmount } = mountInBrowser(<Search />)
    const root = container.querySelector('search.pyreon-search')
    expect(root).not.toBeNull()
    expect(root?.className).toBe('pyreon-search')
    unmount()
  })

  it('starts with no backdrop / panel / input in the DOM', () => {
    const { container, unmount } = mountInBrowser(<Search />)
    expect(container.querySelector('.pyreon-search__backdrop')).toBeNull()
    expect(container.querySelector('.pyreon-search__panel')).toBeNull()
    expect(container.querySelector('.pyreon-search__input')).toBeNull()
    unmount()
  })

  it('respects shortcut="none" — passes through the prop without crashing', () => {
    const { container, unmount } = mountInBrowser(<Search shortcut="none" />)
    expect(container.querySelector('search.pyreon-search')).not.toBeNull()
    unmount()
  })

  it('accepts a custom catalogUrl prop', () => {
    const { container, unmount } = mountInBrowser(
      <Search catalogUrl="/custom/index.json" />,
    )
    expect(container.querySelector('search.pyreon-search')).not.toBeNull()
    unmount()
  })
})

describe('<Search> browser — loadSearchIndex (data layer)', () => {
  beforeEach(() => {
    _resetSearchForTesting()
    vi.stubGlobal('fetch', vi.fn(mockedFetch))
  })

  afterEach(() => {
    _resetSearchForTesting()
    vi.unstubAllGlobals()
  })

  it('loads the catalog + each collection index over fetch', async () => {
    const ms = await loadSearchIndex()
    // MiniSearch exposes documentCount; SAMPLE_INDEX has 2 docs.
    expect(ms.documentCount).toBe(2)
  })

  it('returns results matching the indexed content', async () => {
    const ms = await loadSearchIndex()
    const results = ms.search('reactivity')
    expect(results.length).toBeGreaterThan(0)
    const slugs = results.map((r) => r.slug)
    expect(slugs).toContain('reactivity')
  })

  it('matches prefix queries (used for typeahead)', async () => {
    const ms = await loadSearchIndex()
    const results = ms.search('react')
    expect(results.length).toBeGreaterThan(0)
  })

  it('throws a clear error when the catalog URL returns 404', async () => {
    _resetSearchForTesting()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('', { status: 404 })),
      ),
    )
    await expect(loadSearchIndex()).rejects.toThrow(
      /Failed to load search catalog/,
    )
  })

  it('is memoized — second call returns the same instance', async () => {
    const a = await loadSearchIndex()
    const b = await loadSearchIndex()
    expect(b).toBe(a)
  })
})
