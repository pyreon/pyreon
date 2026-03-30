import { effect, signal } from '@pyreon/reactivity'
import type { ReadableSignal } from './types'

/**
 * Debounce a signal — emits the latest value after `ms` of silence.
 * Returns a new signal that updates only after the source stops changing.
 *
 * Works both inside and outside component context.
 * The returned signal has a `.dispose()` method to stop tracking.
 */
export function debounce<T>(
  source: ReadableSignal<T>,
  ms: number,
): ReadableSignal<T> & { dispose: () => void } {
  const debounced = signal(source())
  let timer: ReturnType<typeof setTimeout> | undefined

  const fx = effect(() => {
    const val = source()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => debounced.set(val), ms)
  })

  const dispose = () => {
    if (timer) clearTimeout(timer)
    fx.dispose()
  }

  return Object.assign(debounced as ReadableSignal<T>, { dispose })
}

/**
 * Throttle a signal — emits at most once every `ms` milliseconds.
 * Immediately emits on first change, then waits for the interval.
 *
 * Works both inside and outside component context.
 * The returned signal has a `.dispose()` method to stop tracking.
 */
export function throttle<T>(
  source: ReadableSignal<T>,
  ms: number,
): ReadableSignal<T> & { dispose: () => void } {
  const throttled = signal(source())
  let lastEmit = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const fx = effect(() => {
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

  const dispose = () => {
    if (timer) clearTimeout(timer)
    fx.dispose()
  }

  return Object.assign(throttled as ReadableSignal<T>, { dispose })
}
