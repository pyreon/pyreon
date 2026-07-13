import { effect, signal } from '@pyreon/reactivity'
import type { ReadableSignal } from './types'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Debounce a signal — emits the latest value after `ms` of silence.
 * Returns a new signal that updates only after the source stops changing.
 *
 * **Lifecycle**: created inside a component / `effectScope`, the internal
 * effect AND its pending timer are torn down automatically on unmount (the
 * effect auto-registers with the active scope; the returned cleanup clears
 * the timer). Created in standalone code (module scope, a `defineStore`
 * setup that outlives any scope), nothing owns it — call `.dispose()`
 * yourself. The `.dispose()` method is always available and idempotent.
 */
export function debounce<T>(
  source: ReadableSignal<T>,
  ms: number,
): ReadableSignal<T> & { dispose: () => void } {
  // Per debounce instance — scales with how many debounced signals the
  // app holds. Growing across navigations without matching dispose()
  // calls = leak (each instance keeps an effect + setTimeout state).
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('rx.debounce.create')
  const debounced = signal(source())
  let timer: ReturnType<typeof setTimeout> | undefined

  const fx = effect(() => {
    const val = source()
    // The effect's `run` calls the previous cleanup BEFORE re-running, so any
    // pending timer from the last change is already cleared here — no need to
    // clearTimeout at the top of the body (it would be dead code).
    timer = setTimeout(() => {
      timer = undefined
      debounced.set(val)
    }, ms)
    // Return a cleanup so scope-disposal (component unmount) ALSO clears the
    // pending timer — not just an explicit dispose(), and also between rapid
    // source changes. Without this, a component that unmounts mid-debounce
    // leaves a setTimeout that fires AFTER unmount, mutating a signal whose
    // subscribers are gone (leak class I — orphaned setTimeout with no
    // clearTimeout on the dispose path). ONE place owns timer cancellation.
    return () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  })

  // fx.dispose() runs the effect's returned cleanup (which clears the timer),
  // so the timer teardown lives in ONE place. Idempotent — a second call is a
  // no-op because the effect guards its own `disposed` flag.
  const dispose = () => fx.dispose()

  return Object.assign(debounced as ReadableSignal<T>, { dispose })
}

/**
 * Throttle a signal — emits at most once every `ms` milliseconds.
 * Immediately emits on first change, then waits for the interval.
 *
 * **Lifecycle**: identical to {@link debounce} — auto-torn-down (effect +
 * pending trailing timer) when created inside a component / `effectScope`;
 * call `.dispose()` for standalone usage. `.dispose()` is always available
 * and idempotent.
 */
export function throttle<T>(
  source: ReadableSignal<T>,
  ms: number,
): ReadableSignal<T> & { dispose: () => void } {
  // Per throttle instance — same leak-detection rationale as
  // `rx.debounce.create`. Each instance owns an effect + a setTimeout.
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('rx.throttle.create')
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
      // The prior cleanup already cleared any pending trailing timer before
      // this re-run, so a fresh one always captures the LATEST value.
      timer = setTimeout(() => {
        timer = undefined
        throttled.set(val)
        lastEmit = Date.now()
      }, ms - elapsed)
    }
    // Clear the pending trailing timer on scope-disposal (unmount) as well as
    // explicit dispose — see the debounce rationale (leak class I).
    return () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  })

  const dispose = () => fx.dispose()

  return Object.assign(throttled as ReadableSignal<T>, { dispose })
}
