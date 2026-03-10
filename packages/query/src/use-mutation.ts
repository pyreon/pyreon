const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

import { onUnmount } from "@pyreon/core"
import { signal, batch } from "@pyreon/reactivity"
import type { Signal } from "@pyreon/reactivity"
import { MutationObserver } from "@tanstack/query-core"
import type {
  DefaultError,
  MutateFunction,
  MutationObserverOptions,
  MutationObserverResult,
} from "@tanstack/query-core"
import { useQueryClient } from "./query-client"

export interface UseMutationResult<TData, TError = DefaultError, TVariables = void, TContext = unknown> {
  /** Raw signal — full observer result. Fine-grained accessors below are preferred. */
  result: Signal<MutationObserverResult<TData, TError, TVariables, TContext>>
  data: Signal<TData | undefined>
  error: Signal<TError | null>
  status: Signal<"idle" | "pending" | "success" | "error">
  isPending: Signal<boolean>
  isSuccess: Signal<boolean>
  isError: Signal<boolean>
  isIdle: Signal<boolean>
  /** Fire the mutation. Callbacks in the second arg are per-call (not stored). */
  mutate: MutateFunction<TData, TError, TVariables, TContext>
  /** Like mutate but returns a promise. */
  mutateAsync: MutateFunction<TData, TError, TVariables, TContext>
  /** Reset the mutation state back to idle. */
  reset: () => void
}

/**
 * Run a mutation (create / update / delete). Returns reactive signals for
 * pending / success / error state plus `mutate` and `mutateAsync` functions.
 *
 * @example
 * const mutation = useMutation({
 *   mutationFn: (data: CreatePostInput) =>
 *     fetch('/api/posts', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
 *   onSuccess: () => client.invalidateQueries({ queryKey: ['posts'] }),
 * })
 * // h('button', { onClick: () => mutation.mutate({ title: 'New' }) }, 'Create')
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: MutationObserverOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const client = useQueryClient()
  const observer = new MutationObserver<TData, TError, TVariables, TContext>(client, options)
  const initial = observer.getCurrentResult()

  // Fine-grained signals: each field is independent so only effects that read
  // e.g. `mutation.isPending()` re-run when isPending changes, not on every update.
  const resultSig  = signal<MutationObserverResult<TData, TError, TVariables, TContext>>(initial)
  const dataSig    = signal<TData | undefined>(initial.data)
  const errorSig   = signal<TError | null>(initial.error ?? null)
  const statusSig  = signal<"idle" | "pending" | "success" | "error">(initial.status)
  const isPending  = signal(initial.isPending)
  const isSuccess  = signal(initial.isSuccess)
  const isError    = signal(initial.isError)
  const isIdle     = signal(initial.isIdle)

  // batch() coalesces all signal updates into one notification flush.
  const unsub = observer.subscribe((r) => {
    batch(() => {
      resultSig.set(r)
      dataSig.set(r.data)
      errorSig.set(r.error ?? null)
      statusSig.set(r.status)
      isPending.set(r.isPending)
      isSuccess.set(r.isSuccess)
      isError.set(r.isError)
      isIdle.set(r.isIdle)
    })
  })

  onUnmount(() => unsub())

  return {
    result:      resultSig,
    data:        dataSig,
    error:       errorSig,
    status:      statusSig,
    isPending,
    isSuccess,
    isError,
    isIdle,
    mutate:      (vars, callbackOptions) => {
      observer.mutate(vars, callbackOptions).catch((err) => {
        // Error is already captured in the error signal via the observer subscription.
        // This catch prevents an unhandled promise rejection for fire-and-forget callers.
        // Use mutateAsync() if you need to handle the error in a try/catch.
        if (__DEV__) console.error("[pyreon/query] Mutation failed:", err)
      })
    },
    mutateAsync: (vars, callbackOptions) => observer.mutate(vars, callbackOptions),
    reset:       () => observer.reset(),
  }
}
