import { onUnmount } from "@pyreon/core"

export type UseInterval = (callback: () => void, delay: number | null) => void

/**
 * Declarative `setInterval` with auto-cleanup.
 * Pass `null` as `delay` to pause the interval.
 * Always calls the latest callback (no stale closures).
 */
export const useInterval: UseInterval = (callback, delay) => {
  const currentCallback = callback
  let intervalId: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (delay === null) return
    intervalId = setInterval(() => currentCallback(), delay)
  }

  const stop = () => {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  start()

  onUnmount(() => stop())
}

export default useInterval
