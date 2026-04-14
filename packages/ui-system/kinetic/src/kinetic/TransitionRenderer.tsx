import type { VNode } from '@pyreon/core'
import { createRef, h, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { CSSProperties, TransitionCallbacks } from '../types'
import useAnimationEnd from '../useAnimationEnd'
import { useReducedMotion } from '../useReducedMotion'
import useTransitionState from '../useTransitionState'
import { addClasses, mergeRefs, nextFrame, removeClasses } from '../utils'
import type { KineticConfig } from './types'

type TransitionRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  show: () => boolean
  appear?: boolean | undefined
  unmount?: boolean | undefined
  timeout?: number | undefined
  callbacks: Partial<TransitionCallbacks>
  children: VNode | VNode[]
}

const applyEnter = (el: HTMLElement, config: KineticConfig) => {
  addClasses(el, config.enter)
  addClasses(el, config.enterFrom)
  if (config.enterStyle) Object.assign(el.style, config.enterStyle)
  if (config.enterTransition) el.style.transition = config.enterTransition

  return nextFrame(() => {
    removeClasses(el, config.enterFrom)
    addClasses(el, config.enterTo)
    if (config.enterToStyle) Object.assign(el.style, config.enterToStyle)
  })
}

const applyLeave = (el: HTMLElement, config: KineticConfig) => {
  removeClasses(el, config.enter)
  removeClasses(el, config.enterTo)

  addClasses(el, config.leave)
  addClasses(el, config.leaveFrom)
  if (config.leaveStyle) Object.assign(el.style, config.leaveStyle)
  if (config.leaveTransition) el.style.transition = config.leaveTransition

  return nextFrame(() => {
    removeClasses(el, config.leaveFrom)
    addClasses(el, config.leaveTo)
    if (config.leaveToStyle) Object.assign(el.style, config.leaveToStyle)
  })
}

const applyReducedMotion = (
  stage: string,
  cbs: Partial<TransitionCallbacks>,
  complete: () => void,
) => {
  if (stage === 'entering') {
    cbs.onEnter?.()
    cbs.onAfterEnter?.()
    complete()
  } else if (stage === 'leaving') {
    cbs.onLeave?.()
    cbs.onAfterLeave?.()
    complete()
  }
}

/**
 * Renders a single element with CSS transition enter/exit animation.
 * Uses h(config.tag) — no cloneElement needed.
 */
const TransitionRenderer = (props: TransitionRendererProps): VNode | null => {
  const reducedMotion = useReducedMotion()
  const {
    stage,
    ref: stateRef,
    shouldMount,
    complete,
  } = useTransitionState({
    show: props.show,
    appear: props.appear ?? props.config.appear ?? false,
  })

  const elementRef = createRef<HTMLElement>()
  const mergedRef = mergeRefs(elementRef, stateRef)

  const effectiveUnmount = props.unmount ?? props.config.unmount ?? true
  const effectiveTimeout = props.timeout ?? props.config.timeout ?? 5000

  useAnimationEnd({
    ref: elementRef,
    active: () => (stage() === 'entering' || stage() === 'leaving') && !reducedMotion(),
    timeout: effectiveTimeout,
    onEnd: () => {
      if (stage() === 'entering') {
        props.callbacks.onAfterEnter?.()
      } else if (stage() === 'leaving') {
        props.callbacks.onAfterLeave?.()
      }
      complete()
    },
  })

  watch(
    () => stage(),
    (currentStage) => {
      const el = elementRef.current
      if (!el) return

      if (reducedMotion()) {
        applyReducedMotion(currentStage, props.callbacks, complete)
        return
      }

      if (currentStage === 'entering') {
        props.callbacks.onEnter?.()
        const frameId = applyEnter(el, props.config)
        return () => cancelAnimationFrame(frameId)
      }

      if (currentStage === 'leaving') {
        props.callbacks.onLeave?.()
        const frameId = applyLeave(el, props.config)
        return () => cancelAnimationFrame(frameId)
      }

      if (currentStage === 'entered') {
        removeClasses(el, props.config.enter)
        el.style.transition = ''
      }
    },
    { immediate: true },
  )

  return (
    <Show
      when={shouldMount}
      fallback={
        effectiveUnmount
          ? null
          : h(
              props.config.tag,
              {
                ref: mergedRef,
                ...props.htmlProps,
                style: {
                  ...((props.htmlProps.style as CSSProperties) ?? {}),
                  display: 'none',
                },
              },
              props.children,
            )
      }
    >
      {h(props.config.tag, { ref: mergedRef, ...props.htmlProps }, props.children)}
    </Show>
  )
}

export default TransitionRenderer
