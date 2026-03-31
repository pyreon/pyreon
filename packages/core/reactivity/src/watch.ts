import { effect } from './effect'

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
  let cleanupFn: (() => void) | undefined

  const e = effect(() => {
    const newVal = source()

    if (isFirst) {
      isFirst = false
      oldVal = newVal
      if (opts.immediate) {
        const result = callback(newVal, undefined)
        if (typeof result === 'function') cleanupFn = result
      }
      return
    }

    if (cleanupFn) {
      cleanupFn()
      cleanupFn = undefined
    }

    const result = callback(newVal, oldVal)
    if (typeof result === 'function') cleanupFn = result
    oldVal = newVal
  })

  return () => {
    e.dispose()
    if (cleanupFn) {
      cleanupFn()
      cleanupFn = undefined
    }
  }
}
