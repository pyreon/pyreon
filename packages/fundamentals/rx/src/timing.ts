import { effect, signal } from '@pyreon/reactivity'
import type { ReadableSignal } from './types'

const __DEV__: boolean = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
  // Per debounce instance — scales with how many debounced signals the
  // app holds. Growing across navigations without matching dispose()
  // calls = leak (each instance keeps an effect + setTimeout state).
  if (__DEV__) _countSink.__pyreon_count__?.('rx.debounce.create')
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
  // Per throttle instance — same leak-detection rationale as
  // `rx.debounce.create`. Each instance owns an effect + a setTimeout.
  if (__DEV__) _countSink.__pyreon_count__?.('rx.throttle.create')
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
