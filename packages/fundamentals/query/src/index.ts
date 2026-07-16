// ─── TanStack Query core re-exports ──────────────────────────────────────────
// Users can import QueryClient, dehydrate, etc. from @pyreon/query directly.

export type {
  DefaultError,
  DehydratedState,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  HydrateOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  Mutation,
  MutationFilters,
  MutationState,
  QueryClientConfig,
  QueryFilters,
  QueryKey,
  QueryState,
  RefetchOptions,
  RefetchQueryFilters,
} from '@tanstack/query-core'
export {
  CancelledError,
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  dehydrate,
  // Observer classes — for advanced consumers that drive query-core directly.
  focusManager,
  hashKey,
  hydrate,
  InfiniteQueryObserver,
  isCancelledError,
  isServer,
  keepPreviousData,
  // Cache-key / structural-sharing utilities used across the TanStack ecosystem.
  matchMutation,
  matchQuery,
  MutationCache,
  // Re-exported query-core class; the name collides with the DOM `MutationObserver`
  // global, which `no-window-in-ssr` flags — this is a re-export binding, not a global use.
  // pyreon-lint-disable-next-line pyreon/no-window-in-ssr
  MutationObserver,
  notifyManager,
  onlineManager,
  QueriesObserver,
  QueryCache,
  QueryClient,
  QueryObserver,
  replaceEqualDeep,
  // v5 sentinel: type-safe way to disable a query (`queryFn: skipToken`).
  skipToken,
} from '@tanstack/query-core'

// ─── Pyreon adapter ─────────────────────────────────────────────────────────────

export type { QueryClientProviderProps } from './query-client'
export { QueryClientContext, QueryClientProvider, useQueryClient } from './query-client'
export type { HydrationBoundaryProps } from './hydration-boundary'
export { HydrationBoundary } from './hydration-boundary'
export type { IsRestoringProviderProps } from './is-restoring'
export { IsRestoringProvider, useIsRestoring } from './is-restoring'
export type { UseInfiniteQueryResult } from './use-infinite-query'
export { useInfiniteQuery } from './use-infinite-query'
export { useIsFetching, useIsMutating } from './use-is-fetching'
export { defineQueries } from './define-queries'
export type { MutationOptions, UseMutationResult } from './use-mutation'
export { useMutation } from './use-mutation'
export type { UseMutationStateOptions } from './use-mutation-state'
export { useMutationState } from './use-mutation-state'
export type { UseQueriesOptions } from './use-queries'
export { useQueries } from './use-queries'
export { usePrefetchInfiniteQuery, usePrefetchQuery } from './use-prefetch'
export type { UseQueryResult } from './use-query'
export { useQuery } from './use-query'
export type { QueryData, QueryError } from './type-helpers'
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
  UseSuspenseQueriesResult,
  UseSuspenseQueryResult,
} from './use-suspense-query'
export {
  QuerySuspense,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from './use-suspense-query'
