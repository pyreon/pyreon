import { type Signal, signal } from '@pyreon/reactivity'

export interface UseCounterOptions {
  /** Lower bound — `count` never goes below this (inclusive). */
  min?: number
  /** Upper bound — `count` never goes above this (inclusive). */
  max?: number
}

export interface UseCounterResult {
  /** Reactive current value. Read by calling: `count()`. */
  count: Signal<number>
  /** Increment by `delta` (default 1), clamped to `[min, max]`. */
  inc: (delta?: number) => void
  /** Decrement by `delta` (default 1), clamped to `[min, max]`. */
  dec: (delta?: number) => void
  /** Set to an absolute value, clamped to `[min, max]`. */
  set: (value: number) => void
  /** Reset to the (clamped) initial value. */
  reset: () => void
}

/**
 * Reactive numeric counter with increment / decrement / set / reset and
 * optional `min` / `max` clamping. The numeric companion to
 * {@link useToggle}.
 *
 * @param initial - starting value (clamped into `[min, max]` if bounds are set)
 *
 * @example
 * ```tsx
 * const { count, inc, dec, reset } = useCounter(0, { min: 0, max: 10 })
 *
 * <button onClick={() => dec()}>-</button>
 * <span>{count}</span>
 * <button onClick={() => inc()}>+</button>
 * <button onClick={reset}>reset</button>
 * ```
 */
export function useCounter(initial = 0, options?: UseCounterOptions): UseCounterResult {
  const min = options?.min
  const max = options?.max

  const clamp = (v: number): number => {
    let r = v
    if (min !== undefined && r < min) r = min
    if (max !== undefined && r > max) r = max
    return r
  }

  const count = signal(clamp(initial))

  return {
    count,
    inc: (delta = 1) => count.set(clamp(count.peek() + delta)),
    dec: (delta = 1) => count.set(clamp(count.peek() - delta)),
    set: (value: number) => count.set(clamp(value)),
    reset: () => count.set(clamp(initial)),
  }
}

export default useCounter
