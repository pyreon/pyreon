import type {
  DefaultError,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryKey,
} from '@tanstack/query-core'
import { useQueryClient } from './query-client'

/**
 * Prefetch a query during component setup so its data is warm before a child's
 * `useQuery` mounts (mirrors TanStack's `usePrefetchQuery`). Fire-and-forget,
 * returns nothing. Only prefetches when the key isn't already in the cache, so
 * it never re-fetches data the cache already has.
 *
 * `options` is a function for consistency with the other hooks (reads once at
 * setup). Pair with `useSuspenseQuery` in a child to avoid a loading flash.
 *
 * @example
 * usePrefetchQuery(() => ({ queryKey: ['user', id], queryFn: fetchUser }))
 */
export function usePrefetchQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TKey extends QueryKey = QueryKey,
>(options: () => FetchQueryOptions<TQueryFnData, TError, TData, TKey>): void {
  const client = useQueryClient()
  const opts = options()
  if (!client.getQueryState(opts.queryKey)) {
    void client.prefetchQuery(opts)
  }
}

/**
 * Infinite-query variant of {@link usePrefetchQuery} — mirrors TanStack's
 * `usePrefetchInfiniteQuery`.
 *
 * @example
 * usePrefetchInfiniteQuery(() => ({
 *   queryKey: ['feed'],
 *   queryFn: fetchPage,
 *   initialPageParam: 0,
 *   getNextPageParam: (last) => last.next,
 * }))
 */
export function usePrefetchInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => FetchInfiniteQueryOptions<TQueryFnData, TError, TData, TKey, TPageParam>,
): void {
  const client = useQueryClient()
  const opts = options()
  if (!client.getQueryState(opts.queryKey)) {
    void client.prefetchInfiniteQuery(opts)
  }
}
