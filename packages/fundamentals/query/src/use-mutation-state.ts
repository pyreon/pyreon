import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { effect, signal } from '@pyreon/reactivity'
import type { Mutation, MutationFilters, MutationState } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

export interface UseMutationStateOptions<TResult = MutationState> {
  /** Narrow which mutations to read (status, mutationKey, predicate). */
  filters?: MutationFilters
  /** Map each matched mutation to a value. Defaults to `mutation.state`. */
  select?: (mutation: Mutation) => TResult
}

/**
 * Reactively read state from the MutationCache — e.g. to render in-flight
 * mutations globally (optimistic-UI lists, a "saving…" indicator). Mirrors
 * TanStack's `useMutationState`.
 *
 * Returns a `Signal<TResult[]>` that notifies whenever a matching mutation is
 * added / updated / removed. `options` is a function so reactive filters
 * (signal-driven status, mutationKey) re-evaluate automatically.
 *
 * @example
 * const pending = useMutationState(() => ({
 *   filters: { status: 'pending' },
 *   select: (m) => m.state.variables,
 * }))
 * // pending() — array of variables of every in-flight mutation
 */
export function useMutationState<TResult = MutationState>(
  options: () => UseMutationStateOptions<TResult> = () => ({}),
): Signal<TResult[]> {
  const client = useQueryClient()
  const cache = client.getMutationCache()

  const snapshot = (): TResult[] => {
    const opts = options()
    return cache
      .findAll(opts.filters)
      .map((m) => (opts.select ? opts.select(m) : (m.state as unknown as TResult)))
  }

  const sig = signal<TResult[]>([])
  // Seed + re-snapshot when reactive filters/select change.
  effect(() => {
    options() // track reactive options
    sig.set(snapshot())
  })
  // Re-snapshot on any mutation-cache change.
  const unsub = cache.subscribe(() => sig.set(snapshot()))
  onUnmount(unsub)

  return sig
}
