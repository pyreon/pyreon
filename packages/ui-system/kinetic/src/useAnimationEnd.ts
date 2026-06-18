import type { Ref } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'

const DEFAULT_TIMEOUT = 5000

export type UseAnimationEnd = (options: {
  ref: Ref<HTMLElement>
  onEnd: () => void
  active: () => boolean
  timeout?: number | undefined
}) => void

const useAnimationEnd: UseAnimationEnd = ({ ref, onEnd, active, timeout = DEFAULT_TIMEOUT }) => {
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

      const timer = setTimeout(done, timeout)

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
