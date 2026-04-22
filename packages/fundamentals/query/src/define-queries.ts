import type { DefaultError, QueryKey, QueryObserverOptions } from '@tanstack/query-core'
import type { UseQueryResult } from './use-query'
import { useQuery } from './use-query'

/**
 * Run multiple named queries in parallel from a single declaration.
 * Returns a typed object of query results instead of an array.
 *
 * @example
 * ```ts
 * const { user, posts } = defineQueries(() => ({
 *   user: { queryKey: ['user', userId()], queryFn: fetchUser },
 *   posts: { queryKey: ['posts'], queryFn: fetchPosts },
 * }))
 *
 * // user.data() — Signal<User | undefined>
 * // posts.isFetching() — Signal<boolean>
 * ```
 */
export function defineQueries<
  T extends Record<
    string,
    () => QueryObserverOptions<any, any, any, any, QueryKey>
  >,
>(
  queries: T,
): {
  [K in keyof T]: UseQueryResult<
    T[K] extends () => QueryObserverOptions<infer TData, any, any, any, any> ? TData : unknown,
    T[K] extends () => QueryObserverOptions<any, infer TError, any, any, any> ? TError : DefaultError
  >
} {
  const result: Record<string, UseQueryResult<unknown>> = {}
  for (const [key, optsFn] of Object.entries(queries)) {
    result[key] = useQuery(optsFn)
  }
  return result as any
}
