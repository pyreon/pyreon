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
import { mountInBrowser } from '@pyreon/test-utils/browser'
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

describe('<Search> browser — empty state', () => {
  beforeEach(() => {
    _resetSearchForTesting()
    vi.stubGlobal('fetch', vi.fn(mockedFetch))
  })

  afterEach(() => {
    _resetSearchForTesting()
    vi.unstubAllGlobals()
  })

  // Open via the keyboard shortcut + type a query. Both modifiers are set so
  // the handler fires on both Mac (metaKey) and Linux-CI (ctrlKey) runners.
  async function openAndType(
    container: HTMLElement,
    value: string,
  ): Promise<void> {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    )
    const input = await vi.waitFor(() => {
      const el = container.querySelector(
        '.pyreon-search__input',
      ) as HTMLInputElement | null
      if (!el) throw new Error('search input not shown')
      return el
    })
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('shows the empty state (with the query) after a search with no matches', async () => {
    const { container, unmount } = mountInBrowser(<Search debounceMs={10} />)
    await openAndType(container, 'zzzznomatchqxy')
    const empty = await vi.waitFor(
      () => {
        const el = container.querySelector('.pyreon-search__empty')
        if (!el) throw new Error('empty state not shown')
        return el
      },
      { timeout: 3000 },
    )
    expect(empty.textContent).toContain('No results for')
    expect(empty.textContent).toContain('zzzznomatchqxy')
    expect(container.querySelector('.pyreon-search__result')).toBeNull()
    unmount()
  })

  it('shows results — NOT the empty state — for a matching query', async () => {
    const { container, unmount } = mountInBrowser(<Search debounceMs={10} />)
    await openAndType(container, 'reactivity')
    await vi.waitFor(
      () => {
        if (!container.querySelector('.pyreon-search__result'))
          throw new Error('no results yet')
      },
      { timeout: 3000 },
    )
    expect(container.querySelector('.pyreon-search__empty')).toBeNull()
    unmount()
  })

  // The flicker guard + bisect discriminator: a too-short query sets results
  // to `[]` but status to `idle`, so the empty state MUST NOT show. A naive
  // `results.length === 0` check (no status gate) would wrongly show
  // "No results for r" here — this test fails against that regression.
  it('does NOT show the empty state for a too-short / idle query', async () => {
    const { container, unmount } = mountInBrowser(
      <Search debounceMs={10} minQueryLength={2} />,
    )
    await openAndType(container, 'r')
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(container.querySelector('.pyreon-search__empty')).toBeNull()
    expect(container.querySelector('.pyreon-search__result')).toBeNull()
    unmount()
  })

  it('uses a custom noResultsText when provided', async () => {
    const { container, unmount } = mountInBrowser(
      <Search
        debounceMs={10}
        noResultsText={(q) => `Nothing matched ${q}!`}
      />,
    )
    await openAndType(container, 'zzzznomatchqxy')
    const empty = await vi.waitFor(
      () => {
        const el = container.querySelector('.pyreon-search__empty')
        if (!el) throw new Error('empty state not shown')
        return el
      },
      { timeout: 3000 },
    )
    expect(empty.textContent).toBe('Nothing matched zzzznomatchqxy!')
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
