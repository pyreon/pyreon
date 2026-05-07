import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, signal } from '@pyreon/reactivity'
import type {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserverOptions,
  InfiniteQueryObserverResult,
  QueryKey,
  QueryObserverResult,
} from '@tanstack/query-core'
import { InfiniteQueryObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

const __DEV__: boolean = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface UseInfiniteQueryResult<TQueryFnData, TError = DefaultError> {
  /** Raw signal — full observer result. */
  result: Signal<InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>>
  data: Signal<InfiniteData<TQueryFnData> | undefined>
  error: Signal<TError | null>
  status: Signal<'pending' | 'error' | 'success'>
  isPending: Signal<boolean>
  isLoading: Signal<boolean>
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

/**
 * Subscribe to a paginated / infinite-scroll query.
 * Returns fine-grained reactive signals plus `fetchNextPage`, `fetchPreviousPage`,
 * `hasNextPage` and `hasPreviousPage`.
 *
 * @example
 * const query = useInfiniteQuery(() => ({
 *   queryKey: ['posts'],
 *   queryFn: ({ pageParam }) => fetchPosts(pageParam as number),
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * }))
 * // query.data()?.pages  — array of pages
 * // h('button', { onClick: () => query.fetchNextPage() }, 'Load more')
 */
export function useInfiniteQuery<
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
): UseInfiniteQueryResult<TQueryFnData, TError> {
  // Mount-N baseline — pairs with useQuery / useSuspenseQuery on the same name.
  if (__DEV__) _countSink.__pyreon_count__?.('query.useQuery')

  const client = useQueryClient()
  const observer = new InfiniteQueryObserver<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >(client, options())

  // Lazy signal slots — see use-query.ts for the pattern + rationale. Apps
  // typically read 1-2 of the 13 fields, so 13 eager allocations + 13 writes
  // per cache update was wasteful.
  type Result = InfiniteQueryObserverResult<InfiniteData<TQueryFnData>, TError>
  const slots: {
    result?: Signal<Result>
    data?: Signal<InfiniteData<TQueryFnData> | undefined>
    error?: Signal<TError | null>
    status?: Signal<'pending' | 'error' | 'success'>
    isPending?: Signal<boolean>
    isLoading?: Signal<boolean>
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
      if (slots.data) slots.data.set(r.data)
      if (slots.error) slots.error.set(r.error ?? null)
      if (slots.status) slots.status.set(r.status)
      if (slots.isPending) slots.isPending.set(r.isPending)
      if (slots.isLoading) slots.isLoading.set(r.isLoading)
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
      return (slots.data ??= signal<InfiniteData<TQueryFnData> | undefined>(
        observer.getCurrentResult().data,
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
    get isPending() {
      return (slots.isPending ??= signal(observer.getCurrentResult().isPending))
    },
    get isLoading() {
      return (slots.isLoading ??= signal(observer.getCurrentResult().isLoading))
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
