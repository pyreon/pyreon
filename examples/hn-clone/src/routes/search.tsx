import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { useUrlState } from '@pyreon/url-state'
import { useI18n } from '@pyreon/i18n'
import {
  useDebouncedValue,
  useEventListener,
  useFocus,
  usePrevious,
} from '@pyreon/hooks'
import { signal, computed } from '@pyreon/reactivity'
import {
  filter,
  search as rxSearch,
  groupBy,
  take,
  uniqBy,
  count,
} from '@pyreon/rx'
import StoryRow from '../components/StoryRow'
import { fetchFeed, type Story } from '../lib/api'

/**
 * Search page — heavy `@pyreon/rx` + `@pyreon/hooks` integration.
 *
 * Pipeline:
 *  1. Fetch top 5 pages of stories (~150 items) via @pyreon/query
 *  2. URL-sync the search query via @pyreon/url-state
 *  3. Debounce keystrokes (300ms) via @pyreon/hooks
 *  4. @pyreon/rx: search → filter → sortBy → take
 *  5. Group hits by domain via @pyreon/rx for the sidebar facets
 *  6. Count unique authors via @pyreon/rx
 *
 * Note on rx API: each operator (filter, sortBy, groupBy, search) takes
 * `source` as its first arg (not curried for pipe). Returns a Computed
 * when the source is a signal; chain them by reading one's result into
 * the next. Pyreon's `pipe(source, f1, f2)` composes plain functions
 * (each `(value) => newValue`); it does NOT take curried operators.
 */
