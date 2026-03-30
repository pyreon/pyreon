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
  const dataSig = signal<InfiniteData<TQueryFnData> | undefined>(initial.data)
  const errorSig = signal<TError | null>(initial.error ?? null)
  const statusSig = signal(initial.status)
  const isPending = signal(initial.isPending)
  const isLoading = signal(initial.isLoading)
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
      dataSig.set(r.data)
      errorSig.set(r.error ?? null)
      statusSig.set(r.status)
      isPending.set(r.isPending)
      isLoading.set(r.isLoading)
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
    isPending,
    isLoading,
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
