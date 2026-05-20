import type { VNode } from '@pyreon/core'
import { createRef, cx, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { ClassTransitionProps, StyleTransitionProps, TransitionCallbacks } from '../types'
import useAnimationEnd from '../useAnimationEnd'
import { useReducedMotion } from '../useReducedMotion'
import useTransitionState from '../useTransitionState'
import {
  addClasses,
  cloneVNode,
  mergeRefs,
  mergeStyles,
  nextFrame,
  removeClasses,
  resolveChildren,
} from '../utils'

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
  // Symmetric to applyLeave: clear residual leave-cycle classes — including
  // the `leaveTo`/`enterFrom` class the SSR/initially-hidden render path
  // inlines (see the `wasInitiallyShown` branch below). Without this, the
  // SSR-baked hidden class would compete with `enterTo`'s CSS rules.
  removeClasses(el, config.leave)
  removeClasses(el, config.leaveFrom)
  removeClasses(el, config.leaveTo)

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
  // The Pyreon compiler wraps `{cloneVNode(child, {...})}` JSX child
  // expressions in StaggerRenderer/GroupRenderer as `() => cloneVNode(...)`
  // (prop-inlining for reactivity — see `resolveChildren` jsdoc). At this
  // boundary `props.children` therefore arrives as a FUNCTION instead of a
  // VNode. cloneVNode-on-a-function silently produces `{type: undefined,
  // props: {ref: ...}}` (spreading a function yields no own properties
  // because functions have none enumerable), which mountElement renders
  // as a literal `<undefined>` tag in the DOM — the SSG'd `<h1>Hello</h1>`
  // becomes an empty `<undefined></undefined>` post-hydrate (reproducer:
  // bokisch.com Intro section). Resolve eagerly so the entire body below
  // can treat `child` as a static VNode.
  const child = resolveChildren(props.children) as VNode
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
    (child?.props as Record<string, unknown>)?.ref as
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

  // Initially-visible items keep the original Show-gated mount, preserving
  // the documented runtime-unmount semantic for visible→hidden. The SSR
  // bug (children dropped from prerendered HTML) only fires for the
  // initially-HIDDEN case below, where `<Show when={false}>` renders `null`
  // on the server. For Stagger/Group usage at SSR (when the parent's
  // `show: () => false`), each per-item TransitionItem hit this and
  // dropped its child — full list missing from prerendered HTML.
  //
  // Mirrors the fix in `<Transition>` (PR #717) and `TransitionRenderer`
  // (same PR as this). Ecosystem norm: content is structural, animation
  // is visual.
  const wasInitiallyShown = props.show()
  if (wasInitiallyShown) {
    return (
      <Show
        when={shouldMount}
        fallback={
          unmount
            ? null
            : cloneVNode(child, {
                ref: mergedRef,
                style: mergeStyles(
                  (child?.props as Record<string, unknown>)?.style as
                    | Record<string, string | number | undefined>
                    | undefined,
                  { display: 'none' },
                ),
              })
        }
      >
        {cloneVNode(child, { ref: mergedRef })}
      </Show>
    )
  }

  // Initially-hidden path — always emit the child with hidden-state class +
  // style inlined. `leaveTo`/`leaveToStyle` (explicit hidden-end state)
  // wins; falls back to `enterFrom`/`enterStyle` (pre-enter state — covers
  // both class-based scroll-reveal AND the preset path, where
  // `@pyreon/kinetic-presets` factories populate `enterStyle` as the
  // hidden state but may not set `leaveToStyle`).
  //
  // Trade-off: for an initially-hidden item, `unmount: true` no longer
  // triggers a true DOM removal after a later leave animation completes.
  // Initially-visible items keep the unmount semantic.
  const hiddenClass = props.leaveTo ?? props.enterFrom
  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  const childProps = (child?.props ?? {}) as Record<string, unknown>
  const childClass = childProps.class
  const mergedClass = hiddenClass
    ? cx([childClass as Parameters<typeof cx>[0], hiddenClass])
    : undefined
  const mergedStyle = mergeStyles(
    childProps.style as Record<string, string | number | undefined> | undefined,
    hiddenStyle,
  )

  const extra: Record<string, unknown> = { ref: mergedRef }
  if (mergedClass !== undefined) extra.class = mergedClass
  if (mergedStyle !== undefined) extra.style = mergedStyle

  return cloneVNode(child, extra)
}

export default TransitionItem
