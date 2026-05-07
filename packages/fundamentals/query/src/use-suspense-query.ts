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

const __DEV__: boolean = process.env.NODE_ENV !== 'production'

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
  if (__DEV__) _countSink.__pyreon_count__?.('query.useQuery')

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
    if (__DEV__) _countSink.__pyreon_count__?.('query.observerNotify')
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
    if (__DEV__) _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  return {
    get result() {
      return (slots.result ??= signal<QueryObserverResult<TData, TError>>(
        observer.getCurrentResult(),
      ))
    },
    get data() {
      return (slots.data ??= signal<TData>(observer.getCurrentResult().data as TData))
    },
    get error() {
      return (slots.error ??= signal<TError | null>(observer.getCurrentResult().error ?? null))
    },
    get status() {
      return (slots.status ??= signal<'pending' | 'error' | 'success'>(
        observer.getCurrentResult().status,
      ))
    },
    get isPending() {
      return (slots.isPending ??= signal(observer.getCurrentResult().isPending))
    },
    get isFetching() {
      return (slots.isFetching ??= signal(observer.getCurrentResult().isFetching))
    },
    get isError() {
      return (slots.isError ??= signal(observer.getCurrentResult().isError))
    },
    get isSuccess() {
      return (slots.isSuccess ??= signal(observer.getCurrentResult().isSuccess))
    },
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
  if (__DEV__) _countSink.__pyreon_count__?.('query.useQuery')

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
    if (__DEV__) _countSink.__pyreon_count__?.('query.observerNotify')
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
    if (__DEV__) _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })
  onUnmount(() => unsub())

  return {
    get result() {
      return (slots.result ??= signal<Result>(observer.getCurrentResult()))
    },
    get data() {
      return (slots.data ??= signal<InfiniteData<TQueryFnData>>(
        observer.getCurrentResult().data as InfiniteData<TQueryFnData>,
      ))
    },
    get error() {
      return (slots.error ??= signal<TError | null>(observer.getCurrentResult().error ?? null))
    },
    get status() {
      return (slots.status ??= signal<'pending' | 'error' | 'success'>(
        observer.getCurrentResult().status,
      ))
    },
    get isFetching() {
      return (slots.isFetching ??= signal(observer.getCurrentResult().isFetching))
    },
    get isFetchingNextPage() {
      return (slots.isFetchingNextPage ??= signal(observer.getCurrentResult().isFetchingNextPage))
    },
    get isFetchingPreviousPage() {
      return (slots.isFetchingPreviousPage ??= signal(
        observer.getCurrentResult().isFetchingPreviousPage,
      ))
    },
    get isError() {
      return (slots.isError ??= signal(observer.getCurrentResult().isError))
    },
    get isSuccess() {
      return (slots.isSuccess ??= signal(observer.getCurrentResult().isSuccess))
    },
    get hasNextPage() {
      return (slots.hasNextPage ??= signal(observer.getCurrentResult().hasNextPage))
    },
    get hasPreviousPage() {
      return (slots.hasPreviousPage ??= signal(observer.getCurrentResult().hasPreviousPage))
    },
    fetchNextPage: () => observer.fetchNextPage(),
    fetchPreviousPage: () => observer.fetchPreviousPage(),
    refetch: () => observer.refetch(),
  }
}
