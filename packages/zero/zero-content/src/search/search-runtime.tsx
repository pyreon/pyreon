import { signal, computed } from '@pyreon/reactivity'
import { onMount, onUnmount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { RouterLink } from '@pyreon/router'
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

// Shared with the build-time `search/index-builder.ts` — MiniSearch's
// `loadJSON` requires runtime options to MATCH the indexed-time ones
// on `fields` / `storeFields` / `searchOptions` so document refs and
// scoring stay consistent. Pre-fix (PR-A audit L12) these existed twice
// inline; structurally locked here.
import { MINISEARCH_OPTIONS as MS_OPTIONS } from '../_shared/minisearch-options'

/**
 * Lazy-loaded MiniSearch instance.
 *
 * Pre-fix (PR-D audit H9) the cache was module-scope `let _instance`
 * that pinned ~200 KB worth of MiniSearch state for the app lifetime
 * even if `<Search>` was unmounted. Now the cache lives keyed on the
 * catalog URL — and reference-counted via `_subscribers`. When the
 * last subscriber unmounts, the instance is released so a long-lived
 * SPA without a header `<Search>` reclaims the memory.
 */
let _instance: MiniSearch | null = null
let _loading: Promise<MiniSearch> | null = null
let _instanceUrl: string | null = null
let _subscribers = 0

/**
 * Reset the cached MiniSearch instance. Test-only.
 *
 * @internal exported for testing
 */
export function _resetSearchForTesting(): void {
  _instance = null
  _loading = null
  _instanceUrl = null
  _subscribers = 0
}

/**
 * Acquire a refcount on the cached search instance. Returns a release
 * callback the caller MUST invoke on unmount; when refcount hits zero
 * the instance is released.
 *
 * @internal
 */
function acquireSearchInstance(): () => void {
  _subscribers++
  let released = false
  return () => {
    if (released) return
    released = true
    _subscribers--
    if (_subscribers <= 0) {
      _instance = null
      _loading = null
      _instanceUrl = null
      _subscribers = 0
    }
  }
}

/**
 * Default catalog URL — prefixed with Vite's resolved `base` via
 * `import.meta.env.BASE_URL` (the standard Vite client global) so
 * subpath deploys (GitHub Pages preview, app-mounted-under-subdir)
 * fetch from the right path. Falls back to `/search-index.json` for
 * root deploys or environments where `import.meta.env` is undefined
 * (raw Node, some test runners).
 *
 * `BASE_URL` always has a trailing slash per Vite spec; we trim it so
 * the join produces exactly one slash.
 */
interface ViteEnvMeta {
  readonly env?: { readonly BASE_URL?: string }
}
function defaultCatalogUrl(): string {
  const base = (import.meta as ViteEnvMeta).env?.BASE_URL
  if (!base || base === '/' || base.length === 0) return '/search-index.json'
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/search-index.json`
}

/**
 * Load the search index lazily. Fetches the catalog, then each
 * per-collection chunk, and merges them into one MiniSearch. The
 * default `catalogUrl` is `/search-index.json`, prefixed with the
 * configured `__ZERO_BASE__` for subpath deploys.
 */
export async function loadSearchIndex(
  catalogUrl?: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<MiniSearch> {
  if (catalogUrl === undefined) catalogUrl = defaultCatalogUrl()
  if (_instance && _instanceUrl === catalogUrl) return _instance
  if (_loading && _instanceUrl === catalogUrl) return _loading
  _instanceUrl = catalogUrl
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
  /**
   * Minimum query length before the search fires. Default 2 — single
   * letters hit too broad a result set on docs-sized corpora. Set to
   * `1` for shorter sites or `3` for blogs that lean on exact-word
   * matches.
   *
   * PR-D audit M22 — pre-fix the runtime fired on every keystroke
   * including 1-char queries.
   */
  minQueryLength?: number
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
  const minQueryLength = Math.max(1, options.minQueryLength ?? 2)

  // Eagerly load on first open (don't wait for the first query).
  // The release callback is recorded via `acquireSearchInstance` on
  // mount so the module-level cache is reference-counted (PR-D audit
  // H9 — pre-fix the cached MiniSearch pinned ~200 KB module-scope).
  let indexPromise: Promise<MiniSearch> | null = null
  const ensureIndex = (): Promise<MiniSearch> => {
    if (!indexPromise) {
      indexPromise = loadSearchIndex(options.catalogUrl, options.fetchFn)
    }
    return indexPromise
  }

  const _results = signal<SearchResult[]>([])
  let queryRunCount = 0

  // PR-D audit C8 — pre-fix `debounced.subscribe(() => ...)` never
  // disposed. Every `useSearch()` call accumulated a subscriber that
  // outlived the component. Now we capture the unsub + run it from
  // `onMount`'s cleanup.
  onMount(() => {
    const releaseIndex = acquireSearchInstance()

    const unsubQuery = query.subscribe(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounced.set(query())
      }, debounceMs)
    })

    const unsubOpen = open.subscribe(() => {
      if (open()) void ensureIndex()
    })

    const unsubDebounced = debounced.subscribe(() => {
      const q = debounced().trim()
      if (q.length < minQueryLength) {
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

    return () => {
      unsubQuery()
      unsubOpen()
      unsubDebounced()
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      releaseIndex()
    }
  })

  // PR-D audit H9 — `_results` + `results` were duplicated computeds
  // (the inner `signal<SearchResult[]>` AND an outer `computed(() =>
  // _results())` that just unwrapped it). Collapsed to ONE — the
  // public `results` is now the `computed` directly so consumers
  // subscribe to the same tracking primitive.
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
  /** Minimum query length before search fires. Default 2. */
  minQueryLength?: number
}

export function Search(props: SearchProps): VNodeChild {
  const opts: UseSearchOptions = {
    debounceMs: props.debounceMs ?? 150,
    maxResults: props.maxResults ?? 8,
    minQueryLength: props.minQueryLength ?? 2,
  }
  if (props.catalogUrl !== undefined) opts.catalogUrl = props.catalogUrl
  const state = useSearch(opts)

  // PR-D audit M21 — focus management: capture the previously-focused
  // element on open, focus the input on open, restore the previous
  // focus on close. Keeps keyboard users from getting dumped to
  // `<body>` after a Cmd+K → Escape sequence.
  let lastFocused: HTMLElement | null = null
  let inputEl: HTMLInputElement | null = null

  // Keyboard shortcut wiring.
  const shortcut = props.shortcut ?? 'mod+k'
  onMount(() => {
    if (shortcut === 'none') return undefined
    const handler = (e: KeyboardEvent) => {
      const isMod = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey
      const wantKey = shortcut === 'mod+k' ? 'k' : '/'
      if (isMod && e.key === wantKey) {
        e.preventDefault()
        if (!state.open()) {
          // About to open — capture focus first.
          lastFocused = (document.activeElement as HTMLElement) ?? null
        } else {
          // About to close — restore previous focus next tick.
          queueMicrotask(() => lastFocused?.focus?.())
        }
        state.toggle()
      }
      if (e.key === 'Escape' && state.open()) {
        state.close()
        queueMicrotask(() => lastFocused?.focus?.())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Focus the input on open.
  onMount(() => {
    const unsub = state.open.subscribe(() => {
      if (state.open() && inputEl) {
        queueMicrotask(() => inputEl?.focus())
      }
    })
    return () => unsub()
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
              ref={(el: HTMLInputElement | null) => {
                inputEl = el
              }}
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
              onClick={() => {
                state.close()
                queueMicrotask(() => lastFocused?.focus?.())
              }}
            >
              Close
            </button>
            <ul class="pyreon-search__results">
              {() =>
                state.results().map((r) => (
                  <li class="pyreon-search__result">
                    {/* PR-D audit M20 — was a raw `<a href>` which
                        triggered a full page reload on every click.
                        `RouterLink` does SPA navigation, and we
                        close the overlay BEFORE the navigation push
                        so the surrounding `<dialog>` doesn't flicker
                        across the route change. */}
                    <RouterLink
                      to={String(r.url ?? '#')}
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
                    </RouterLink>
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
