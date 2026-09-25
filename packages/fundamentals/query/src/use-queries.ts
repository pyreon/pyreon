import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import type {
  DefaultError,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core'
import { QueriesObserver } from '@tanstack/query-core'
import { subscribeWhenRestored, useIsRestoring } from './is-restoring'
import { observeOptions } from './observe-options'
import { useQueryClient } from './query-client'

export type UseQueriesOptions<TQueryKey extends QueryKey = QueryKey> = QueryObserverOptions<
  unknown,
  DefaultError,
  unknown,
  unknown,
  TQueryKey
>

/**
 * One entry of `useQueries`. Same as `UseQueriesOptions`, except `select` may
 * take the query's REAL data type: `select: (u: User) => u.name`. (With
 * `UseQueriesOptions` it had to accept `unknown`, which forced a cast.)
 */
export type UseQueriesInput = Omit<UseQueriesOptions, 'select'> & {
  select?: (data: never) => unknown
}

/** The data type one `useQueries` entry resolves to: `select`'s return, else `queryFn`'s. */
export type QueriesEntryData<Q> = Q extends { select: (...args: never[]) => infer S }
  ? S
  : Q extends { queryFn: (...args: never[]) => infer R }
    ? Awaited<R>
    : unknown

/**
 * The results of `useQueries`, index-aligned and typed per entry — a tuple of
 * queries gives a tuple of results, a mapped array gives an array.
 */
export type QueriesResults<T extends readonly unknown[]> = {
  -readonly [K in keyof T]: QueryObserverResult<QueriesEntryData<T[K]>>
}

/**
 * Subscribe to multiple queries in parallel. Returns a single signal containing
 * the array of results — index-aligned with the `queries` array, and typed per
 * entry from each `queryFn` (or `select`).
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
 * // results() — QueryObserverResult<User>[]
 * // results()[0].data — first user
 */
export function useQueries<const T extends readonly UseQueriesInput[]>(
  queries: () => T,
): Signal<QueriesResults<T>> {
  const client = useQueryClient()
  const isRestoring = useIsRestoring()
  // The per-entry types exist for the CALLER; the observer is untyped by
  // design (TanStack's QueriesObserver takes a homogeneous options array).
  const observer = observeOptions(
    () => queries() as readonly UseQueriesInput[] as UseQueriesOptions[],
    (q) => new QueriesObserver(client, q),
    (obs, q) => obs.setQueries(q),
  )

  const resultSig = signal(observer.getCurrentResult() as readonly QueryObserverResult[]) as Signal<
    QueryObserverResult[]
  >

  const unsub = subscribeWhenRestored(
    observer,
    isRestoring,
    (results: readonly QueryObserverResult[]) => {
      resultSig.set(results as QueryObserverResult[])
    },
  )

  onUnmount(() => {
    unsub()
    observer.destroy()
  })

  return resultSig as unknown as Signal<QueriesResults<T>>
}
