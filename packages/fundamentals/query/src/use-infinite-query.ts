import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect } from '@pyreon/reactivity'
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
import { makeResultProto } from './result-proto'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Shared result prototype — the 13 accessor getters live here (one allocation,
// module init) instead of as per-call closures in an object literal (which also
// forced the result into V8 dictionary mode). See result-proto.ts. The three
// page-fetch methods stay as own arrow closures (detachment-safe).
const InfiniteQueryResultProto = makeResultProto<
  InfiniteQueryObserverResult<InfiniteData<unknown>, unknown>
>({
  result: (c) => c,
  data: (c) => c.data,
  error: (c) => c.error ?? null,
  status: (c) => c.status,
  isPending: (c) => c.isPending,
  isLoading: (c) => c.isLoading,
  isFetching: (c) => c.isFetching,
  isFetchingNextPage: (c) => c.isFetchingNextPage,
  isFetchingPreviousPage: (c) => c.isFetchingPreviousPage,
  isError: (c) => c.isError,
  isSuccess: (c) => c.isSuccess,
  hasNextPage: (c) => c.hasNextPage,
  hasPreviousPage: (c) => c.hasPreviousPage,
})

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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useQuery')

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
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.observerNotify')
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
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })

  onUnmount(() => unsub())

  // Shared getters-only prototype + own detachment-safe page-fetch arrows.
  // `slots`/`observer` are the same objects the subscribe callback writes to.
  const result = {
    _slots: slots,
    _observer: observer,
    fetchNextPage: () => observer.fetchNextPage(),
    fetchPreviousPage: () => observer.fetchPreviousPage(),
    refetch: () => observer.refetch(),
  }
  Object.setPrototypeOf(result, InfiniteQueryResultProto)
  return result as unknown as UseInfiniteQueryResult<TQueryFnData, TError>
}
