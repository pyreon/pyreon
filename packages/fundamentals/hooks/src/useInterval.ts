import { onUnmount } from "@pyreon/core"

export type UseInterval = (callback: () => void, delay: number | null) => void

/**
 * Declarative `setInterval` with auto-cleanup.
 * Pass `null` as `delay` to pause the interval.
 * In Pyreon, components run once — callback is captured at setup time.
 */
export const useInterval: UseInterval = (callback, delay) => {
  let intervalId: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (delay === null) return
    intervalId = setInterval(() => callback(), delay)
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
