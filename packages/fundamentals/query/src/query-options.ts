import type { DataTag, DefaultError, InfiniteData, QueryKey } from '@tanstack/query-core'
import type { UseInfiniteQueryOptions } from './use-infinite-query'
import type { MutationOptions } from './use-mutation'
import type { UseQueryOptions } from './use-query'

/**
 * Declare a query's options once, typed, and reuse them everywhere: in
 * `useQuery`, `useSuspenseQuery`, `usePrefetchQuery`, and the imperative
 * `QueryClient` API (`fetchQuery`, `prefetchQuery`, `getQueryData`,
 * `setQueryData`, `ensureQueryData`).
 *
 * At runtime this returns `options` unchanged. Its value is the TYPE: the
 * returned `queryKey` carries the `queryFn` result and error types (TanStack's
 * `DataTag`), so `client.getQueryData(opts.queryKey)` is typed without a
 * hand-written generic.
 *
 * `useQuery` takes an options FUNCTION, so a factory that takes a signal's
 * value is the usual shape — the read inside the accessor keeps it reactive.
 *
 * @example
 * ```ts
 * const userQuery = (id: number) =>
 *   queryOptions({ queryKey: ['user', id], queryFn: () => fetchUser(id) })
 *
 * const user = useQuery(() => userQuery(userId()))
 * const cached = client.getQueryData(userQuery(1).queryKey) // User | undefined
 * ```
 */
export function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
} {
  return options as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    queryKey: DataTag<TQueryKey, TQueryFnData, TError>
  }
}

/**
 * The infinite-query counterpart of {@link queryOptions}: reuse one typed
 * declaration in `useInfiniteQuery`, `useSuspenseInfiniteQuery`,
 * `usePrefetchInfiniteQuery` and `client.fetchInfiniteQuery`. The returned
 * `queryKey` is tagged with `InfiniteData<TQueryFnData, TPageParam>`, so
 * `client.getQueryData(opts.queryKey)` returns the paged shape.
 *
 * @example
 * ```ts
 * const feed = infiniteQueryOptions({
 *   queryKey: ['feed'],
 *   queryFn: ({ pageParam }) => fetchPage(pageParam),
 *   initialPageParam: 0,
 *   getNextPageParam: (last) => last.next,
 * })
 * const q = useInfiniteQuery(() => feed)
 * ```
 */
export function infiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam>,
): UseInfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData, TPageParam>, TError>
} {
  return options as UseInfiniteQueryOptions<TQueryFnData, TError, TQueryKey, TPageParam> & {
    queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData, TPageParam>, TError>
  }
}

/**
 * Declare a mutation's options once, typed, and reuse them across
 * `useMutation` call sites — including Pyreon's `invalidates` shorthand.
 * Returns `options` unchanged; it exists so the variables / result / context
 * types are inferred at the declaration instead of at every use.
 *
 * @example
 * ```ts
 * const createPost = mutationOptions({
 *   mutationKey: ['createPost'],
 *   mutationFn: (input: NewPost) => api.posts.create(input),
 *   invalidates: [['posts']],
 * })
 * const mutation = useMutation(createPost)
 * ```
 */
export function mutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationOptions<TData, TError, TVariables, TContext> {
  return options
}
