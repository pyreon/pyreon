// ─── TanStack Query core re-exports ──────────────────────────────────────────
// Users can import QueryClient, dehydrate, etc. from @pyreon/query directly.

export {
  QueryClient,
  QueryCache,
  MutationCache,
  dehydrate,
  hydrate,
  defaultShouldDehydrateQuery,
  defaultShouldDehydrateMutation,
  keepPreviousData,
  hashKey,
  isCancelledError,
  CancelledError,
} from "@tanstack/query-core"

export type {
  QueryKey,
  QueryFilters,
  MutationFilters,
  DehydratedState,
  FetchQueryOptions,
  InvalidateQueryFilters,
  InvalidateOptions,
  RefetchQueryFilters,
  RefetchOptions,
  QueryClientConfig,
} from "@tanstack/query-core"

// ─── Pyreon adapter ─────────────────────────────────────────────────────────────

export { QueryClientContext, QueryClientProvider, useQueryClient } from "./query-client"
export type { QueryClientProviderProps } from "./query-client"

export { useQuery } from "./use-query"
export type { UseQueryResult } from "./use-query"

export { useMutation } from "./use-mutation"
export type { UseMutationResult } from "./use-mutation"

export { useInfiniteQuery } from "./use-infinite-query"
export type { UseInfiniteQueryResult } from "./use-infinite-query"

export { useIsFetching, useIsMutating } from "./use-is-fetching"

export { useQueries } from "./use-queries"
export type { UseQueriesOptions } from "./use-queries"

export { useSuspenseQuery, useSuspenseInfiniteQuery, QuerySuspense } from "./use-suspense-query"
export type {
  UseSuspenseQueryResult,
  UseSuspenseInfiniteQueryResult,
  QuerySuspenseProps,
} from "./use-suspense-query"

export { QueryErrorResetBoundary, useQueryErrorResetBoundary } from "./use-query-error-reset-boundary"
export type { QueryErrorResetBoundaryProps } from "./use-query-error-reset-boundary"
