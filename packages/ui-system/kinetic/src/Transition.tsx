import type { VNode } from '@pyreon/core'
import { createRef, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { ClassTransitionProps, StyleTransitionProps, TransitionProps } from './types'
import useAnimationEnd from './useAnimationEnd'
import { useReducedMotion } from './useReducedMotion'
import useTransitionState from './useTransitionState'
import { addClasses, cloneVNode, mergeRefs, mergeStyles, nextFrame, removeClasses } from './utils'

const applyEnter = (
  el: HTMLElement,
  {
    enter,
    enterFrom,
    enterTo,
    enterStyle,
    enterToStyle,
    enterTransition,
  }: ClassTransitionProps & StyleTransitionProps,
) => {
  addClasses(el, enter)
  addClasses(el, enterFrom)
  if (enterStyle) Object.assign(el.style, enterStyle)
  if (enterTransition) el.style.transition = enterTransition

  return nextFrame(() => {
    removeClasses(el, enterFrom)
    addClasses(el, enterTo)
    if (enterToStyle) Object.assign(el.style, enterToStyle)
  })
}

const applyLeave = (
  el: HTMLElement,
  {
    enter,
    enterTo,
    leave,
    leaveFrom,
    leaveTo,
    leaveStyle,
    leaveToStyle,
    leaveTransition,
  }: ClassTransitionProps & StyleTransitionProps,
) => {
  removeClasses(el, enter)
  removeClasses(el, enterTo)

  addClasses(el, leave)
  addClasses(el, leaveFrom)
  if (leaveStyle) Object.assign(el.style, leaveStyle)
  if (leaveTransition) el.style.transition = leaveTransition

  return nextFrame(() => {
    removeClasses(el, leaveFrom)
    addClasses(el, leaveTo)
    if (leaveToStyle) Object.assign(el.style, leaveToStyle)
  })
}

const applyReducedMotion = (
  stage: string,
  callbacks: {
    onEnter?: (() => void) | undefined
    onAfterEnter?: (() => void) | undefined
    onLeave?: (() => void) | undefined
    onAfterLeave?: (() => void) | undefined
  },
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

const Transition = (props: TransitionProps): VNode | null => {
  const appear = props.appear ?? false
  const unmount = props.unmount ?? true
  const timeout = props.timeout ?? 5000

  const reducedMotion = useReducedMotion()
  const {
    stage,
    ref: stateRef,
    shouldMount,
    complete,
  } = useTransitionState({
    show: props.show,
    appear,
  })

  const elementRef = createRef<HTMLElement>()
  const childProps = (props.children.props ?? {}) as Record<string, unknown>
  const mergedRef = mergeRefs(
    elementRef,
    stateRef,
    childProps.ref as ((el: HTMLElement | null) => void) | undefined,
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
                childProps.style as Record<string, string | number | undefined> | undefined,
                { display: 'none' },
              ),
            })
      }
    >
      {cloneVNode(props.children, { ref: mergedRef })}
    </Show>
  )
}

export default Transition
