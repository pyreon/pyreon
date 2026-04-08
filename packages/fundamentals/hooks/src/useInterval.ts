import { onUnmount } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'

export type UseInterval = (
  callback: () => void,
  delay: number | null | (() => number | null),
) => void

/**
 * Declarative `setInterval` with auto-cleanup.
 *
 * `delay` can be:
 * - a number (ms) — fixed interval
 * - `null` — paused
 * - a getter `() => number | null` — reactive interval that restarts when
 *   the returned value changes (e.g. signal-derived). Returning `null`
 *   pauses; returning a number resumes.
 *
 * @example
 * useInterval(() => tick(), 1000)
 *
 * @example
 * const running = signal(true)
 * useInterval(() => tick(), () => running() ? 1000 : null)
 */
export const useInterval: UseInterval = (callback, delay) => {
  let intervalId: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  if (typeof delay === 'function') {
    // Reactive: re-run on signal changes inside the getter
    effect(() => {
      const d = (delay as () => number | null)()
      stop()
      if (d == null) return
      intervalId = setInterval(() => callback(), d)
    })
  } else if (delay != null) {
    intervalId = setInterval(() => callback(), delay)
  }

  onUnmount(stop)
}

export default useInterval
