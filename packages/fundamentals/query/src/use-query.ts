import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, signal } from '@pyreon/reactivity'
import type {
  DefaultError,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core'
import { QueryObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'


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

  return {
    get result() {
      return (slots.result ??= signal<QueryObserverResult<TData, TError>>(observer.getCurrentResult()))
    },
    get data() {
      return (slots.data ??= signal<TData | undefined>(observer.getCurrentResult().data))
    },
    get error() {
      return (slots.error ??= signal<TError | null>(observer.getCurrentResult().error ?? null))
    },
    get status() {
      return (slots.status ??= signal<'pending' | 'error' | 'success'>(
        observer.getCurrentResult().status,
      ))
    },
    get isPending() {
      return (slots.isPending ??= signal(observer.getCurrentResult().isPending))
    },
    get isLoading() {
      return (slots.isLoading ??= signal(observer.getCurrentResult().isLoading))
    },
    get isFetching() {
      return (slots.isFetching ??= signal(observer.getCurrentResult().isFetching))
    },
    get isError() {
      return (slots.isError ??= signal(observer.getCurrentResult().isError))
    },
    get isSuccess() {
      return (slots.isSuccess ??= signal(observer.getCurrentResult().isSuccess))
    },
    refetch: () => observer.refetch(),
  }
}
