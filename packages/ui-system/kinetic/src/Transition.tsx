import type { VNode } from '@pyreon/core'
import { createRef, cx, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { ClassTransitionProps, StyleTransitionProps, TransitionProps } from './types'
import useAnimationEnd from './useAnimationEnd'
import { useReducedMotion } from './useReducedMotion'
import useTransitionState from './useTransitionState'
import {
  addClasses,
  cloneVNode,
  mergeRefs,
  mergeStyles,
  nextFrame,
  removeClasses,
  resolveChildren,
} from './utils'

const applyEnter = (
  el: HTMLElement,
  {
    enter,
    enterFrom,
    enterTo,
    enterStyle,
    enterToStyle,
    enterTransition,
    leave,
    leaveFrom,
    leaveTo,
  }: ClassTransitionProps & StyleTransitionProps,
) => {
  // Symmetric to applyLeave's `removeClasses(enter)` / `removeClasses(enterTo)`:
  // clear any residual leave-cycle classes — including the `leaveTo` /
  // `enterFrom` class the SSR / initial-hidden render path inlines for
  // ecosystem-correct structural content (see the `wasInitiallyShown`
  // branch below). Without this, the SSR-baked hidden-state class would
  // compete with `enterTo`'s CSS rules and the enter animation would
  // visually fight itself.
  removeClasses(el, leave)
  removeClasses(el, leaveFrom)
  removeClasses(el, leaveTo)

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

  // Unwrap the compiler's `() => x` accessor wrap — see `resolveChildren`
  // jsdoc. Parallel to `TransitionItem`'s fix. Without this,
  // `props.children.props` reads `function.props` (undefined), the merged
  // ref is missing the child's own ref, and the downstream `cloneVNode`
  // calls produce `{type: undefined}` → `<undefined>` DOM tags.
  const child = resolveChildren(props.children) as VNode
  const elementRef = createRef<HTMLElement>()
  const childProps = (child?.props ?? {}) as Record<string, unknown>
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
      // `onEnd` only fires while `active` is true (stage ∈ {entering, leaving}
      // — see the `active` accessor), so the `else` is necessarily the leaving
      // case. A redundant `else if (stage() === 'leaving')` here would carry an
      // unreachable false arm (stage can't be entered/hidden at onEnd because
      // useAnimationEnd detaches its listeners the moment stage leaves the
      // active set), so a plain `else` is both correct and fully coverable.
      if (stage() === 'entering') {
        callbacks.onAfterEnter?.()
      } else {
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

  // Initially-visible Transitions keep the original Show-gated mount,
  // which preserves the documented runtime-unmount semantic for the
  // visible → hidden transition (modal close, dropdown collapse, etc.).
  // The SSR bug (children dropped from prerendered HTML) only fires for
  // the initially-HIDDEN case below, because `<Show when={false}>`
  // renders `null` on the server.
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
                  childProps.style as Record<string, string | number | undefined> | undefined,
                  { display: 'none' },
                ),
              })
        }
      >
        {cloneVNode(child, { ref: mergedRef })}
      </Show>
    )
  }

  // Initially-hidden path — ecosystem-correct (Framer Motion / react-
  // transition-group / react-spring all render children in SSR regardless
  // of animation state; visual hiding is class/style only). Always emits
  // children so SSG / SEO / social scrapers / no-JS users see the
  // structural content. The hidden visual is supplied by `leaveTo`
  // (explicit hidden-end state) or `enterFrom` (pre-enter state — covers
  // the scroll-reveal pattern that only configures the enter side).
  //
  // Trade-off: for an initially-hidden Transition, `unmount: true` no
  // longer triggers a true DOM removal after a later leave animation
  // completes — the element stays in DOM with the leave-to class
  // applied. Initially-visible Transitions keep the unmount semantic
  // (the branch above). This matches Framer Motion / react-transition-
  // group conventions and is the price of SSR correctness; the rare
  // user who needs true unmount on a started-hidden element can drive
  // mount/unmount themselves outside `<Transition>`.
  //
  // The `watch(stage)` effect above drives the enter animation when
  // `show` flips true; `applyEnter` (above) clears these residual
  // hidden-state classes so they don't fight `enterTo`.
  // Picker mirrors what #719 introduced for the kinetic(tag).<mode>
  // renderers (TransitionRenderer / TransitionItem / CollapseRenderer):
  // prefer leave-end state, fall back to pre-enter state. The
  // `enterStyle` fallback covers the preset path — `@pyreon/kinetic-presets`
  // factories (fadeUp, blurInUp, slideLeft, …) populate `enterStyle` as
  // the hidden state but may not set `leaveToStyle`. Without this
  // fallback, preset users SSR-render VISIBLE → flash-on-hydration.
  // The class picker already had the `enterFrom` fallback; the style
  // picker mirrors it so both halves match.
  const hiddenClass = props.leaveTo ?? props.enterFrom
  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  const childClass = childProps.class
  const mergedClass = hiddenClass
    ? cx([childClass as Parameters<typeof cx>[0], hiddenClass])
    : undefined
  const mergedStyle = mergeStyles(
    childProps.style as Record<string, string | number | undefined> | undefined,
    hiddenStyle,
  )

  // Build extra-props carefully — undefined values must NOT be passed to
  // cloneVNode because `{...vnode.props, ...extraProps}` spreads them and
  // overrides any user-set `class`/`style` on the child vnode with undefined.
  const extra: Record<string, unknown> = { ref: mergedRef }
  if (mergedClass !== undefined) extra.class = mergedClass
  if (mergedStyle !== undefined) extra.style = mergedStyle

  return cloneVNode(child, extra)
}

export default Transition
