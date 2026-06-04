import { signal, computed } from '@pyreon/reactivity'
import { onMount, onUnmount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import MiniSearch, { type SearchResult } from 'minisearch'

// ─── Runtime search ────────────────────────────────────────────────────────
//
// Client-side <Search> component with Cmd+K shortcut, debounced query,
// SPA navigation on result click. Lazy-loads the search index on first
// open so the initial route bundle stays small.

/**
 * Catalog file emitted by `buildSearchIndex` at the dist root.
 *
 * @internal exported for testing
 */
export interface SearchCatalog {
  collections: Array<{ name: string; url: string }>
}

const MS_OPTIONS = {
  fields: ['title', 'description', 'headings', 'body'] as string[],
  storeFields: ['title', 'description', 'url', 'collection', 'slug'] as string[],
  searchOptions: {
    boost: { title: 3, headings: 2, description: 1.5 },
    prefix: true,
    fuzzy: 0.15,
  },
}

/**
 * Load + merge all collection indexes into one MiniSearch instance.
 * Idempotent at module scope — multiple calls return the same instance.
 */
let _instance: MiniSearch | null = null
let _loading: Promise<MiniSearch> | null = null

/**
 * Reset the cached MiniSearch instance. Test-only.
 *
 * @internal exported for testing
 */
export function _resetSearchForTesting(): void {
  _instance = null
  _loading = null
}

/**
 * Load the search index lazily. Fetches the catalog, then each
 * per-collection chunk, and merges them into one MiniSearch. The
 * default `catalogUrl` is `/search-index.json` (matching what the
 * builder emits).
 */
export async function loadSearchIndex(
  catalogUrl = '/search-index.json',
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<MiniSearch> {
  if (_instance) return _instance
  if (_loading) return _loading
  _loading = (async () => {
    const catalogRes = await fetchFn(catalogUrl)
    if (!catalogRes.ok) {
      throw new Error(
        `[@pyreon/zero-content] Failed to load search catalog from ${catalogUrl}: ${catalogRes.status}`,
      )
    }
    const catalog = (await catalogRes.json()) as SearchCatalog
    const ms = new MiniSearch(MS_OPTIONS)
    for (const entry of catalog.collections) {
      const indexRes = await fetchFn(entry.url)
      if (!indexRes.ok) {
        throw new Error(
          `[@pyreon/zero-content] Failed to load search index ${entry.url}: ${indexRes.status}`,
        )
      }
      const json = (await indexRes.json()) as { docs?: unknown[] }
      // Each chunk is `{ docs: SearchDoc[] }` — simpler to round-trip
      // than minisearch's internal format AND easier to merge.
      if (Array.isArray(json.docs)) ms.addAll(json.docs)
    }
    _instance = ms
    _loading = null
    return ms
  })()
  return _loading
}

/**
 * useSearch hook — the headless search state. Use this directly when
 * building a custom search UI; `<Search />` wraps this with default
 * styling + keyboard shortcuts.
 */
export interface UseSearchResult {
  /** Open state of the search overlay. */
  open: ReturnType<typeof signal<boolean>>
  /** Current query string. */
  query: ReturnType<typeof signal<string>>
  /** Search results — auto-updates with debounced query. */
  results: ReturnType<typeof computed<SearchResult[]>>
  /** Toggle the overlay open/closed. */
  toggle: () => void
  /** Close the overlay. */
  close: () => void
}

export interface UseSearchOptions {
  catalogUrl?: string
  /** Debounce interval in ms. Default 150. */
  debounceMs?: number
  /** Max number of results to show. Default 8. */
  maxResults?: number
  /** Override the fetch impl (testing). */
  fetchFn?: typeof fetch
}

export function useSearch(
  options: UseSearchOptions = {},
): UseSearchResult {
  const open = signal(false)
  const query = signal('')
  const debounced = signal('')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = options.debounceMs ?? 150

  // Eagerly load on first open (don't wait for the first query).
  let indexPromise: Promise<MiniSearch> | null = null
  const ensureIndex = (): Promise<MiniSearch> => {
    if (!indexPromise) {
      indexPromise = loadSearchIndex(options.catalogUrl, options.fetchFn)
    }
    return indexPromise
  }

  // Debounce the user's typing.
  const subscribeToQuery = () => {
    return query.subscribe(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounced.set(query())
      }, debounceMs)
    })
  }

  // Keep the index hot when open.
  let unsubOpen: (() => void) | null = null
  onMount(() => {
    const unsubQuery = subscribeToQuery()
    unsubOpen = open.subscribe(() => {
      if (open()) void ensureIndex()
    })
    return () => {
      unsubQuery()
      unsubOpen?.()
      if (debounceTimer !== null) clearTimeout(debounceTimer)
    }
  })

  const _results = signal<SearchResult[]>([])
  // Run search when debounced query changes.
  let queryRunCount = 0
  debounced.subscribe(() => {
    const q = debounced().trim()
    if (q.length === 0) {
      _results.set([])
      return
    }
    const runId = ++queryRunCount
    void ensureIndex().then((ms) => {
      // Discard stale results from earlier slow searches.
      if (runId !== queryRunCount) return
      _results.set(ms.search(q).slice(0, options.maxResults ?? 8))
    })
  })

  const results = computed(() => _results())

  const toggle = () => open.set(!open())
  const close = () => open.set(false)

  return { open, query, results, toggle, close }
}

