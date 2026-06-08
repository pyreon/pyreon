import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch } from '@pyreon/reactivity'
import type {
  DefaultError,
  MutateFunction,
  MutationObserverOptions,
  MutationObserverResult,
} from '@tanstack/query-core'
import { MutationObserver } from '@tanstack/query-core'
import { useQueryClient } from './query-client'
import { makeResultProto } from './result-proto'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Shared result prototype — the 8 accessor getters live here (one allocation,
// module init) instead of as per-call closures in an object literal (which also
// forced the result into V8 dictionary mode). See result-proto.ts. Methods
// (mutate/mutateAsync/reset) stay as own arrow closures on each result (they're
// routinely detached: `onClick={m.mutate}`), so only getters move here.
const MutationResultProto = makeResultProto<
  MutationObserverResult<unknown, unknown, unknown, unknown>,
  MutationObserver<unknown, unknown, unknown, unknown>
>({
  result: (c) => c,
  data: (c) => c.data,
  error: (c) => c.error ?? null,
  status: (c) => c.status,
  isPending: (c) => c.isPending,
  isSuccess: (c) => c.isSuccess,
  isError: (c) => c.isError,
  isIdle: (c) => c.isIdle,
})

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
  // Mount-N baseline. One emit per useMutation hook call.
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.useMutation')

  const client = useQueryClient()
  const { invalidates, ...coreOptions } = options

  // Wire auto-invalidation into onSuccess
  const finalOptions = { ...coreOptions } as MutationObserverOptions<TData, TError, TVariables, TContext>
  if (invalidates && invalidates.length > 0) {
    const userOnSuccess = options.onSuccess
    finalOptions.onSuccess = (data, variables, onMutateResult, context) => {
      for (const key of invalidates) {
        // Per invalidateQueries call from useMutation({ invalidates }). Counter
        // grows with mutationCount × invalidates.length. Each call fans out
        // to matching queries in the cache and triggers their observerNotify.
        if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.invalidate')
        client.invalidateQueries({ queryKey: key })
      }
      userOnSuccess?.(data, variables, onMutateResult, context)
    }
  }

  const observer = new MutationObserver<TData, TError, TVariables, TContext>(client, finalOptions)

  // Lazy signal slots — see use-query.ts for the pattern. useMutation observers
  // fire their subscribe callback on each mutate() lifecycle transition (pending
  // → success/error), so the wasted-write scaling is mutationCount × N states ×
  // 8. Lazy allocation drops it to 1-2 in real apps that read just `isPending`
  // and `data`.
  type Result = MutationObserverResult<TData, TError, TVariables, TContext>
  const slots: {
    result?: Signal<Result>
    data?: Signal<TData | undefined>
    error?: Signal<TError | null>
    status?: Signal<'idle' | 'pending' | 'success' | 'error'>
    isPending?: Signal<boolean>
    isSuccess?: Signal<boolean>
    isError?: Signal<boolean>
    isIdle?: Signal<boolean>
  } = {}

  const unsub = observer.subscribe((r) => {
    batch(() => {
      if (slots.result) slots.result.set(r)
      if (slots.data) slots.data.set(r.data)
      if (slots.error) slots.error.set(r.error ?? null)
      if (slots.status) slots.status.set(r.status)
      if (slots.isPending) slots.isPending.set(r.isPending)
      if (slots.isSuccess) slots.isSuccess.set(r.isSuccess)
      if (slots.isError) slots.isError.set(r.isError)
      if (slots.isIdle) slots.isIdle.set(r.isIdle)
    })
  })

  onUnmount(() => unsub())

  // Build the result on the shared getters-only prototype (2 plain fields +
  // detachment-safe method arrows + setPrototypeOf) instead of 8 per-instance
  // accessor getters. `slots`/`observer` are the same objects the subscribe
  // callback writes to. Method params are annotated explicitly because the
  // `as unknown as` cast below breaks the contextual typing the inline literal
  // got from the return-type annotation.
  const result = {
    _slots: slots,
    _observer: observer,
    mutate: (
      vars: TVariables,
      callbackOptions?: Parameters<MutateFunction<TData, TError, TVariables, TContext>>[1],
    ) => {
      observer.mutate(vars, callbackOptions).catch(() => {
        // Error is already captured in the error signal via the observer subscription.
        // This catch prevents an unhandled promise rejection for fire-and-forget callers.
      })
    },
    mutateAsync: (
      vars: TVariables,
      callbackOptions?: Parameters<MutateFunction<TData, TError, TVariables, TContext>>[1],
    ) => observer.mutate(vars, callbackOptions),
    reset: () => observer.reset(),
  }
  Object.setPrototypeOf(result, MutationResultProto)
  return result as unknown as UseMutationResult<TData, TError, TVariables, TContext>
}
