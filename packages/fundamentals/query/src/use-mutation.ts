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

const __DEV__: boolean = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
  if (__DEV__) _countSink.__pyreon_count__?.('query.useMutation')

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
        if (__DEV__) _countSink.__pyreon_count__?.('query.invalidate')
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

  return {
    get result() {
      return (slots.result ??= signal<Result>(observer.getCurrentResult()))
    },
    get data() {
      return (slots.data ??= signal<TData | undefined>(observer.getCurrentResult().data))
    },
    get error() {
      return (slots.error ??= signal<TError | null>(observer.getCurrentResult().error ?? null))
    },
    get status() {
      return (slots.status ??= signal<'idle' | 'pending' | 'success' | 'error'>(
        observer.getCurrentResult().status,
      ))
    },
    get isPending() {
      return (slots.isPending ??= signal(observer.getCurrentResult().isPending))
    },
    get isSuccess() {
      return (slots.isSuccess ??= signal(observer.getCurrentResult().isSuccess))
    },
    get isError() {
      return (slots.isError ??= signal(observer.getCurrentResult().isError))
    },
    get isIdle() {
      return (slots.isIdle ??= signal(observer.getCurrentResult().isIdle))
    },
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
