import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect } from '@pyreon/reactivity'
import type {
  DefaultError,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core'
import { QueryObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'
import { makeResultProto } from './result-proto'

// Shared result prototype — getters live here (one allocation, module init)
// instead of as 9 per-call accessor closures in an object literal (which also
// forced the result into V8 dictionary mode). See result-proto.ts for the
// measured ~85%-per-result-object rationale. Built once with a loose
// observer/result type; each useQuery casts its strongly-typed result.
const QueryResultProto = makeResultProto<
  QueryObserverResult<unknown, unknown>,
  QueryObserver<unknown, unknown, unknown, unknown, QueryKey>
>({
  result: (c) => c,
  data: (c) => c.data,
  error: (c) => c.error ?? null,
  status: (c) => c.status,
  isPending: (c) => c.isPending,
  isLoading: (c) => c.isLoading,
  isFetching: (c) => c.isFetching,
  isError: (c) => c.isError,
  isSuccess: (c) => c.isSuccess,
})


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

export interface UseQueryResult<TData, TError = DefaultError> {
  /** Raw signal — the full observer result. Fine-grained accessors below are preferred. */
  result: Signal<QueryObserverResult<TData, TError>>
  data: Signal<TData | undefined>
  error: Signal<TError | null>
  status: Signal<'pending' | 'error' | 'success'>
  isPending: Signal<boolean>
  isLoading: Signal<boolean>
  isFetching: Signal<boolean>
  isError: Signal<boolean>
  isSuccess: Signal<boolean>
  /** Manually trigger a refetch. */
  refetch: () => Promise<QueryObserverResult<TData, TError>>
}

/**
 * Subscribe to a query. Returns fine-grained reactive signals for data,
 * error and status — each signal only notifies effects that depend on it.
 *
 * `options` is a function so it can read Pyreon signals — when a signal changes
 * (e.g. a reactive query key), the observer is updated and refetches automatically.
 *
 * @example
 * const userId = signal(1)
 * const query = useQuery(() => ({
 *   queryKey: ['user', userId()],
 *   queryFn: () => fetch(`/api/users/${userId()}`).then(r => r.json()),
 * }))
 * // In template: () => query.data()?.name
 */
export function useQuery<TData = unknown, TError = DefaultError, TKey extends QueryKey = QueryKey>(
  options: () => QueryObserverOptions<TData, TError, TData, TData, TKey>,
): UseQueryResult<TData, TError> {
  // Mount-N baseline. Per-hook overhead is now: 1 observer alloc + 1 subscribe
  // + 1 setOptions effect — signals are lazy-allocated on first property
  // access (see slots below), so most consumers pay 1-2 signal allocs instead
  // of 9. The wasted-allocation scaling that showed up as 20070 signalWrite
  // in queryNotify-10k goes away — the subscribe callback only writes to
  // materialized slots.
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useQuery')

  const client = useQueryClient()
  const observer = new QueryObserver<TData, TError, TData, TData, TKey>(client, options())

  // Lazy-allocated fine-grained signals. Each field starts as `undefined`;
  // first property access materializes the signal seeded with the observer's
  // current value. The subscribe callback below only writes to materialized
  // slots, so apps that read `query.data` + `query.isPending` pay 2 signal
  // sets per cache update — not 9.
  //
  // Trade-off: each property access is a getter call, so we make sure to
  // return the SAME signal instance on every access. Reading `query.data`
  // twice gives the same `Signal<T>` reference — required for effect
  // tracking to work (signals identify subscriptions by identity).
  const slots: {
    result?: Signal<QueryObserverResult<TData, TError>>
    data?: Signal<TData | undefined>
    error?: Signal<TError | null>
    status?: Signal<'pending' | 'error' | 'success'>
    isPending?: Signal<boolean>
    isLoading?: Signal<boolean>
    isFetching?: Signal<boolean>
    isError?: Signal<boolean>
    isSuccess?: Signal<boolean>
  } = {}

  // Subscribe synchronously — data flows before mount (correct for SSR pre-population).
  const unsub = observer.subscribe((r) => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.observerNotify')
    // Only write to materialized slots. Apps that don't read a field never
    // materialize its signal, so its branch here is a `null`-check no-op.
    // batch() coalesces the writes that DO happen into one notification flush.
    batch(() => {
      if (slots.result) slots.result.set(r)
      if (slots.data) slots.data.set(r.data)
      if (slots.error) slots.error.set(r.error ?? null)
      if (slots.status) slots.status.set(r.status)
      if (slots.isPending) slots.isPending.set(r.isPending)
      if (slots.isLoading) slots.isLoading.set(r.isLoading)
      if (slots.isFetching) slots.isFetching.set(r.isFetching)
      if (slots.isError) slots.isError.set(r.isError)
      if (slots.isSuccess) slots.isSuccess.set(r.isSuccess)
    })
  })

  // Track reactive options: when signals inside options() change, update the observer.
  effect(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    observer.setOptions(options())
  })

  // Unsubscribe the observer on unmount (effect disposal is handled by EffectScope).
  onUnmount(() => unsub())

  // Build the result on the shared getters-only prototype: 2 plain fields + a
  // detachment-safe `refetch` arrow closure + setPrototypeOf, instead of 9
  // per-instance accessor getters. `slots` and `observer` are the SAME objects
  // the subscribe callback above writes to, so the lazy-materialize-on-first-
  // access slot semantics are unchanged. `refetch` stays an own arrow (not a
  // proto method) so `onClick={query.refetch}` / `const r = query.refetch; r()`
  // keep working when detached.
  const result = {
    _slots: slots,
    _observer: observer,
    refetch: () => observer.refetch(),
  }
  Object.setPrototypeOf(result, QueryResultProto)
  return result as unknown as UseQueryResult<TData, TError>
}