export default function SearchPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.search')} — Hacker News (Pyreon)` }))

  // URL-synced search query — shareable URL with ?q=...
  const q = useUrlState('q', '')
  // Debounce the URL signal — typing shouldn't re-filter on every keystroke.
  const debouncedQ = useDebouncedValue(q, 300)

  // Sort mode signal — local UI only (not URL synced).
  const sortMode = signal<'relevance' | 'points' | 'recent'>('relevance')

  // Track previous query for "your search changed" UX (hooks.usePrevious).
  const previousQ = usePrevious(debouncedQ)

  // Focus tracking for the input — `focused()` true while focused.
  // `useFocus()` returns `{ focused, props: { onFocus, onBlur } }`; spread
  // the props onto the input to wire it up.
  const { focused, props: focusProps } = useFocus()

  // Fetch top 5 pages of news for the search corpus.
  const query = useQuery(() => ({
    queryKey: ['search-corpus', 'news'],
    queryFn: async () => {
      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map((p) => fetchFeed('news', p)),
      )
      return pages.flat()
    },
    staleTime: 5 * 60 * 1000,
  }))

  // ── Rx-driven computed chain ───────────────────────────────────────────
  // Each rx operator returns a Computed when its source is a signal.
  // We read each step's result into the next via signal accessors.
  const stories = computed<Story[]>(() => query.data() ?? [])

  // `search(source, query, keys)` — full-text across title + domain.
  const hits = rxSearch(stories, debouncedQ, ['title', 'domain'])

  // `filter(source, predicate)` — drop job posts from search results.
  const onlyStories = filter(hits as never, (s: Story) => s.type !== 'job')

  // `sortBy(source, ...keys)` — sort by points descending OR time descending.
  // We compute this in a Pyreon `computed()` so the sort key can be reactive
  // (depends on sortMode).
  const sorted = computed<Story[]>(() => {
    const arr = (onlyStories as never as () => Story[])()
    const mode = sortMode()
    if (mode === 'points')
      return [...arr].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    if (mode === 'recent') return [...arr].sort((a, b) => b.time - a.time)
    return arr
  })

  // `take(source, n)` — cap to 50 results.
  const finalResults = take(sorted as never, 50)

  // `groupBy(source, key)` — facet hits by domain for the sidebar.
  const domainFacets = groupBy(
    hits as never,
    (s: Story) => s.domain ?? 'no-domain',
  )

  // `uniqBy(source, key)` + `count(source)` — distinct authors. We pass a
  // key-extractor function; rx supports `KeyOf<T>` for nested keys but a
  // function is the most explicit form for non-trivial types.
  const uniqueAuthors = uniqBy(
    computed<Story[]>(() =>
      (hits as never as () => Story[])().filter((s) => s.user),
    ) as never,
    ((s: Story) => s.user ?? '') as never,
  )
  const uniqueAuthorCount = count(uniqueAuthors as never)

  // ── Keyboard shortcuts on the search input ─────────────────────────────
  // useEventListener(event, handler, options, target) — target is the 4th
  // positional arg; we default to window so DOM-level keydown is captured.
  useEventListener('keydown', (e) => {
    if (!focused()) return
    if (e.key === 'Escape') {
      q.set('')
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      const first = (finalResults as never as () => Story[])()[0]
      if (first) {
        window.location.href = first.url.startsWith('http')
          ? first.url
          : `/item/${first.id}`
      }
    }
  })

  return (
    <section class="search-page">
      <header class="search-header">
        <input
          type="search"
          class="search-input"
          placeholder={() => t('search.placeholder')}
          value={q}
          onInput={(e) => q.set((e.currentTarget as HTMLInputElement).value)}
          onFocus={focusProps.onFocus}
          onBlur={focusProps.onBlur}
          autoFocus
        />
        <div class="search-meta">
          {() => {
            const all = (finalResults as never as () => Story[])() ?? []
            const totalHits = ((hits as never as () => Story[])() ?? []).length
            const authorCount = (uniqueAuthorCount as never as () => number)() ?? 0
            const n = all.length
            return (
              <>
                <span>
                  {t(n === 1 ? 'search.results_one' : 'search.results_other', { n })}{' '}
                  / {totalHits} total · {authorCount} authors
                </span>
                {() =>
                  focused() ? (
                    <span class="kbd-hint">
                      <kbd>Esc</kbd> clear · <kbd>⌘ Enter</kbd> open first
                    </span>
                  ) : null
                }
              </>
            )
          }}
        </div>

        <div class="search-sort">
          <label>
            <input
              type="radio"
              name="sort"
              checked={() => sortMode() === 'relevance'}
              onChange={() => sortMode.set('relevance')}
            />
            Relevance
          </label>
          <label>
            <input
              type="radio"
              name="sort"
              checked={() => sortMode() === 'points'}
              onChange={() => sortMode.set('points')}
            />
            Points
          </label>
          <label>
            <input
              type="radio"
              name="sort"
              checked={() => sortMode() === 'recent'}
              onChange={() => sortMode.set('recent')}
            />
            Recent
          </label>
        </div>
      </header>

      <div class="search-results">
        {() => {
          if (query.isPending()) return <div class="feed-state">{t('feed.loading')}</div>
          if (query.isError())
            return <div class="feed-state error">{String(query.error())}</div>
          const results = ((finalResults as never as () => Story[])() ?? []) as Story[]
          if (debouncedQ() && results.length === 0) {
            const prev = previousQ()
            return (
              <div class="feed-state">
                No results for "{debouncedQ()}".
                {prev && prev !== debouncedQ() && (
                  <span class="prev-search"> (Previous: "{prev}")</span>
                )}
              </div>
            )
          }
          return (
            <ol class="story-list">
              {results.map((s, i) => (
                <StoryRow story={s} rank={i + 1} />
              ))}
            </ol>
          )
        }}
      </div>

      <aside class="search-facets">
        <h3>Domains</h3>
        {() => {
          const grouped = (domainFacets as never as () => Record<string, Story[]>)() ?? {}
          const entries = Object.entries(grouped)
            .map(([domain, items]) => ({ domain, count: items.length }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
          if (entries.length === 0) return <div class="feed-state-small">No domains yet.</div>
          return (
            <ul class="facet-list">
              {entries.map((f) => (
                <li class="facet-item">
                  <span class="facet-name">{f.domain}</span>
                  <span class="facet-count">{f.count}</span>
                </li>
              ))}
            </ul>
          )
        }}
      </aside>
    </section>
  )
}
