import type { Ref } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import { resolveLive } from './live-prop'

const DEFAULT_TIMEOUT = 5000

export type UseAnimationEnd = (options: {
  ref: Ref<HTMLElement>
  onEnd: () => void
  active: () => boolean
  /**
   * Fallback deadline in ms, or an ACCESSOR for one.
   *
   * The accessor form exists because the deadline is re-armed on every active
   * cycle, so it is a live value, not a construction-time one: a caller whose
   * `timeout` prop arrives as a compiler `_rp` getter must be able to hand the
   * read down rather than resolving it once at setup and freezing it. The
   * resolution happens inside the watch below, UNTRACKED — see `live-prop.ts`
   * for why a tracked read there would restart the animation instead.
   */
  timeout?: number | (() => number | undefined) | undefined
}) => void

const useAnimationEnd: UseAnimationEnd = ({ ref, onEnd, active, timeout }) => {
  let called = false

  watch(
    active,
    (isActive) => {
      if (!isActive) {
        called = false
        return
      }

      const el = ref.current
      if (!el) return

      called = false

      const done = () => {
        // Re-entrancy guard. Unreachable from a single active cycle: the first
        // `done()` synchronously removes BOTH listeners AND clears the timer
        // before returning, so neither the transitionend/animationend handler
        // nor the timeout can invoke `done()` a second time. Kept defensively
        // against a future caller that wires the handler more than once.
        /* v8 ignore next */
        if (called) return
        called = true
        el.removeEventListener('transitionend', handleEnd)
        el.removeEventListener('animationend', handleEnd)
        clearTimeout(timer)
        onEnd()
      }

      const handleEnd = (e: Event) => {
        // Ignore bubbled events from children
        if (e.target !== el) return
        done()
      }

      el.addEventListener('transitionend', handleEnd)
      el.addEventListener('animationend', handleEnd)

      // Resolved HERE, not at setup: one read per active cycle, so the
      // deadline in force is the current one.
      const timer = setTimeout(done, resolveLive(timeout) ?? DEFAULT_TIMEOUT)

      return () => {
        el.removeEventListener('transitionend', handleEnd)
        el.removeEventListener('animationend', handleEnd)
        clearTimeout(timer)
      }
    },
    { immediate: true },
  )
}

export default useAnimationEnd
