import { useQuery } from '@pyreon/query'
import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
// Everything table-related comes from `@pyreon/table` — it re-exports the
// table-core surface a table author needs, so it is the single supported
// import source (reaching into `@tanstack/table-core` directly risks a second
// copy of the library and bypasses the adapter's own exports).
import {
  type ColumnDef,
  type SortingState,
  type Table,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@pyreon/table'
import { signal, computed } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { groupBy } from '@pyreon/rx'
import { Link } from '@pyreon/zero/link'
import { fetchFeed, type Story } from '../lib/api'

/**
 * Leaderboard page — exercises `@pyreon/table` (TanStack Table adapter).
 *
 * Aggregates ~150 stories into a per-user leaderboard with reactive
 * sort + pagination. Click a column header to sort; click again to
 * reverse. Pagination shows 10 rows at a time.
 *
 * The data pipeline is a real one:
 *   useQuery → 5 pages of news → rx.groupBy by user → computed table
 *   data → useTable with sort/pagination row models.
 */
interface UserRow {
  user: string
  storyCount: number
  totalPoints: number
  avgPoints: number
  topStory: string
}

/**
 * v9 requires every non-core capability to be registered explicitly; this set
 * is exactly the two the page demonstrates — click-to-sort headers and the
 * 10-row pager. The core row model is automatic, so there is no slot for it.
 *
 * `sortFns` carries what `sortFn: 'auto'` resolves for the STRING columns
 * (`user`, `topStory`); the three numeric columns fall back to the built-in
 * basic comparator with nothing registered.
 *
 * Defined at module level so it is a stable reference across renders.
 */
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

export default function LeaderboardPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.leaderboard')} — Hacker News (Pyreon)` }))

  const query = useQuery(() => ({
    queryKey: ['leaderboard-corpus'],
    queryFn: async () => {
      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map((p) => fetchFeed('news', p)),
      )
      return pages.flat()
    },
    staleTime: 5 * 60 * 1000,
  }))

  // Aggregate via rx — same pipeline as /stats but reshape for table.
  const stories = computed<Story[]>(() => query.data() ?? [])
  const byUser = groupBy(
    stories as never,
    (s: Story) => s.user ?? '(anon)',
  )

  const tableData = computed<UserRow[]>(() => {
    const grouped = (byUser as never as () => Record<string, Story[]>)()
    return Object.entries(grouped).map(([user, items]) => {
      const totalPoints = items.reduce((a, b) => a + (b.points ?? 0), 0)
      const top = items.reduce(
        (best, cur) => ((cur.points ?? 0) > (best.points ?? 0) ? cur : best),
        items[0]!,
      )
      return {
        user,
        storyCount: items.length,
        totalPoints,
        avgPoints: Math.round(totalPoints / items.length),
        topStory: top.title,
      }
    })
  })

  const sorting = signal<SortingState>([{ id: 'totalPoints', desc: true }])

  const columns: ColumnDef<typeof features, UserRow>[] = [
    { accessorKey: 'user', header: 'User', cell: (i) => i.getValue<string>() },
    { accessorKey: 'storyCount', header: '# Stories', cell: (i) => i.getValue<number>() },
    { accessorKey: 'totalPoints', header: 'Total Points', cell: (i) => i.getValue<number>() },
    { accessorKey: 'avgPoints', header: 'Avg Points', cell: (i) => i.getValue<number>() },
    {
      accessorKey: 'topStory',
      header: 'Top Story',
      cell: (i) => i.getValue<string>().slice(0, 50),
    },
  ]

  const table = useTable(() => ({
    features,
    data: tableData(),
    columns,
    state: { sorting: sorting() },
    onSortingChange: (updater) => {
      sorting.set(typeof updater === 'function' ? updater(sorting.peek()) : updater)
    },
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  }))

  return (
    <section class="leaderboard-page">
      <header>
        <h1>{() => t('nav.leaderboard')}</h1>
        <p class="leaderboard-meta">
          {() =>
            query.isPending()
              ? t('feed.loading')
              : `${tableData().length} unique submitters`
          }
        </p>
      </header>

      {() =>
        query.isPending() ? (
          <div class="feed-state">{t('feed.loading')}</div>
        ) : (
          <LeaderboardTable table={table} />
        )
      }
    </section>
  )
}

// Render the table HEAD + BODY in a separate component. Pyreon's
// compiler binds a `<tr>`'s function-child via `_bindText` (which
// stringifies the value to `[object Object]` when the function
// returns an array of VNodes). Using `<For>` produces VNode children
// directly, sidestepping the text-bind path.
function LeaderboardTable(props: { table: Table<typeof features, UserRow> }) {
  return (
    <>
      <table class="leaderboard-table">
        <thead>
          <tr>
            <For
              each={() => props.table.getHeaderGroups()[0]?.headers ?? []}
              by={(h) => h.id}
            >
              {(h) => (
                // No structural cast needed: with `typeof features` on the
                // table type, `h` is a fully typed Header and the sorting APIs
                // below are present because `rowSortingFeature` is registered.
                <th
                  data-testid={`th-${h.column.id}`}
                  class={() => (h.column.getCanSort() ? 'sortable' : '')}
                  onClick={
                    h.column.getCanSort()
                      ? h.column.getToggleSortingHandler()
                      : undefined
                  }
                >
                  {String(h.column.columnDef.header)}
                  {() => {
                    const s = h.column.getIsSorted()
                    return s === 'asc' ? ' ▲' : s === 'desc' ? ' ▼' : ''
                  }}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={() => props.table.getRowModel().rows} by={(r) => r.id}>
            {(r) => (
              // `getAllCells()` is core. `getVisibleCells()` comes from
              // `columnVisibilityFeature`, which this page does not register
              // because it never hides a column — every column is visible, so
              // the two render identically here.
              <tr data-testid={`row-${r.original.user}`}>
                {r.getAllCells().map((cell) =>
                  cell.column.id === 'user' ? (
                    <td>
                      <Link href={`/user/${r.original.user}`} class="story-user">
                        {String(cell.getValue())}
                      </Link>
                    </td>
                  ) : (
                    <td>{String(cell.getValue())}</td>
                  ),
                )}
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <div class="leaderboard-pagination">
        <button
          type="button"
          onClick={() => props.table.previousPage()}
          disabled={() => !props.table.getCanPreviousPage()}
        >
          ‹ prev
        </button>
        <span>
          {() => {
            const p = props.table.store.state.pagination.pageIndex + 1
            const total = props.table.getPageCount()
            return `Page ${p} of ${total}`
          }}
        </span>
        <button
          type="button"
          onClick={() => props.table.nextPage()}
          disabled={() => !props.table.getCanNextPage()}
        >
          next ›
        </button>
      </div>
    </>
  )
}
