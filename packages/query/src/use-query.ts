import { onUnmount } from "@pyreon/core"
import { signal, effect, batch } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"
import { QueryObserver } from "@tanstack/query-core"
import type {
  DefaultError,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

export interface UseQueryResult<TData, TError = DefaultError> {
  /** Raw signal — the full observer result. Fine-grained accessors below are preferred. */
  result: Signal<QueryObserverResult<TData, TError>>
  data: Signal<TData | undefined>
  error: Signal<TError | null>
  status: Signal<"pending" | "error" | "success">
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
export function useQuery<
  TData = unknown,
  TError = DefaultError,
  TKey extends QueryKey = QueryKey,
>(
  options: () => QueryObserverOptions<TData, TError, TData, TData, TKey>,
): UseQueryResult<TData, TError> {
  const client = useQueryClient()
  const observer = new QueryObserver<TData, TError, TData, TData, TKey>(client, options())
  const initial = observer.getCurrentResult()

  // Fine-grained signals: each field is independent so only effects that read
  // e.g. `query.data()` re-run when data changes, not when isFetching flips.
  const resultSig  = signal<QueryObserverResult<TData, TError>>(initial)
  const dataSig    = signal<TData | undefined>(initial.data)
  const errorSig   = signal<TError | null>(initial.error ?? null)
  const statusSig  = signal<"pending" | "error" | "success">(initial.status)
  const isPending  = signal(initial.isPending)
  const isLoading  = signal(initial.isLoading)
  const isFetching = signal(initial.isFetching)
  const isError    = signal(initial.isError)
  const isSuccess  = signal(initial.isSuccess)

  // Subscribe synchronously — data flows before mount (correct for SSR pre-population).
  // batch() coalesces all signal updates into one notification flush.
  const unsub = observer.subscribe((r) => {
    batch(() => {
      resultSig.set(r)
      dataSig.set(r.data)
      errorSig.set(r.error ?? null)
      statusSig.set(r.status)
      isPending.set(r.isPending)
      isLoading.set(r.isLoading)
      isFetching.set(r.isFetching)
      isError.set(r.isError)
      isSuccess.set(r.isSuccess)
    })
  })

  // Track reactive options: when signals inside options() change, update the observer.
  // effect() is auto-registered in the component's EffectScope → auto-disposed on unmount.
  effect(() => { observer.setOptions(options()) })

  // Unsubscribe the observer on unmount (effect disposal is handled by EffectScope).
  onUnmount(() => unsub())

  return {
    result:     resultSig,
    data:       dataSig,
    error:      errorSig,
    status:     statusSig,
    isPending,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    refetch: () => observer.refetch(),
  }
}
