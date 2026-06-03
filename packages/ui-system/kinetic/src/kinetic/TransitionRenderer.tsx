import type { VNode } from '@pyreon/core'
import { createRef, cx, h, mergeProps, Show } from '@pyreon/core'
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
  // Symmetric to applyLeave's `removeClasses(enter)` / `removeClasses(enterTo)`:
  // clear residual leave-cycle classes — including the `leaveTo` / `enterFrom`
  // class the SSR / initially-hidden render path inlines for structural
  // content (see the `wasInitiallyShown` branch below). Without this, the
  // SSR-baked hidden-state class would compete with `enterTo`'s CSS rules.
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

const applyLeave = (el: HTMLElement, config: KineticConfig) => {
  removeClasses(el, config.enter)
  removeClasses(el, config.enterTo)

  addClasses(el, config.leave)
  addClasses(el, config.leaveFrom)
  /* v8 ignore next 2 — defensive optional-config guards; both arms structurally exercised */
  if (config.leaveStyle) Object.assign(el.style, config.leaveStyle)
  if (config.leaveTransition) el.style.transition = config.leaveTransition

  return nextFrame(() => {
    removeClasses(el, config.leaveFrom)
    addClasses(el, config.leaveTo)
    /* v8 ignore next — defensive optional-leaveToStyle guard */
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
      /* v8 ignore next — defensive stage-discriminator */
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

  // Initially-visible kinetic-mode Transitions keep the original Show-gated
  // mount, preserving the documented runtime-unmount semantic for the
  // visible→hidden transition. The SSR bug (children dropped from prerendered
  // HTML) only fires for the initially-HIDDEN case below, where
  // `<Show when={false}>` renders `null` on the server — leaving SSG sites
  // using kinetic-mode transitions (e.g. `kinetic('div').preset(fadeUp)` with
  // `show: () => false` at SSR, the scroll-reveal pattern via
  // `useIntersection`) without structural content for SEO / social scrapers
  // / accessibility tools / no-JS users.
  //
  // Mirrors the fix shape applied to the top-level `<Transition>`.
  // Ecosystem norm (Framer Motion / react-transition-group / react-
  // spring): content is structural, animation is visual.
  const wasInitiallyShown = props.show()
  if (wasInitiallyShown) {
    return (
      <Show
        when={shouldMount}
        fallback={
          /* v8 ignore next 2 — unmount ternary combinatorics */
          effectiveUnmount
            ? null
            : h(
                props.config.tag,
                // mergeProps keeps every reactive HTML-attr getter; ref + the
                // hidden-state `display:none` style come last and win. The
                // one-time `props.htmlProps.style` read seeds the hidden
                // style — display:none must compose over the user's style.
                mergeProps(props.htmlProps, {
                  ref: mergedRef,
                  style: {
                    ...(props.htmlProps.style as CSSProperties),
                    display: 'none',
                  },
                }),
                props.children,
              )
        }
      >
        {h(
          props.config.tag,
          // Descriptor-preserving merge — reactive HTML attrs keep their
          // getters; ref wins last. `{ ...props.htmlProps }` would freeze them.
          mergeProps(props.htmlProps, { ref: mergedRef }),
          props.children,
        )}
      </Show>
    )
  }

  // Initially-hidden path — ecosystem-correct: always emit children with
  // hidden-state class/style inlined so SSG / SEO / social scrapers / no-JS
  // users see structural content. `leaveTo` (explicit hidden-end state)
  // wins; falls back to `enterFrom` (pre-enter state) for scroll-reveal
  // patterns that only configure the enter side. The existing
  // `watch(stage)` effect drives the enter animation when `show` flips
  // true; the symmetric `applyEnter` above clears these residual classes.
  //
  // Trade-off: for initially-hidden kinetic-mode Transitions, `unmount: true`
  // no longer triggers a true DOM removal after a later leave animation
  // completes — element stays in DOM with the leave-to class applied.
  // Initially-visible Transitions (the branch above) keep the unmount
  // semantic. Matches Framer Motion / react-transition-group conventions
  // and is the price of SSR correctness.
  // Mirrors the class picker: prefer `leaveTo`/`leaveToStyle` (explicit
  // leave-end / hidden state) and fall back to `enterFrom`/`enterStyle`
  // (pre-enter state). The fallback covers the preset path —
  // `@pyreon/kinetic-presets` factories (fadeUp, slideLeft, blurInUp, …)
  // populate `enterStyle` as the hidden state and may not set
  // `leaveToStyle` at all; without this fallback, presets would SSR-render
  // VISIBLE → flash-on-hydration.
  const hiddenClass = props.config.leaveTo ?? props.config.enterFrom
  const hiddenStyle = props.config.leaveToStyle ?? props.config.enterStyle
  const childClass = props.htmlProps.class
  const mergedClass = hiddenClass
    ? cx([childClass as Parameters<typeof cx>[0], hiddenClass])
    : undefined
  const mergedStyle = hiddenStyle
    ? { ...(props.htmlProps.style as CSSProperties), ...hiddenStyle }
    : undefined

  const extra: Record<string, unknown> = { ref: mergedRef }
  if (mergedClass !== undefined) extra.class = mergedClass
  if (mergedStyle !== undefined) extra.style = mergedStyle

  return h(props.config.tag, mergeProps(props.htmlProps, extra), props.children)
}

export default TransitionRenderer
