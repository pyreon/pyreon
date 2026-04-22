import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, signal } from '@pyreon/reactivity'
import type {
  DefaultError,
  MutateFunction,
  MutationObserverOptions,
  MutationObserverResult,
} from '@tanstack/query-core'
import { MutationObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

export interface UseMutationResult<
  TData,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> {
  /** Raw signal — full observer result. Fine-grained accessors below are preferred. */
  result: Signal<MutationObserverResult<TData, TError, TVariables, TContext>>
  data: Signal<TData | undefined>
  error: Signal<TError | null>
  status: Signal<'idle' | 'pending' | 'success' | 'error'>
  isPending: Signal<boolean>
  isSuccess: Signal<boolean>
  isError: Signal<boolean>
  isIdle: Signal<boolean>
  /** Fire the mutation (fire-and-forget). Errors are captured in the error signal. */
  mutate: (
    variables: TVariables,
    options?: Parameters<MutateFunction<TData, TError, TVariables, TContext>>[1],
  ) => void
  /** Like mutate but returns a promise — use for try/catch error handling. */
  mutateAsync: MutateFunction<TData, TError, TVariables, TContext>
  /** Reset the mutation state back to idle. */
  reset: () => void
}

/**
 * Extended mutation options — adds `invalidates` for auto-invalidation on success.
 */
export interface MutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> extends MutationObserverOptions<TData, TError, TVariables, TContext> {
  /**
   * Query keys to invalidate automatically on successful mutation.
   * Saves the boilerplate of writing `onSuccess: () => client.invalidateQueries(...)`.
   *
   * @example
   * ```ts
   * const createPost = useMutation({
   *   mutationFn: (data) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(data) }),
   *   invalidates: [['posts'], ['stats']],
   * })
   * ```
   */
  invalidates?: import('@tanstack/query-core').QueryKey[]
}

/**
 * Run a mutation (create / update / delete). Returns reactive signals for
 * pending / success / error state plus `mutate` and `mutateAsync` functions.
 *
 * @example
 * ```ts
 * const mutation = useMutation({
 *   mutationFn: (data: CreatePostInput) =>
 *     fetch('/api/posts', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
 *   invalidates: [['posts']], // auto-invalidates on success
 * })
 * ```
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const client = useQueryClient()
  const { invalidates, ...coreOptions } = options

  // Wire auto-invalidation into onSuccess
  const finalOptions = { ...coreOptions } as MutationObserverOptions<TData, TError, TVariables, TContext>
  if (invalidates && invalidates.length > 0) {
    const userOnSuccess = options.onSuccess
    finalOptions.onSuccess = (data, variables, onMutateResult, context) => {
      for (const key of invalidates) {
        client.invalidateQueries({ queryKey: key })
      }
      userOnSuccess?.(data, variables, onMutateResult, context)
    }
  }

  const observer = new MutationObserver<TData, TError, TVariables, TContext>(client, finalOptions)
  const initial = observer.getCurrentResult()

  // Fine-grained signals: each field is independent so only effects that read
  // e.g. `mutation.isPending()` re-run when isPending changes, not on every update.
  const resultSig = signal<MutationObserverResult<TData, TError, TVariables, TContext>>(initial)
  const dataSig = signal<TData | undefined>(initial.data)
  const errorSig = signal<TError | null>(initial.error ?? null)
  const statusSig = signal<'idle' | 'pending' | 'success' | 'error'>(initial.status)
  const isPending = signal(initial.isPending)
  const isSuccess = signal(initial.isSuccess)
  const isError = signal(initial.isError)
  const isIdle = signal(initial.isIdle)

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
    result: resultSig,
    data: dataSig,
    error: errorSig,
    status: statusSig,
    isPending,
    isSuccess,
    isError,
    isIdle,
    mutate: (vars, callbackOptions) => {
      observer.mutate(vars, callbackOptions).catch(() => {
        // Error is already captured in the error signal via the observer subscription.
        // This catch prevents an unhandled promise rejection for fire-and-forget callers.
      })
    },
    mutateAsync: (vars, callbackOptions) => observer.mutate(vars, callbackOptions),
    reset: () => observer.reset(),
  }
}
