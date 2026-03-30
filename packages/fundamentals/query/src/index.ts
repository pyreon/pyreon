// ─── TanStack Query core re-exports ──────────────────────────────────────────
// Users can import QueryClient, dehydrate, etc. from @pyreon/query directly.

export type {
  DehydratedState,
  FetchQueryOptions,
  InvalidateOptions,
  InvalidateQueryFilters,
  MutationFilters,
  QueryClientConfig,
  QueryFilters,
  QueryKey,
  RefetchOptions,
  RefetchQueryFilters,
} from '@tanstack/query-core'
export {
  CancelledError,
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  dehydrate,
  hashKey,
  hydrate,
  isCancelledError,
  keepPreviousData,
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/query-core'

// ─── Pyreon adapter ─────────────────────────────────────────────────────────────

export type { QueryClientProviderProps } from './query-client'
export { QueryClientContext, QueryClientProvider, useQueryClient } from './query-client'
export type { UseInfiniteQueryResult } from './use-infinite-query'
export { useInfiniteQuery } from './use-infinite-query'
export { useIsFetching, useIsMutating } from './use-is-fetching'
export type { UseMutationResult } from './use-mutation'
export { useMutation } from './use-mutation'
export type { UseQueriesOptions } from './use-queries'
export { useQueries } from './use-queries'
export type { UseQueryResult } from './use-query'
export { useQuery } from './use-query'
export type { QueryErrorResetBoundaryProps } from './use-query-error-reset-boundary'
export {
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from './use-query-error-reset-boundary'
export type { SSEStatus, UseSSEOptions, UseSSEResult } from './use-sse'
export { useSSE } from './use-sse'
export type {
  SubscriptionStatus,
  UseSubscriptionOptions,
  UseSubscriptionResult,
} from './use-subscription'
export { useSubscription } from './use-subscription'
export type {
  QuerySuspenseProps,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryResult,
} from './use-suspense-query'
export { QuerySuspense, useSuspenseInfiniteQuery, useSuspenseQuery } from './use-suspense-query'
