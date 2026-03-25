import { effect, onCleanup, signal } from "@pyreon/reactivity"
import type { ReadableSignal } from "./types"

/**
 * Debounce a signal — emits the latest value after `ms` of silence.
 * Returns a new signal that updates only after the source stops changing.
 */
export function debounce<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T> {
  const debounced = signal(source())
  let timer: ReturnType<typeof setTimeout> | undefined

  effect(() => {
    const val = source()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => debounced.set(val), ms)
  })

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return debounced
}

/**
 * Throttle a signal — emits at most once every `ms` milliseconds.
 * Immediately emits on first change, then waits for the interval.
 */
export function throttle<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T> {
  const throttled = signal(source())
  let lastEmit = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  effect(() => {
    const val = source()
    const now = Date.now()
    const elapsed = now - lastEmit

    if (elapsed >= ms) {
      throttled.set(val)
      lastEmit = now
    } else {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        throttled.set(val)
        lastEmit = Date.now()
      }, ms - elapsed)
    }
  })

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return throttled
}
