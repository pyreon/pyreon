import { onUnmount } from "@pyreon/core"
import { signal, effect, batch } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"
import { InfiniteQueryObserver } from "@tanstack/query-core"
import type {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserverOptions,
  InfiniteQueryObserverResult,
  QueryKey,
} from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

export interface UseInfiniteQueryResult<TData, TError = DefaultError> {
  /** Raw signal — full observer result. Fine-grained accessors below are preferred. */
  result: Signal<InfiniteQueryObserverResult<TData, TError>>
  data: Signal<InfiniteData<TData> | undefined>
  error: Signal<TError | null>
  status: Signal<"pending" | "error" | "success">
  isPending: Signal<boolean>
  isLoading: Signal<boolean>
  isFetching: Signal<boolean>
  isFetchingNextPage: Signal<boolean>
  isFetchingPreviousPage: Signal<boolean>
  isError: Signal<boolean>
  isSuccess: Signal<boolean>
  hasNextPage: Signal<boolean>
  hasPreviousPage: Signal<boolean>
  fetchNextPage: () => Promise<InfiniteQueryObserverResult<TData, TError>>
  fetchPreviousPage: () => Promise<InfiniteQueryObserverResult<TData, TError>>
  refetch: () => Promise<InfiniteQueryObserverResult<TData, TError>>
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
  TData = unknown,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => InfiniteQueryObserverOptions<TData, TError, InfiniteData<TData>, TData, TKey, TPageParam>,
): UseInfiniteQueryResult<TData, TError> {
  const client = useQueryClient()
  const observer = new InfiniteQueryObserver<TData, TError, InfiniteData<TData>, TData, TKey, TPageParam>(
    client,
    options(),
  )
  const initial = observer.getCurrentResult()

  // Fine-grained signals: each field is independent so only effects that read
  // e.g. `query.isFetchingNextPage()` re-run when that specific field changes.
  const resultSig             = signal<InfiniteQueryObserverResult<TData, TError>>(initial)
  const dataSig               = signal<InfiniteData<TData> | undefined>(initial.data)
  const errorSig              = signal<TError | null>(initial.error ?? null)
  const statusSig             = signal<"pending" | "error" | "success">(initial.status)
  const isPending             = signal(initial.isPending)
  const isLoading             = signal(initial.isLoading)
  const isFetching            = signal(initial.isFetching)
  const isFetchingNextPage    = signal(initial.isFetchingNextPage)
  const isFetchingPreviousPage = signal(initial.isFetchingPreviousPage)
  const isError               = signal(initial.isError)
  const isSuccess             = signal(initial.isSuccess)
  const hasNextPage           = signal(initial.hasNextPage)
  const hasPreviousPage       = signal(initial.hasPreviousPage)

  // batch() coalesces all signal updates into one notification flush.
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

  // Track reactive options: when signals inside options() change, update the observer.
  effect(() => { observer.setOptions(options()) })

  onUnmount(() => unsub())

  return {
    result:                resultSig,
    data:                  dataSig,
    error:                 errorSig,
    status:                statusSig,
    isPending,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isFetchingPreviousPage,
    isError,
    isSuccess,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage:         () => observer.fetchNextPage(),
    fetchPreviousPage:     () => observer.fetchPreviousPage(),
    refetch:               () => observer.refetch(),
  }
}
