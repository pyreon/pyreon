import type { VNode } from '@pyreon/core'
import { createRef, Show } from '@pyreon/core'
import { runUntracked, signal, watch } from '@pyreon/reactivity'
import { readLive, readLiveValue } from './live-prop'
import { showAccessorFrom } from './show-accessor'
import type { CollapseProps, TransitionCallbacks, TransitionStage } from './types'
import useAnimationEnd from './useAnimationEnd'
import { useReducedMotion } from './useReducedMotion'

const Collapse = (props: CollapseProps): VNode | null => {
  // LIVE: written to `style.transition` on every stage change, so the shorthand
  // in force should be the current one.
  const transition = () => readLiveValue<string>(props, 'transition') ?? 'height 300ms ease'
  // CONSTRUCTION-TIME: a first-mount question, spent once the ref wires up.
  const appear = props.appear ?? false
  // LIVE: the animation-end deadline is re-armed on each active cycle.
  const timeout = () => readLiveValue<number>(props, 'timeout') ?? 5000

  const reducedMotion = useReducedMotion()
  let wrapperRef: { current: HTMLDivElement | null } = createRef<HTMLDivElement>()
  const contentRef = createRef<HTMLDivElement>()

  // Re-reads `props.show` per call — `show={sig}` arrives as a live getter.
  const showAcc = showAccessorFrom(props)
  const initialShow = showAcc()
  // When appear=true and show starts true, mount but defer animation until ref is wired
  const needsAppear = appear && initialShow
  const stage = signal<TransitionStage>(initialShow ? 'entered' : 'hidden')
  let isInitialMount = true
  let appearTriggered = false

  // Intercept ref assignment to detect when element connects and trigger appear.
  // Uses queueMicrotask so all sibling refs are wired before the animation starts.
  if (needsAppear) {
    const orig = wrapperRef
    const proxy = { current: null as HTMLDivElement | null }
    Object.defineProperty(proxy, 'current', {
      get() {
        return orig.current
      },
      set(node: HTMLDivElement | null) {
        orig.current = node
        if (node && !appearTriggered) {
          appearTriggered = true
          queueMicrotask(() => stage.set('entering'))
        }
      },
    })
    wrapperRef = proxy
  }

  // State machine transitions
  watch(
    showAcc,
    (showVal) => {
      if (isInitialMount) {
        isInitialMount = false
        // appear case is handled by wrapperRefCallback above
        return
      }

      // A processed run always sees a real `show` change, so showVal correlates
      // with the current stage: show→true only after stage was left
      // hidden/leaving (IF), show→false only after stage was left
      // entering/entered (ELSE). The redundant
      // `else if (!showVal && (entered|entering))` would carry an unreachable
      // false arm (the no-change cross-states), so a plain `else` keeps the
      // only reachable behaviour (leaving) and is fully coverable. See
      // useTransitionState.ts for the full argument.
      const currentStage = runUntracked(() => stage())
      if (showVal && (currentStage === 'hidden' || currentStage === 'leaving')) {
        stage.set('entering')
      } else {
        stage.set('leaving')
      }
    },
    { immediate: true },
  )

  // Animate height
  watch(
    () => stage(),
    (currentStage) => {
      const wrapper = wrapperRef.current
      const content = contentRef.current
      if (!wrapper || !content) return

      if (reducedMotion()) {
        if (currentStage === 'entering') {
          readLive<TransitionCallbacks['onEnter']>(props, 'onEnter')?.()
          wrapper.style.height = 'auto'
          wrapper.style.overflow = ''
          readLive<TransitionCallbacks['onAfterEnter']>(props, 'onAfterEnter')?.()
          stage.set('entered')
        } else if (currentStage === 'leaving') {
          readLive<TransitionCallbacks['onLeave']>(props, 'onLeave')?.()
          wrapper.style.height = '0px'
          wrapper.style.overflow = 'hidden'
          readLive<TransitionCallbacks['onAfterLeave']>(props, 'onAfterLeave')?.()
          stage.set('hidden')
        }
        return
      }

      if (currentStage === 'entering') {
        readLive<TransitionCallbacks['onEnter']>(props, 'onEnter')?.()
        const height = content.scrollHeight
        wrapper.style.transition = 'none'
        wrapper.style.height = '0px'
        wrapper.style.overflow = 'hidden'
        // Force reflow so the browser registers height: 0
        void wrapper.offsetHeight
        wrapper.style.transition = transition()
        wrapper.style.height = `${height}px`
      }

      if (currentStage === 'leaving') {
        readLive<TransitionCallbacks['onLeave']>(props, 'onLeave')?.()
        const height = content.scrollHeight
        wrapper.style.transition = 'none'
        wrapper.style.height = `${height}px`
        wrapper.style.overflow = 'hidden'
        // Force reflow
        void wrapper.offsetHeight
        wrapper.style.transition = transition()
        wrapper.style.height = '0px'
      }
    },
    { immediate: true },
  )

  // Listen for animation end
  useAnimationEnd({
    ref: wrapperRef,
    active: () => (stage() === 'entering' || stage() === 'leaving') && !reducedMotion(),
    timeout,
    onEnd: () => {
      const wrapper = wrapperRef.current
      // `onEnd` only fires while `active` is true (stage ∈ {entering, leaving}),
      // so the `else` is necessarily the leaving case — a plain `else` avoids
      // an unreachable `else if (stage() === 'leaving')` false arm.
      if (stage() === 'entering') {
        if (wrapper) {
          wrapper.style.height = 'auto'
          wrapper.style.overflow = ''
          wrapper.style.transition = ''
        }
        readLive<TransitionCallbacks['onAfterEnter']>(props, 'onAfterEnter')?.()
        stage.set('entered')
      } else {
        readLive<TransitionCallbacks['onAfterLeave']>(props, 'onAfterLeave')?.()
        stage.set('hidden')
      }
    },
  })

  const shouldRender = () => stage() !== 'hidden'

  return (
    <div
      ref={wrapperRef}
      style={{
        ...(stage() !== 'entered' ? { overflow: 'hidden' } : {}),
        ...(stage() === 'hidden'
          ? { height: '0px' }
          : stage() === 'entered'
            ? { height: 'auto' }
            : // The `: {}` tail fires only for the transient entering/leaving
              // stage DURING a live re-render — reachable only when mounted +
              // animating (real Chromium: kinetic.browser.test.tsx). SSR is
              // one-shot at entered (height:auto) / hidden (height:0px).
              /* v8 ignore next */
              {}),
      }}
    >
      <Show when={shouldRender}>
        <div ref={contentRef}>{props.children}</div>
      </Show>
    </div>
  )
}

export default Collapse
