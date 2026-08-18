// Web implementation of `<Transition>` — animate a subtree in and out.

import { h, onUnmount } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import type { TransitionEasing, TransitionPreset, TransitionProps } from '../types/animation'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/** Mirrors the native `normalizePresetName` — lower-case, strip `-`/`_`. */
const normalizePreset = (name: string | undefined): string =>
  name === undefined ? '' : name.toLowerCase().replace(/[-_]/g, '')

/** The hidden end of a preset. The shown end is always opacity 1 / no transform. */
interface HiddenState {
  opacity: string
  transform: string
}

/**
 * Preset → hidden state, mirroring `swiftTransitionForName` /
 * `kotlinTransitionForName` value-for-value.
 *
 * Direction is the direction of TRAVEL, so a "slide-up" rises INTO place
 * and therefore STARTS below (`translateY(100%)`), matching SwiftUI's
 * `.move(edge: .bottom)` and Compose's `slideInVertically { it }`.
 * A percentage translate is the web spelling of "its own full size",
 * which is what both native forms use.
 *
 * `scale(0)` matches both platforms' defaults (`AnyTransition.scale` is
 * `.scale(scale: 0)`; Compose's `scaleIn()` defaults `initialScale = 0f`).
 * Every preset except the bare fade combines with opacity, exactly as
 * both emitters do via `.combined(with: .opacity)` / `+ fadeIn(...)`.
 *
 * An unrecognized name falls back to a fade — the same graceful answer
 * the emitters give (they additionally warn; here the closed
 * `TransitionPreset` union means a typo is a build error instead).
 */
function hiddenStateFor(name: string | undefined): HiddenState {
  switch (normalizePreset(name)) {
    case 'scale':
    case 'scalein':
      return { opacity: '0', transform: 'scale(0)' }
    case 'slideup':
      return { opacity: '0', transform: 'translateY(100%)' }
    case 'slidedown':
      return { opacity: '0', transform: 'translateY(-100%)' }
    case 'slideleft':
      return { opacity: '0', transform: 'translateX(100%)' }
    case 'slideright':
      return { opacity: '0', transform: 'translateX(-100%)' }
    default:
      return { opacity: '0', transform: 'none' }
  }
}

const DEFAULT_DURATION_MS = 300
const DEFAULT_EASING: TransitionEasing = 'ease-in-out'
/** Only these two properties animate, so only these two are armed. */
const ANIMATED_PROPERTIES = 'opacity, transform'
/**
 * Headroom for the `transitionend` safety timer. `transitionend` can
 * legitimately never fire — a zero duration, an ancestor going
 * `display:none` mid-flight, or a `prefers-reduced-motion` user stylesheet
 * zeroing the duration all suppress it — so the settle must not depend on
 * it alone.
 */
const SETTLE_BUFFER_MS = 60

/**
 * `<Transition>` — animate content in and out of view.
 *
 * Compiles to:
 * - Web (this impl): a wrapper `<div>` whose `opacity` / `transform` are
 *   driven by real CSS transitions
 * - iOS (via PMTC): `ZStack { if show { Group { … }.transition(…) } }`
 *   `.animation(…, value: show)`
 * - Android (via PMTC): `AnimatedVisibility(visible = show, enter =, exit =)`
 *
 * ## Only LONGHANDS are ever assigned
 *
 * `el.style.transition = …` (the SHORTHAND) resets every longhand it
 * omits — `transition-delay` included — in spec-compliant engines, and
 * happy-dom does NOT model that reset, so the damage is invisible to a
 * unit test. `@pyreon/kinetic` shipped exactly that bug (it silently
 * erased per-child stagger delays). This impl writes
 * `transitionProperty` / `transitionDuration` / `transitionTimingFunction`
 * individually and never touches `transitionDelay`, so a consumer's own
 * delay survives untouched.
 *
 * ## Children stay mounted while hidden
 *
 * The hidden state is `display:none` on the wrapper, NOT an unmount. Two
 * reasons: an animation wrapper must never gate its children out of SSR
 * (the `@pyreon/kinetic` SSR rule — content is structural, animation is
 * visual), and it is the ecosystem norm (Framer Motion,
 * react-transition-group, react-spring all render children regardless of
 * animation state). `display:none` also removes the wrapper from flex/grid
 * layout entirely, so a hidden `<Transition>` inside a `<Stack gap>`
 * contributes no gap. On native the platform composes the children only
 * while visible; the observable contract — content present and animated
 * when `show`, absent to the eye and to assistive tech when not — matches.
 *
 * ## The initial render never animates
 *
 * Mounting with `show` already true paints the content at rest, matching
 * `AnimatedVisibility(visible = true)` on first composition and SwiftUI's
 * `.animation(_:value:)`, neither of which animates the first frame.
 */
