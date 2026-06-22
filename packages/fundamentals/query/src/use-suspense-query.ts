import type { VNodeChild, VNodeChildAtom } from '@pyreon/core'
import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, signal } from '@pyreon/reactivity'
import type {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserverOptions,
  InfiniteQueryObserverResult,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core'
import { InfiniteQueryObserver, QueriesObserver, QueryObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'
import { makeResultProto } from './result-proto'
import type { UseQueriesOptions } from './use-queries'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Like `UseQueryResult` but `data` is `Signal<TData>` (never undefined).
 * Only use inside a `QuerySuspense` boundary which guarantees the query has
 * succeeded before children are rendered.
 */
export interface UseSuspenseQueryResult<TData, TError = DefaultError> {
  result: Signal<QueryObserverResult<TData, TError>>
  /** Always TData — never undefined inside a QuerySuspense boundary. */
  data: Signal<TData>
  error: Signal<TError | null>
  status: Signal<'pending' | 'error' | 'success'>
  isPending: Signal<boolean>
  isFetching: Signal<boolean>
  isError: Signal<boolean>
  isSuccess: Signal<boolean>
  refetch: () => Promise<QueryObserverResult<TData, TError>>
}

export interface UseSuspenseInfiniteQueryResult<TQueryFnData, TError = DefaultError> {
  result: Signal<InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>>
  /** Always InfiniteData<TQueryFnData> — never undefined inside a QuerySuspense boundary. */
  data: Signal<InfiniteData<TQueryFnData>>
  error: Signal<TError | null>
  status: Signal<'pending' | 'error' | 'success'>
  isFetching: Signal<boolean>
  isFetchingNextPage: Signal<boolean>
  isFetchingPreviousPage: Signal<boolean>
  isError: Signal<boolean>
  isSuccess: Signal<boolean>
  hasNextPage: Signal<boolean>
  hasPreviousPage: Signal<boolean>
  fetchNextPage: () => Promise<InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>>
  fetchPreviousPage: () => Promise<InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>>
  refetch: () => Promise<QueryObserverResult<InfiniteData<TQueryFnData>, TError>>
}

// Shared result prototypes — accessor getters live here (one allocation, module
// init) instead of per-call closures in object literals (which also forced the
// results into V8 dictionary mode). See result-proto.ts. The fetch/refetch
// methods stay as own arrow closures (detachment-safe).
const SuspenseQueryResultProto = makeResultProto<QueryObserverResult<unknown, unknown>>({
  result: (c) => c,
  data: (c) => c.data,
  error: (c) => c.error ?? null,
  status: (c) => c.status,
  isPending: (c) => c.isPending,
  isFetching: (c) => c.isFetching,
  isError: (c) => c.isError,
  isSuccess: (c) => c.isSuccess,
})
const SuspenseInfiniteQueryResultProto = makeResultProto<
  InfiniteQueryObserverResult<InfiniteData<unknown>, unknown>
>({
  result: (c) => c,
  data: (c) => c.data,
  error: (c) => c.error ?? null,
  status: (c) => c.status,
  isFetching: (c) => c.isFetching,
  isFetchingNextPage: (c) => c.isFetchingNextPage,
  isFetchingPreviousPage: (c) => c.isFetchingPreviousPage,
  isError: (c) => c.isError,
  isSuccess: (c) => c.isSuccess,
  hasNextPage: (c) => c.hasNextPage,
  hasPreviousPage: (c) => c.hasPreviousPage,
})

// ─── QuerySuspense ──────────────────────────────────────────────────────────

type AnyQueryLike = {
  isPending: Signal<boolean>
  isError: Signal<boolean>
  error: Signal<unknown>
}

export interface QuerySuspenseProps {
  /**
   * A single query result (or array of them) to gate on.
   * Children only render when ALL queries have succeeded.
   */
  query: AnyQueryLike | AnyQueryLike[]
  /** Rendered while any query is pending. */
  fallback?: VNodeChild
  /** Rendered when any query has errored. Defaults to re-throwing to nearest ErrorBoundary. */
  error?: (err: unknown) => VNodeChild
  children: VNodeChild
}

/**
 * Pyreon-native Suspense boundary for queries. Shows `fallback` while any query
 * is pending. On error, renders the `error` fallback or re-throws to the
 * nearest Pyreon `ErrorBoundary`.
 *
 * Pair with `useSuspenseQuery` / `useSuspenseInfiniteQuery` to get non-undefined
 * `data` types inside children.
 *
 * @example
 * const userQuery = useSuspenseQuery(() => ({ queryKey: ['user'], queryFn: fetchUser }))
 *
 * h(QuerySuspense, {
 *   query: userQuery,
 *   fallback: h(Spinner, null),
 *   error: (err) => h('p', null, `Failed: ${err}`),
 * }, () => h(UserProfile, { user: userQuery.data() }))
 */
export function QuerySuspense(props: QuerySuspenseProps): VNodeChild {
  return (): VNodeChildAtom => {
    const queries = Array.isArray(props.query) ? props.query : [props.query]

    // Error state — use provided error fallback or re-throw to ErrorBoundary
    for (const q of queries) {
      if (q.isError()) {
        const err = q.error()
        if (props.error) {
          return props.error(err) as VNodeChildAtom
        }
        throw err
      }
    }

    // Pending state — show fallback
    if (queries.some((q) => q.isPending())) {
      const fb = props.fallback
      return (
        typeof fb === 'function' ? (fb as () => VNodeChildAtom)() : (fb ?? null)
      ) as VNodeChildAtom
    }

    // All success — render children
    const ch = props.children
    return (typeof ch === 'function' ? (ch as () => VNodeChildAtom)() : ch) as VNodeChildAtom
  }
}

// ─── useSuspenseQuery ───────────────────────────────────────────────────────

/**
 * Like `useQuery` but `data` is typed as `Signal<TData>` (never undefined).
 * Designed for use inside a `QuerySuspense` boundary, which guarantees
 * children only render after the query succeeds.
 *
 * @example
 * const user = useSuspenseQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))
 *
 * h(QuerySuspense, { query: user, fallback: h(Spinner, null) },
 *   () => h(UserCard, { name: user.data().name }),
 * )
 */
export function useSuspenseQuery<
  TData = unknown,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
>(
  options: () => QueryObserverOptions<TData, TError, TData, TData, TKey>,
): UseSuspenseQueryResult<TData, TError> {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useQuery')

  const client = useQueryClient()
  const observer = new QueryObserver<TData, TError, TData, TData, TKey>(client, options())

  // Lazy signal slots — see use-query.ts for the pattern.
  const slots: {
    result?: Signal<QueryObserverResult<TData, TError>>
    data?: Signal<TData>
    error?: Signal<TError | null>
    status?: Signal<'pending' | 'error' | 'success'>
    isPending?: Signal<boolean>
    isFetching?: Signal<boolean>
    isError?: Signal<boolean>
    isSuccess?: Signal<boolean>
  } = {}

  const unsub = observer.subscribe((r) => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.observerNotify')
    batch(() => {
      if (slots.result) slots.result.set(r)
      if (slots.data && r.data !== undefined) slots.data.set(r.data as TData)
      if (slots.error) slots.error.set(r.error ?? null)
      if (slots.status) slots.status.set(r.status)
      if (slots.isPending) slots.isPending.set(r.isPending)
      if (slots.isFetching) slots.isFetching.set(r.isFetching)
      if (slots.isError) slots.isError.set(r.isError)
      if (slots.isSuccess) slots.isSuccess.set(r.isSuccess)
    })
  })

  effect(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  const result = {
    _slots: slots,
    _observer: observer,
    refetch: () => observer.refetch(),
  }
  Object.setPrototypeOf(result, SuspenseQueryResultProto)
  return result as unknown as UseSuspenseQueryResult<TData, TError>
}

// ─── useSuspenseInfiniteQuery ───────────────────────────────────────────────

/**
 * Like `useInfiniteQuery` but `data` is typed as `Signal<InfiniteData<TData>>`
 * (never undefined). Use inside a `QuerySuspense` boundary.
 */
export function useSuspenseInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => InfiniteQueryObserverOptions<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >,
): UseSuspenseInfiniteQueryResult<TQueryFnData, TError> {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useQuery')

  const client = useQueryClient()
  const observer = new InfiniteQueryObserver<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >(client, options())

  // Lazy signal slots — see use-query.ts for the pattern.
  type Result = InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>
  const slots: {
    result?: Signal<Result>
    data?: Signal<InfiniteData<TQueryFnData>>
    error?: Signal<TError | null>
    status?: Signal<'pending' | 'error' | 'success'>
    isFetching?: Signal<boolean>
    isFetchingNextPage?: Signal<boolean>
    isFetchingPreviousPage?: Signal<boolean>
    isError?: Signal<boolean>
    isSuccess?: Signal<boolean>
    hasNextPage?: Signal<boolean>
    hasPreviousPage?: Signal<boolean>
  } = {}

  const unsub = observer.subscribe((r) => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.observerNotify')
    batch(() => {
      if (slots.result) slots.result.set(r)
      if (slots.data && r.data !== undefined) slots.data.set(r.data)
      if (slots.error) slots.error.set(r.error ?? null)
      if (slots.status) slots.status.set(r.status)
      if (slots.isFetching) slots.isFetching.set(r.isFetching)
      if (slots.isFetchingNextPage) slots.isFetchingNextPage.set(r.isFetchingNextPage)
      if (slots.isFetchingPreviousPage) slots.isFetchingPreviousPage.set(r.isFetchingPreviousPage)
      if (slots.isError) slots.isError.set(r.isError)
      if (slots.isSuccess) slots.isSuccess.set(r.isSuccess)
      if (slots.hasNextPage) slots.hasNextPage.set(r.hasNextPage)
      if (slots.hasPreviousPage) slots.hasPreviousPage.set(r.hasPreviousPage)
    })
  })

  effect(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  const result = {
    _slots: slots,
    _observer: observer,
    fetchNextPage: () => observer.fetchNextPage(),
    fetchPreviousPage: () => observer.fetchPreviousPage(),
    refetch: () => observer.refetch(),
  }
  Object.setPrototypeOf(result, SuspenseInfiniteQueryResultProto)
  return result as unknown as UseSuspenseInfiniteQueryResult<TQueryFnData, TError>
}

// ─── useSuspenseQueries ─────────────────────────────────────────────────────

/**
 * The result of {@link useSuspenseQueries}. It is itself a valid `AnyQueryLike`
 * (carries `isPending` / `isError` / `error`), so it can be passed straight to
 * `QuerySuspense` as the gate — children render only once EVERY query has
 * succeeded, at which point `data` is the array of (never-undefined) results.
 */
export interface UseSuspenseQueriesResult<TData = unknown, TError = DefaultError> {
  /** Per-query results, index-aligned with the `queries` array. */
  results: Signal<QueryObserverResult<TData, TError>[]>
  /** All queries' data, index-aligned — never undefined inside a QuerySuspense. */
  data: Signal<TData[]>
  /** True while ANY query is pending (the QuerySuspense gate). */
  isPending: Signal<boolean>
  /** True if ANY query errored (the QuerySuspense gate). */
  isError: Signal<boolean>
  /** First error encountered across the queries, or null. */
  error: Signal<TError | null>
}

/**
 * Like `useQueries` but shaped for a `QuerySuspense` boundary: aggregates the
 * array of queries into one query-like (`isPending` = any pending, `isError` =
 * any errored, `error` = first error) plus a `data` array. Pass the whole
 * result as the `query` of a `QuerySuspense` — children render only after every
 * query succeeds, so `data()` is fully populated (mirrors TanStack's
 * `useSuspenseQueries`).
 *
 * `queries` is reactive (signal-driven keys re-evaluate automatically).
 *
 * @example
 * const users = useSuspenseQueries(() =>
 *   ids().map((id) => ({ queryKey: ['user', id], queryFn: () => fetchUser(id) })),
 * )
 * h(QuerySuspense, { query: users, fallback: h(Spinner, null) },
 *   () => h(UserList, { users: users.data() }),
 * )
 */
export function useSuspenseQueries<TData = unknown, TError = DefaultError>(
  queries: () => UseQueriesOptions[],
): UseSuspenseQueriesResult<TData, TError> {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useQuery')

  const client = useQueryClient()
  const observer = new QueriesObserver(client, queries())

  const seed = observer.getCurrentResult() as readonly QueryObserverResult[]
  const results = signal(seed as QueryObserverResult[]) as Signal<
    QueryObserverResult<TData, TError>[]
  >
  const data = signal(seed.map((r) => r.data as TData))
  const isPending = signal(seed.some((r) => r.isPending))
  const isError = signal(seed.some((r) => r.isError))
  const error = signal((seed.find((r) => r.isError)?.error ?? null) as TError | null)

  const apply = (r: readonly QueryObserverResult[]): void => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.observerNotify')
    batch(() => {
      results.set(r as QueryObserverResult<TData, TError>[])
      data.set(r.map((x) => x.data as TData))
      isPending.set(r.some((x) => x.isPending))
      isError.set(r.some((x) => x.isError))
      error.set((r.find((x) => x.isError)?.error ?? null) as TError | null)
    })
  }

  const unsub = observer.subscribe((r: readonly QueryObserverResult[]) => apply(r))

  effect(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    observer.setQueries(queries())
  })

  onUnmount(() => {
    unsub()
    observer.destroy()
  })

  return { results, data, isPending, isError, error }
}
