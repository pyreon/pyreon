import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import type { MutationFilters, QueryFilters } from '@tanstack/query-core'
import { useQueryClient } from './query-client'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Returns a signal that tracks how many queries are currently in-flight.
 * Useful for global loading indicators.
 *
 * @example
 * const fetching = useIsFetching()
 * // h('span', null, () => fetching() > 0 ? 'Loading…' : '')
 */
export function useIsFetching(filters?: QueryFilters): Signal<number> {
  const client = useQueryClient()
  const count = signal(client.isFetching(filters))

  const unsub = client.getQueryCache().subscribe(() => {
    // Per cache-event scan. `client.isFetching(filters)` walks every query in
    // the cache, so the counter grows with cacheEvents × cacheSize. High
    // values indicate the global counter is the dominant cost on update-heavy
    // pages.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.isFetchingScan')
    count.set(client.isFetching(filters))
  })
  onUnmount(() => unsub())

  return count
}

/**
 * Returns a signal that tracks how many mutations are currently in-flight.
 *
 * @example
 * const mutating = useIsMutating()
 * // h('span', null, () => mutating() > 0 ? 'Saving…' : '')
 */
export function useIsMutating(filters?: MutationFilters): Signal<number> {
  const client = useQueryClient()
  const count = signal(client.isMutating(filters))

  const unsub = client.getMutationCache().subscribe(() => {
    // Same scan-shape as useIsFetching but on the mutation cache. Same counter
    // — the dominant cost is the cache walk, not the cache type.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.isFetchingScan')
    count.set(client.isMutating(filters))
  })
  onUnmount(() => unsub())

  return count
}