export const Transition = (props: TransitionProps): VNode => {
  const getShow = (): boolean => {
    const s = props.show
    return typeof s === 'function' ? (s as () => boolean)() : (s as boolean)
  }

  // Read once at setup: the native emitters require these to be static
  // literals (a non-literal `duration` warns and falls back there), so
  // there is nothing reactive to track.
  const hidden = hiddenStateFor(props.name as TransitionPreset | undefined)
  const enterMs = props.enterDuration ?? props.duration ?? DEFAULT_DURATION_MS
  const leaveMs = props.leaveDuration ?? props.duration ?? DEFAULT_DURATION_MS
  const enterEase = props.enterEasing ?? props.easing ?? DEFAULT_EASING
  const leaveEase = props.leaveEasing ?? props.easing ?? DEFAULT_EASING

  let el: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingDone: (() => void) | null = null
  // What the DOM currently reflects. Seeded from the setup-time value so
  // the very first effect run (which happens before `ref` fires) is a
  // no-op rather than a spurious animation.
  let applied = getShow()

  /**
   * Drop any in-flight completion. Clearing the timer here AND in
   * `settle` is the Class-I discipline: a `Promise.race`-shaped pair of
   * "whichever finishes first" paths must clear the loser on every exit.
   */
  const cancelPending = (): void => {
    pendingDone = null
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const settle = (): void => {
    const done = pendingDone
    cancelPending()
    done?.()
  }

  /**
   * Arming a settle can never orphan the previous one: the clear lives
   * HERE rather than relying on every caller remembering `cancelPending`.
   * A responsibility a caller has to remember is one a future caller will
   * forget, and the cost is a leaked timer holding this closure — and the
   * element it captures — for the whole animation window.
   */
  const scheduleSettle = (ms: number, done: () => void): void => {
    cancelPending()
    pendingDone = done
    timer = setTimeout(settle, ms + SETTLE_BUFFER_MS)
  }

  const clearArmedTransition = (node: HTMLElement): void => {
    node.style.transitionProperty = ''
    node.style.transitionDuration = ''
    node.style.transitionTimingFunction = ''
  }

  const armTransition = (node: HTMLElement, ms: number, easing: TransitionEasing): void => {
    node.style.transitionProperty = ANIMATED_PROPERTIES
    node.style.transitionDuration = `${ms}ms`
    node.style.transitionTimingFunction = easing
  }

  /** Snap to an end state with no animation (initial paint / reconcile). */
  const applyResting = (node: HTMLElement, shown: boolean): void => {
    cancelPending()
    clearArmedTransition(node)
    node.style.display = shown ? '' : 'none'
    node.style.opacity = shown ? '' : hidden.opacity
    node.style.transform = shown ? '' : hidden.transform
  }

  /**
   * Read a geometry property to force a style + layout flush, so the
   * just-assigned "from" values become the transition's committed start.
   * Without it the browser coalesces both assignments into one style
   * recalculation and nothing animates.
   */
  const flushStyles = (node: HTMLElement): void => {
    node.getBoundingClientRect()
  }

  const enter = (node: HTMLElement): void => {
    cancelPending()
    // Laid out again first — a `display:none` element cannot transition,
    // and the hidden state has to be its committed starting point.
    node.style.transitionProperty = 'none'
    node.style.display = ''
    node.style.opacity = hidden.opacity
    node.style.transform = hidden.transform
    flushStyles(node)
    armTransition(node, enterMs, enterEase)
    node.style.opacity = '1'
    node.style.transform = 'none'
    scheduleSettle(enterMs, () => {
      // Resting shown state carries no inline animation styles, so a
      // consumer's own CSS is back in charge once the enter completes.
      clearArmedTransition(node)
      node.style.opacity = ''
      node.style.transform = ''
    })
  }

  const leave = (node: HTMLElement): void => {
    cancelPending()
    node.style.transitionProperty = 'none'
    node.style.opacity = '1'
    node.style.transform = 'none'
    flushStyles(node)
    armTransition(node, leaveMs, leaveEase)
    node.style.opacity = hidden.opacity
    node.style.transform = hidden.transform
    scheduleSettle(leaveMs, () => {
      clearArmedTransition(node)
      node.style.display = 'none'
    })
  }

  const ref = (node: HTMLElement | null): void => {
    el = node
    if (node === null) return
    // `show` can change between setup and mount (the first effect run
    // happens while `el` is still null). Reconcile here so the mounted
    // DOM always reflects the CURRENT value, not the setup-time one.
    const now = getShow()
    if (now !== applied) {
      applied = now
      applyResting(node, now)
    }
  }

  renderEffect(() => {
    const next = getShow()
    const node = el
    if (node === null || next === applied) return
    applied = next
    if (next) enter(node)
    else leave(node)
  })

  /**
   * `transitionend` BUBBLES, so a child's own animation would otherwise
   * settle ours — filter to the wrapper itself. Both armed properties
   * fire, and `settle` is idempotent (it nulls `pendingDone` first), so
   * the second event is a no-op. An INTERRUPTED transition fires
   * `transitioncancel` rather than `transitionend`, and `cancelPending`
   * has already dropped that run's completion by then.
   */
  const onTransitionEnd = (e: Event): void => {
    if (e.target !== el) return
    settle()
  }

  onUnmount(cancelPending)

  // Seed the hidden state into the rendered markup rather than applying it
  // after mount: SSR must emit the hidden wrapper directly, or a
  // server-rendered page flashes its hidden content before hydration.
  const style: Record<string, string> = {}
  if (!applied) {
    style.display = 'none'
    style.opacity = hidden.opacity
    style.transform = hidden.transform
  }

  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      ref,
      onTransitionEnd,
      style: mergePassthroughStyle(style, props.style),
    },
    props.children,
  )
}
