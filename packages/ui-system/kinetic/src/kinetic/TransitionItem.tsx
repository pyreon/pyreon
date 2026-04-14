import type { VNode } from '@pyreon/core'
import { createRef, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { ClassTransitionProps, StyleTransitionProps, TransitionCallbacks } from '../types'
import useAnimationEnd from '../useAnimationEnd'
import { useReducedMotion } from '../useReducedMotion'
import useTransitionState from '../useTransitionState'
import { addClasses, cloneVNode, mergeRefs, mergeStyles, nextFrame, removeClasses } from '../utils'

type TransitionItemProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    show: () => boolean
    appear?: boolean | undefined
    unmount?: boolean | undefined
    timeout?: number | undefined
    delay?: number | undefined
    children: VNode
  }

const applyEnter = (el: HTMLElement, config: ClassTransitionProps & StyleTransitionProps) => {
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

const applyLeave = (el: HTMLElement, config: ClassTransitionProps & StyleTransitionProps) => {
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
  callbacks: Partial<TransitionCallbacks>,
  complete: () => void,
) => {
  if (stage === 'entering') {
    callbacks.onEnter?.()
    callbacks.onAfterEnter?.()
    complete()
  } else if (stage === 'leaving') {
    callbacks.onLeave?.()
    callbacks.onAfterLeave?.()
    complete()
  }
}

/**
 * Internal per-child transition component. Used by StaggerRenderer and
 * GroupRenderer to give each child its own animation state.
 *
 * Uses cloneVNode to inject ref onto the child — the child must accept ref.
 */
const TransitionItem = (props: TransitionItemProps): VNode | null => {
  const appear = props.appear ?? false
  const unmount = props.unmount ?? true
  const timeout = props.timeout ?? 5000
  const reducedMotion = useReducedMotion()
  const { stage, ref: stateRef, shouldMount, complete } = useTransitionState({
    show: props.show,
    appear,
  })

  const elementRef = createRef<HTMLElement>()
  const mergedRef = mergeRefs(
    elementRef,
    stateRef,
    (props.children.props as Record<string, unknown>)?.ref as
      | ((el: HTMLElement | null) => void)
      | undefined,
  )

  const callbacks = {
    onEnter: props.onEnter,
    onAfterEnter: props.onAfterEnter,
    onLeave: props.onLeave,
    onAfterLeave: props.onAfterLeave,
  }

  const transitionConfig = {
    enter: props.enter,
    enterFrom: props.enterFrom,
    enterTo: props.enterTo,
    leave: props.leave,
    leaveFrom: props.leaveFrom,
    leaveTo: props.leaveTo,
    enterStyle: props.enterStyle,
    enterToStyle: props.enterToStyle,
    enterTransition: props.enterTransition,
    leaveStyle: props.leaveStyle,
    leaveToStyle: props.leaveToStyle,
    leaveTransition: props.leaveTransition,
  }

  useAnimationEnd({
    ref: elementRef,
    active: () => (stage() === 'entering' || stage() === 'leaving') && !reducedMotion(),
    timeout,
    onEnd: () => {
      if (stage() === 'entering') {
        callbacks.onAfterEnter?.()
      } else if (stage() === 'leaving') {
        callbacks.onAfterLeave?.()
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
        applyReducedMotion(currentStage, callbacks, complete)
        return
      }

      if (currentStage === 'entering') {
        callbacks.onEnter?.()
        const frameId = applyEnter(el, transitionConfig)
        return () => cancelAnimationFrame(frameId)
      }

      if (currentStage === 'leaving') {
        callbacks.onLeave?.()
        const frameId = applyLeave(el, transitionConfig)
        return () => cancelAnimationFrame(frameId)
      }

      if (currentStage === 'entered') {
        removeClasses(el, props.enter)
        el.style.transition = ''
      }
    },
    { immediate: true },
  )

  return (
    <Show
      when={shouldMount}
      fallback={
        unmount
          ? null
          : cloneVNode(props.children, {
              ref: mergedRef,
              style: mergeStyles(
                (props.children.props as Record<string, unknown>)?.style as
                  | Record<string, string | number | undefined>
                  | undefined,
                { display: 'none' },
              ),
            })
      }
    >
      {cloneVNode(props.children, { ref: mergedRef })}
    </Show>
  )
}

export default TransitionItem