/**
 * <Search /> component — the default keyboard-shortcut + overlay
 * presentation. Wraps `useSearch` with Cmd+K binding, focus
 * management, and minimal styling hooks (the styling itself is up to
 * the consumer's CSS).
 */
export interface SearchProps {
  /** Override the index catalog URL. Default `/search-index.json`. */
  catalogUrl?: string
  /** Override the keyboard shortcut. Default `mod+k` (Cmd/Ctrl+K). */
  shortcut?: 'mod+k' | 'mod+/' | 'none'
  /** Debounce interval in ms. Default 150. */
  debounceMs?: number
  /** Max number of results to show. Default 8. */
  maxResults?: number
}

export function Search(props: SearchProps): VNodeChild {
  const opts: UseSearchOptions = {
    debounceMs: props.debounceMs ?? 150,
    maxResults: props.maxResults ?? 8,
  }
  if (props.catalogUrl !== undefined) opts.catalogUrl = props.catalogUrl
  const state = useSearch(opts)

  // Keyboard shortcut wiring.
  const shortcut = props.shortcut ?? 'mod+k'
  onMount(() => {
    if (shortcut === 'none') return undefined
    const handler = (e: KeyboardEvent) => {
      const isMod = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      const wantKey = shortcut === 'mod+k' ? 'k' : '/'
      if (isMod && e.key === wantKey) {
        e.preventDefault()
        state.toggle()
      }
      if (e.key === 'Escape' && state.open()) {
        state.close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  onUnmount(() => state.close())

  return (
    <search
      class={() =>
        state.open() ? 'pyreon-search pyreon-search--open' : 'pyreon-search'
      }
    >
      {() => state.open() && (
        <div class="pyreon-search__backdrop">
          <dialog
            class="pyreon-search__panel"
            aria-modal="true"
            aria-label="Search"
            open
          >
            <input
              type="search"
              class="pyreon-search__input"
              placeholder="Search…"
              aria-label="Search query"
              value={() => state.query()}
              onInput={(e: Event) =>
                state.query.set((e.target as HTMLInputElement).value)
              }
            />
            <button
              type="button"
              class="pyreon-search__close"
              aria-label="Close search"
              onClick={() => state.close()}
            >
              Close
            </button>
            <ul class="pyreon-search__results">
              {() =>
                state.results().map((r) => (
                  <li class="pyreon-search__result">
                    <a
                      href={String(r.url ?? '#')}
                      onClick={() => state.close()}
                    >
                      <span class="pyreon-search__title">
                        {String(r.title ?? r.id)}
                      </span>
                      {r.description && (
                        <span class="pyreon-search__desc">
                          {String(r.description)}
                        </span>
                      )}
                    </a>
                  </li>
                ))
              }
            </ul>
          </dialog>
        </div>
      )}
    </search>
  )
}
