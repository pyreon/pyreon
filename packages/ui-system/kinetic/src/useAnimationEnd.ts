import type { Ref } from "@pyreon/core"
import { watch } from "@pyreon/reactivity"

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
        if (called) return
        called = true
        el.removeEventListener("transitionend", handleEnd)
        el.removeEventListener("animationend", handleEnd)
        clearTimeout(timer)
        onEnd()
      }

      const handleEnd = (e: Event) => {
        // Ignore bubbled events from children
        if (e.target !== el) return
        done()
      }

      el.addEventListener("transitionend", handleEnd)
      el.addEventListener("animationend", handleEnd)

      const timer = setTimeout(done, timeout)

      return () => {
        el.removeEventListener("transitionend", handleEnd)
        el.removeEventListener("animationend", handleEnd)
        clearTimeout(timer)
      }
    },
    { immediate: true },
  )
}

export default useAnimationEnd
