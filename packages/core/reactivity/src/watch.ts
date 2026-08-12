import { effect, onCleanup } from './effect'

export interface WatchOptions {
  /** If true, call the callback immediately with the current value on setup. Default: false. */
  immediate?: boolean
}

/**
 * Watch a reactive source and run a callback whenever it changes.
 *
 * Returns a stop function that disposes the watcher.
 *
 * The callback receives (newValue, oldValue). On the first call (when
 * `immediate` is true) oldValue is `undefined`.
 *
 * The callback may return a cleanup function that is called before each
 * re-run and on stop — useful for cancelling async work.
 *
 * @example
 * const stop = watch(
 *   () => userId(),
 *   async (id, prev) => {
 *     const data = await fetch(`/api/user/${id}`)
 *     setUser(await data.json())
 *   },
 * )
 * // Later: stop()
 */
export function watch<T>(
  source: () => T,
  callback: (newVal: T, oldVal: T | undefined) => void | (() => void),
  opts: WatchOptions = {},
): () => void {
  let oldVal: T | undefined
  let isFirst = true

  const e = effect(() => {
    const newVal = source()

    if (isFirst) {
      isFirst = false
      oldVal = newVal
      if (opts.immediate) {
        const result = callback(newVal, undefined)
        // Register the per-run cleanup on the EFFECT (via onCleanup) rather
        // than a closure var. The effect's runCleanup fires it before each
        // re-run AND on dispose — so when the OWNING SCOPE disposes the effect
        // (component unmount), the cleanup runs. Previously the cleanup lived
        // in a closure that only ran on re-run or via the returned stop(), so
        // an unmount mid-cycle ORPHANED it — a `watch` whose callback added a
        // listener / set a timer leaked it for the effect's would-be lifetime
        // (e.g. kinetic's useAnimationEnd left a 5s setTimeout + transitionend
        // listeners pinning a detached subtree). See anti-patterns "watch's
        // per-run cleanup orphaned on scope disposal".
        if (typeof result === 'function') onCleanup(result)
      }
      return
    }

    const result = callback(newVal, oldVal)
    if (typeof result === 'function') onCleanup(result)
    oldVal = newVal
  })

  return () => e.dispose()
}
