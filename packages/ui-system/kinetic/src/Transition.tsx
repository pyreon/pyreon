import type { VNode } from '@pyreon/core'
import { createRef, cx, Show } from '@pyreon/core'
import { runUntracked, watch } from '@pyreon/reactivity'
import type {
  ClassTransitionProps,
  StyleTransitionProps,
  TransitionCallbacks,
  TransitionEasing,
  TransitionProps,
} from './types'
import { isDynamicProp, readCallbacks, readLive, readLiveValue } from './live-prop'
import { showAccessorFrom } from './show-accessor'
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
  setTransition,
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
  if (enterTransition) setTransition(el, enterTransition)

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
  if (leaveTransition) setTransition(el, leaveTransition, 'leave')

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
  // CONSTRUCTION-TIME, read once here on purpose: `appear` answers "animate on
  // the FIRST mount?", which `useTransitionState` consumes to pick the initial
  // stage and to arm a one-shot latch that is spent as soon as the ref wires
  // up. A later value has nowhere to go.
  const appear = props.appear ?? false

  // LIVE. `<Show>` re-reads `props.fallback` on every flip, so the unmount
  // policy is consulted on every hide — a value captured here would answer for
  // all of them with whatever it was at mount.
  const unmount = () => readLiveValue<boolean>(props, 'unmount') ?? true

  // LIVE. The deadline is re-armed on each active cycle; `useAnimationEnd`
  // resolves the accessor there.
  const timeout = () => readLiveValue<number>(props, 'timeout') ?? 5000

  const reducedMotion = useReducedMotion()
  const {
    stage,
    ref: stateRef,
    shouldMount,
    complete,
  } = useTransitionState({
    // Re-reads `props.show` per call — `show={sig}` arrives as a live getter.
    show: showAccessorFrom(props),
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

  // Numeric timing -> the CSS shorthand the web renderer applies. An explicit
  // `enterTransition` / `leaveTransition` still wins, so this only fills a gap
  // rather than overriding an author's own shorthand. Without it, `duration` /
  // `easing` (which BOTH native targets have honoured since the config arc)
  // were silently ignored in a browser — one source, two behaviours.
  const timingShorthand = (
    ms: number | undefined,
    curve: TransitionEasing | undefined,
  ): string | undefined =>
    ms === undefined && curve === undefined
      ? undefined
      : `all ${ms ?? 300}ms ${curve ?? 'ease-in-out'}`

  // What the initially-hidden render actually PUT on the element, recorded
  // rather than re-derived. `readTransitionConfig()` below is LIVE and the bake
  // at the bottom of this component is ONE-SHOT, so the two can now disagree:
  // a live `removeClasses(el, leaveTo)` strips the CURRENT class while the
  // element still wears the one it was born with, and it enters still carrying
  // its hidden state — invisible, silently, which is this PR's own bug one prop
  // over. The rule the near-miss teaches: a value APPLIED once and REMOVED
  // later must be REMEMBERED, never read twice.
  let bakedHiddenClass: string | undefined

  // Built PER CYCLE, not captured at setup. Every field here is consumed by
  // `applyEnter` / `applyLeave` each time the stage changes, so the value that
  // should win is the current one — a `duration={fast() ? 100 : 300}` or a
  // themed `enterTransition` is an ordinary shape. One `runUntracked` frame
  // covers all sixteen reads; UNTRACKED is the load-bearing half, since this
  // runs inside the stage `watch` and a tracked read would make an easing
  // change re-enter the callback and RESTART the animation. See `live-prop.ts`.
  const readTransitionConfig = (): ClassTransitionProps & StyleTransitionProps =>
    runUntracked(() => ({
      enter: props.enter,
      enterFrom: props.enterFrom,
      enterTo: props.enterTo,
      leave: props.leave,
      leaveFrom: props.leaveFrom,
      leaveTo: props.leaveTo,
      enterStyle: props.enterStyle,
      enterToStyle: props.enterToStyle,
      enterTransition:
        props.enterTransition ??
        timingShorthand(props.enterDuration ?? props.duration, props.enterEasing ?? props.easing),
      leaveStyle: props.leaveStyle,
      leaveToStyle: props.leaveToStyle,
      leaveTransition:
        props.leaveTransition ??
        timingShorthand(props.leaveDuration ?? props.duration, props.leaveEasing ?? props.easing),
    }))

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
        readLive<TransitionCallbacks['onAfterEnter']>(props, 'onAfterEnter')?.()
      } else {
        readLive<TransitionCallbacks['onAfterLeave']>(props, 'onAfterLeave')?.()
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
        applyReducedMotion(currentStage, readCallbacks(props), complete)
        return
      }

      if (currentStage === 'entering') {
        // Exactly what the bake applied — a superset of `applyEnter`'s own
        // live `removeClasses(leaveTo)`, so it can never remove less.
        removeClasses(el, bakedHiddenClass)
        readLive<TransitionCallbacks['onEnter']>(props, 'onEnter')?.()
        return applyEnter(el, readTransitionConfig())
      }

      if (currentStage === 'leaving') {
        readLive<TransitionCallbacks['onLeave']>(props, 'onLeave')?.()
        return applyLeave(el, readTransitionConfig())
      }

      if (currentStage === 'entered') {
        // Untracked like every other config read in this watch — a bare
        // `props.enter` here subscribes the stage watcher to the class signal.
        removeClasses(el, readLive<string>(props, 'enter'))
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
  const wasInitiallyShown = showAccessorFrom(props)()
  if (wasInitiallyShown) {
    const unmountCanChange = isDynamicProp(props, 'unmount')
    const hiddenFallback = () =>
      unmount()
        ? null
        : cloneVNode(child, {
            ref: mergedRef,
            style: mergeStyles(
              childProps.style as Record<string, string | number | undefined> | undefined,
              { display: 'none' },
            ),
          })
    return (
      <Show
        when={shouldMount}
        // An accessor ONLY when `unmount` can actually change. `<Show>` re-reads
        // its fallback per flip either way, so the accessor is what keeps a
        // getter-backed `unmount` from answering every future hide with its
        // mount-time value — but it also costs a nested reactive boundary per
        // hidden element, and for the default static `unmount` that boundary
        // would exist forever to recompute a constant.
        fallback={unmountCanChange ? hiddenFallback : hiddenFallback()}
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
  // CONSTRUCTION-TIME, and deliberately so. These seed the ONE-SHOT hidden
  // appearance of the initially-hidden render (the SSR / first-paint state);
  // from the first animation onward the class and style in force come from
  // `readTransitionConfig()` above, which IS live. Making them live too would
  // mean handing a FUNCTION-valued `class` / `style` to `cloneVNode`, and the
  // child may be a COMPONENT — changing what `props.class` is for that child,
  // to re-render a state the imperative path already overwrites.
  const hiddenClass = props.leaveTo ?? props.enterFrom
  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  // Recorded for the enter to strip — see `bakedHiddenClass` above.
  //
  // The STYLE half is deliberately NOT cleared on enter. `applyEnter` overwrites
  // its keys with the live `enterStyle`, exactly as before; blanking the baked
  // keys instead would delete the animation's FROM-state whenever the hidden
  // style came from `leaveToStyle` and `enterStyle` is absent, turning a
  // transition into a jump. A narrow residue therefore remains, unchanged in
  // kind from before this PR: keys present in the baked style and absent from
  // the live `enterStyle`/`enterToStyle` persist.
  bakedHiddenClass = hiddenClass
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
