import { onUnmount } from "@pyreon/core"
import { signal, effect } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"
import { QueriesObserver } from "@tanstack/query-core"
import type {
  DefaultError,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

export type UseQueriesOptions<TQueryKey extends QueryKey = QueryKey> = QueryObserverOptions<
  unknown,
  DefaultError,
  unknown,
  unknown,
  TQueryKey
>

/**
 * Subscribe to multiple queries in parallel. Returns a single signal containing
 * the array of results — index-aligned with the `queries` array.
 *
 * `queries` is a reactive function so signal-based keys trigger re-evaluation
 * automatically.
 *
 * @example
 * const userIds = signal([1, 2, 3])
 * const results = useQueries(() =>
 *   userIds().map(id => ({
 *     queryKey: ['user', id],
 *     queryFn: () => fetchUser(id),
 *   }))
 * )
 * // results() — QueryObserverResult[]
 * // results()[0].data — first user
 */
export function useQueries(
  queries: () => UseQueriesOptions[],
): Signal<QueryObserverResult[]> {
  const client = useQueryClient()
  const observer = new QueriesObserver(client, queries())

  const resultSig = signal<QueryObserverResult[]>(
    observer.getCurrentResult() as QueryObserverResult[],
  )

  const unsub = observer.subscribe((results) => {
    resultSig.set(results as QueryObserverResult[])
  })

  // When signals inside queries() change, update the observer.
  effect(() => { observer.setQueries(queries()) })

  onUnmount(() => {
    unsub()
    observer.destroy()
  })

  return resultSig
}
