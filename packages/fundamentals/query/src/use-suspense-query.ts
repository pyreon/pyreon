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
import { InfiniteQueryObserver, QueryObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

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
  const client = useQueryClient()
  const observer = new QueryObserver<TData, TError, TData, TData, TKey>(client, options())
  const initial = observer.getCurrentResult()

  const resultSig = signal<QueryObserverResult<TData, TError>>(initial)
  const dataSig = signal<TData>(initial.data as TData)
  const errorSig = signal<TError | null>(initial.error ?? null)
  const statusSig = signal<'pending' | 'error' | 'success'>(initial.status)
  const isPending = signal(initial.isPending)
  const isFetching = signal(initial.isFetching)
  const isError = signal(initial.isError)
  const isSuccess = signal(initial.isSuccess)

  const unsub = observer.subscribe((r) => {
    batch(() => {
      resultSig.set(r)
      if (r.data !== undefined) dataSig.set(r.data as TData)
      errorSig.set(r.error ?? null)
      statusSig.set(r.status)
      isPending.set(r.isPending)
      isFetching.set(r.isFetching)
      isError.set(r.isError)
      isSuccess.set(r.isSuccess)
    })
  })

  effect(() => {
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  return {
    result: resultSig,
    data: dataSig,
    error: errorSig,
    status: statusSig,
    isPending,
    isFetching,
    isError,
    isSuccess,
    refetch: () => observer.refetch(),
  }
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
  const client = useQueryClient()
  const observer = new InfiniteQueryObserver<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >(client, options())
  const initial = observer.getCurrentResult()

  const resultSig = signal(initial)
  const dataSig = signal(initial.data as InfiniteData<TQueryFnData>)
  const errorSig = signal<TError | null>(initial.error ?? null)
  const statusSig = signal(initial.status)
  const isFetching = signal(initial.isFetching)
  const isFetchingNextPage = signal(initial.isFetchingNextPage)
  const isFetchingPreviousPage = signal(initial.isFetchingPreviousPage)
  const isError = signal(initial.isError)
  const isSuccess = signal(initial.isSuccess)
  const hasNextPage = signal(initial.hasNextPage)
  const hasPreviousPage = signal(initial.hasPreviousPage)

  const unsub = observer.subscribe((r) => {
    batch(() => {
      resultSig.set(r)
      if (r.data !== undefined) dataSig.set(r.data)
      errorSig.set(r.error ?? null)
      statusSig.set(r.status)
      isFetching.set(r.isFetching)
      isFetchingNextPage.set(r.isFetchingNextPage)
      isFetchingPreviousPage.set(r.isFetchingPreviousPage)
      isError.set(r.isError)
      isSuccess.set(r.isSuccess)
      hasNextPage.set(r.hasNextPage)
      hasPreviousPage.set(r.hasPreviousPage)
    })
  })

  effect(() => {
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  return {
    result: resultSig,
    data: dataSig,
    error: errorSig,
    status: statusSig,
    isFetching,
    isFetchingNextPage,
    isFetchingPreviousPage,
    isError,
    isSuccess,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage: () => observer.fetchNextPage(),
    fetchPreviousPage: () => observer.fetchPreviousPage(),
    refetch: () => observer.refetch(),
  }
}
