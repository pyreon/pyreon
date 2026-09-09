import type { VNode } from '@pyreon/core'
import { createRef, cx, h, mergeProps, Show } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { CSSProperties, TransitionCallbacks } from '../types'
import useAnimationEnd from '../useAnimationEnd'
import { useReducedMotion } from '../useReducedMotion'
import useTransitionState from '../useTransitionState'
import { isDynamicProp, readCallbacks, readLive, resolveLive } from '../live-prop'
import { addClasses, mergeRefs, nextFrame, removeClasses, setTransition } from '../utils'
import type { KineticConfig } from './types'

type TransitionRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  show: () => boolean
  /** Construction-time — a first-mount question, spent once the ref wires up. */
  appear?: boolean | undefined
  /** Live: `<Show>` consults the fallback on every hide, so accept an accessor. */
  unmount?: boolean | (() => boolean | undefined) | undefined
  /** Live: the animation-end deadline is re-armed per cycle. */
  timeout?: number | (() => number | undefined) | undefined
  /** A LIVE HOLDER — read each entry through `readLive` at the point of call. */
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
  if (config.enterTransition) setTransition(el, config.enterTransition)

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
  if (config.leaveTransition) setTransition(el, config.leaveTransition, 'leave')

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

  // Accessors, not values: resolved at each point of USE so a prop that
  // arrived as a compiler `_rp` getter is re-read rather than frozen. The
  // chain config (`.config({ timeout })`) is genuinely static and still
  // flows through `??` unchanged.
  const effectiveUnmount = () => resolveLive(props.unmount) ?? props.config.unmount ?? true
  const effectiveTimeout = () => resolveLive(props.timeout) ?? props.config.timeout ?? 5000

  useAnimationEnd({
    ref: elementRef,
    active: () => (stage() === 'entering' || stage() === 'leaving') && !reducedMotion(),
    timeout: effectiveTimeout,
    onEnd: () => {
      // `onEnd` only fires while `active` is true (stage ∈ {entering, leaving}),
      // so the `else` is necessarily the leaving case — a plain `else` avoids
      // an unreachable `else if (stage() === 'leaving')` false arm. See the
      // matching note in Transition.tsx.
      if (stage() === 'entering') {
        readLive<TransitionCallbacks['onAfterEnter']>(props.callbacks, 'onAfterEnter')?.()
      } else {
        readLive<TransitionCallbacks['onAfterLeave']>(props.callbacks, 'onAfterLeave')?.()
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
        applyReducedMotion(currentStage, readCallbacks(props.callbacks), complete)
        return
      }

      if (currentStage === 'entering') {
        readLive<TransitionCallbacks['onEnter']>(props.callbacks, 'onEnter')?.()
        return applyEnter(el, props.config)
      }

      if (currentStage === 'leaving') {
        readLive<TransitionCallbacks['onLeave']>(props.callbacks, 'onLeave')?.()
        return applyLeave(el, props.config)
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
    const unmountCanChange = isDynamicProp(props, 'unmount')
    const hiddenFallback = () =>
      effectiveUnmount()
        ? null
        : h(
            props.config.tag,
            // mergeProps keeps every reactive HTML-attr getter; ref + the
            // hidden-state `display:none` style come last and win. The
            // `props.htmlProps.style` read seeds the hidden style — display:none
            // must compose over the user's. UNTRACKED: this body's job is
            // `effectiveUnmount()`, and a tracked style read here would
            // subscribe the fallback to it and remount the hidden node whenever
            // the user's style moved.
            mergeProps(props.htmlProps, {
              ref: mergedRef,
              style: {
                ...readLive<CSSProperties>(props.htmlProps, 'style'),
                display: 'none',
              },
            }),
            props.children,
          )
    return (
      <Show
        when={shouldMount}
        // Accessor ONLY when `unmount` can change — see `<Transition>`'s note
        // and `isDynamicProp`. The static case keeps the plain value and never
        // creates the nested reactive boundary.
        fallback={unmountCanChange ? hiddenFallback : hiddenFallback()}
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
