/**
 * Type-level inference helpers for the Pyreon query adapter — "derive,
 * don't annotate twice". ZERO runtime bytes (types only).
 *
 * These unwrap the ADAPTER's result shapes (`UseQueryResult` & friends —
 * Pyreon's fine-grained signal bags, not TanStack's). For tagged query-key
 * inference TanStack's own `InferDataFromTag` (re-exportable from
 * `@tanstack/query-core`) already covers the upstream story — these helpers
 * deliberately do NOT duplicate it.
 */

import type { InfiniteData } from '@tanstack/query-core'
import type { UseInfiniteQueryResult } from './use-infinite-query'
import type { UseQueryResult } from './use-query'
import type {
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryResult,
} from './use-suspense-query'

/**
 * The RESOLVED data type of a query result — `Post[]` from
 * `UseQueryResult<Post[]>`, `InfiniteData<Page>` from an infinite result.
 * Never includes `undefined` (that's the loading-state artifact on the
 * `data` SIGNAL, not part of the resolved data shape).
 *
 * @example
 * ```ts
 * const posts = useQuery(() => ({ queryKey: ['posts'], queryFn: fetchPosts }))
 * type Posts = QueryData<typeof posts> // Post[]
 * ```
 */
export type QueryData<R> =
  R extends UseQueryResult<infer D, infer _E>
    ? D
    : R extends UseSuspenseQueryResult<infer D, infer _E>
      ? D
      : R extends UseInfiniteQueryResult<infer D, infer _E>
        ? InfiniteData<D>
        : R extends UseSuspenseInfiniteQueryResult<infer D, infer _E>
          ? InfiniteData<D>
          : never

/**
 * The ERROR type of a query result (the `TError` generic).
 *
 * @example
 * ```ts
 * type PostsError = QueryError<typeof posts> // Error (DefaultError unless narrowed)
 * ```
 */
export type QueryError<R> =
  R extends UseQueryResult<infer _D, infer E>
    ? E
    : R extends UseSuspenseQueryResult<infer _D, infer E>
      ? E
      : R extends UseInfiniteQueryResult<infer _D, infer E>
        ? E
        : R extends UseSuspenseInfiniteQueryResult<infer _D, infer E>
          ? E
          : never
