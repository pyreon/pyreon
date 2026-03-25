import { onUnmount } from "@pyreon/core"

export type UseTimeout = (
  callback: () => void,
  delay: number | null,
) => { reset: () => void; clear: () => void }

/**
 * Declarative `setTimeout` with auto-cleanup.
 * Pass `null` as `delay` to disable. Returns `reset` and `clear` controls.
 * Always calls the latest callback (no stale closures).
 */
export const useTimeout: UseTimeout = (callback, delay) => {
  const currentCallback = callback
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const reset = () => {
    clear()
    if (delay !== null) {
      timer = setTimeout(() => {
        timer = null
        currentCallback()
      }, delay)
    }
  }

  // Start the timer immediately
  reset()

  onUnmount(() => clear())

  return { reset, clear }
}

export default useTimeout
