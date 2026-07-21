import { onUnmount } from '@pyreon/core'

type ThrottledFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void
  cancel: () => void
}

export type UseThrottledCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
) => ThrottledFn<T>

// Local throttle — @pyreon/hooks is a fundamentals package and must not
// depend on the ui-system layer (it previously imported `throttle` from
// @pyreon/ui-core). Leading + trailing edge, latest-args, cancelable —
// identical behavior to ui-core's throttle at the default options this
// hook always used.
const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): T & { cancel: () => void } => {
  let lastCallTime: number | undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: any[] | undefined

  const invoke = (args: any[]) => {
    lastCallTime = Date.now()
    fn(...args)
  }

  const startTrailingTimer = (args: any[], delay: number) => {
    lastArgs = args
    if (timeoutId !== undefined) return
    timeoutId = setTimeout(() => {
      timeoutId = undefined
      /* v8 ignore else — lastArgs is set immediately before scheduling; cancel() clears both */
      if (lastArgs) {
        invoke(lastArgs)
        lastArgs = undefined
      }
    }, delay)
  }

  const throttled = (...args: any[]) => {
    const now = Date.now()
    const elapsed = lastCallTime === undefined ? wait : now - lastCallTime
    if (elapsed >= wait) {
      invoke(args)
    } else {
      startTrailingTimer(args, wait - elapsed)
    }
  }

  throttled.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    lastArgs = undefined
    lastCallTime = undefined
  }

  return throttled as T & { cancel: () => void }
}

/**
 * Returns a throttled version of the callback.
 * Always calls the latest callback (no stale closures).
 * Cleans up on unmount.
 */
export const useThrottledCallback: UseThrottledCallback = (callback, delay) => {
  const currentCallback = callback

  const throttled = throttle((...args: any[]) => currentCallback(...args), delay)

  onUnmount(() => throttled.cancel())

  return throttled as ThrottledFn<typeof callback>
}

export default useThrottledCallback
