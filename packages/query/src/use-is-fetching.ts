import { onUnmount } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"
import type { MutationFilters, QueryFilters } from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

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
    count.set(client.isMutating(filters))
  })
  onUnmount(() => unsub())

  return count
}
