import { effect, untrack } from '@pyreon/reactivity'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Evaluate a hook's reactive `options()` builder ONCE per run and route it to
 * the observer: the first run CONSTRUCTS the observer from it, every later run
 * (a signal read inside the builder changed) updates it.
 *
 * The previous shape built the observer from one `options()` call and then ran
 * a tracking effect whose first run called `options()` AGAIN just to hand the
 * observer the same options — every mount paid for the builder twice (and any
 * allocation inside it: the key array, the inline `queryFn` closure, …).
 *
 * The construction is `untrack`ed: only the builder's own reads are the
 * options' dependencies, not whatever the observer's constructor touches.
 */
export function observeOptions<TOptions, TObserver>(
  read: () => TOptions,
  create: (options: TOptions) => TObserver,
  update: (observer: TObserver, options: TOptions) => void,
): TObserver {
  let observer: TObserver | undefined
  effect(() => {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('query.setOptions')
    const options = read()
    if (observer === undefined) observer = untrack(() => create(options))
    else update(observer, options)
  })
  return observer as TObserver
}
