import type { VNode } from '@pyreon/core'
import { createRef, h, mergeProps, Show } from '@pyreon/core'
import { runUntracked, signal, watch } from '@pyreon/reactivity'
import { readLive, resolveLive } from '../live-prop'
import type { CSSProperties, TransitionCallbacks, TransitionStage } from '../types'
import useAnimationEnd from '../useAnimationEnd'
import { useReducedMotion } from '../useReducedMotion'
import type { KineticConfig } from './types'

type CollapseRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  show: () => boolean
  /** Construction-time — a first-mount question, spent once the ref wires up. */
  appear?: boolean | undefined
  /** Live: the animation-end deadline is re-armed per cycle. */
  timeout?: number | (() => number | undefined) | undefined
  /** Live: written to `style.transition` on every stage change. */
  transition?: string | (() => string | undefined) | undefined
  /** A LIVE HOLDER — read each entry through `readLive` at the point of call. */
  callbacks: Partial<TransitionCallbacks>
  children: VNode | VNode[]
}

/**
 * Renders a height-animated collapse. The config.tag becomes the outer
 * wrapper (overflow:hidden + animated height). An inner div measures
 * scrollHeight for the target value.
 */
const CollapseRenderer = ({
  config,
  htmlProps,
  show,
  appear,
  timeout,
  transition,
  callbacks,
  children,
}: CollapseRendererProps): VNode | null => {
  const reducedMotion = useReducedMotion()
  let wrapperRef: { current: HTMLElement | null } = createRef<HTMLElement>()
  const contentRef = createRef<HTMLDivElement>()

  // `appear` is a construction-time question (see the prop doc); the other two
  // are accessors resolved at each point of USE, so a prop that arrived as a
  // compiler `_rp` getter is re-read per cycle rather than frozen at setup.
  const effectiveAppear = appear ?? config.appear ?? false
  const effectiveTimeout = () => resolveLive(timeout) ?? config.timeout ?? 5000
  const effectiveTransition = () =>
    resolveLive(transition) ?? config.transition ?? 'height 300ms ease'

  const initialShow = show()
  const needsAppear = effectiveAppear && initialShow
  const stage = signal<TransitionStage>(initialShow ? 'entered' : 'hidden')
  let isInitialMount = true
  let appearTriggered = false

  // Intercept ref assignment to trigger appear after all refs are wired
  if (needsAppear) {
    const orig = wrapperRef
    const proxy = { current: null as HTMLElement | null }
    Object.defineProperty(proxy, 'current', {
      get() {
        return orig.current
      },
      set(node: HTMLElement | null) {
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
    show,
    (showVal) => {
      if (isInitialMount) {
        isInitialMount = false
        // appear case is handled by ref proxy above
        return
      }

      // A processed run always sees a real `show` change, so showVal correlates
      // with the current stage (show→true only after hidden/leaving, show→false
      // only after entering/entered). The redundant
      // `else if (!showVal && (entered|entering))` would carry an unreachable
      // false arm, so a plain `else` keeps the only reachable behaviour
      // (leaving). See useTransitionState.ts for the full argument.
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
          readLive<TransitionCallbacks['onEnter']>(callbacks, 'onEnter')?.()
          wrapper.style.height = 'auto'
          wrapper.style.overflow = ''
          readLive<TransitionCallbacks['onAfterEnter']>(callbacks, 'onAfterEnter')?.()
          stage.set('entered')
        } else if (currentStage === 'leaving') {
          readLive<TransitionCallbacks['onLeave']>(callbacks, 'onLeave')?.()
          wrapper.style.height = '0px'
          wrapper.style.overflow = 'hidden'
          readLive<TransitionCallbacks['onAfterLeave']>(callbacks, 'onAfterLeave')?.()
          stage.set('hidden')
        }
        return
      }

      if (currentStage === 'entering') {
        readLive<TransitionCallbacks['onEnter']>(callbacks, 'onEnter')?.()
        const height = content.scrollHeight
        wrapper.style.transition = 'none'
        wrapper.style.height = '0px'
        wrapper.style.overflow = 'hidden'
        // Force reflow
        void wrapper.offsetHeight
        wrapper.style.transition = effectiveTransition()
        wrapper.style.height = `${height}px`
      }

      if (currentStage === 'leaving') {
        readLive<TransitionCallbacks['onLeave']>(callbacks, 'onLeave')?.()
        const height = content.scrollHeight
        wrapper.style.transition = 'none'
        wrapper.style.height = `${height}px`
        wrapper.style.overflow = 'hidden'
        // Force reflow
        void wrapper.offsetHeight
        wrapper.style.transition = effectiveTransition()
        wrapper.style.height = '0px'
      }
    },
    { immediate: true },
  )

  useAnimationEnd({
    ref: wrapperRef,
    active: () => (stage() === 'entering' || stage() === 'leaving') && !reducedMotion(),
    timeout: effectiveTimeout,
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
        readLive<TransitionCallbacks['onAfterEnter']>(callbacks, 'onAfterEnter')?.()
        stage.set('entered')
      } else {
        readLive<TransitionCallbacks['onAfterLeave']>(callbacks, 'onAfterLeave')?.()
        stage.set('hidden')
      }
    },
  })

  const shouldRender = () => stage() !== 'hidden'

  // The `height` ternary's final `: {}` tail fires only for the transient
  // entering/leaving stage during a live re-render — reachable only when
  // mounted + animating (real Chromium: kinetic.browser.test.tsx). SSR is
  // one-shot at entered (height:auto) / hidden (height:0px). Split across
  // lines so a single `/* v8 ignore next */` targets ONLY the unreachable
  // tail, leaving the two SSR-covered `?` arms measured.
  const wrapperStyle: CSSProperties = {
    ...(htmlProps.style as CSSProperties),
    ...(stage() !== 'entered' ? { overflow: 'hidden' } : {}),
    ...(stage() === 'hidden'
      ? { height: '0px' }
      : stage() === 'entered'
        ? { height: 'auto' }
        : /* v8 ignore next */ {}),
  }

  // Initially-visible Collapses keep the original Show-gated inner content,
  // preserving the runtime-unmount semantic that frees the inner subtree
  // when the collapse is closed long-term. The SSR bug fires only when
  // `show: () => false` at setup — the outer wrapper renders (with
  // `height: 0; overflow: hidden`) but its children are stripped by the
  // inner `<Show when={false}>` → empty wrapper in the prerendered HTML.
  // Bad for SEO / social scrapers / accessibility / no-JS.
  //
  // Mirrors the fix shape applied to `<Transition>`,
  // `TransitionRenderer`, and `TransitionItem`. Ecosystem norm:
  // content is structural, animation is visual.
  //
  // For initially-hidden Collapses, the inner content always renders —
  // the outer wrapper's `height: 0px; overflow: hidden` already provides
  // the visual hiding (genuinely layout-safe — no flex slot collapse;
  // the outer wrapper participates in flex as a 0-height box, which is
  // the standard CSS collapse behavior). When `show` flips true, the
  // existing `watch(stage)` measures `content.scrollHeight` and animates
  // height from 0 → that value — no change to the animation path.
  //
  // Trade-off: for initially-hidden Collapses, the inner subtree is
  // ALWAYS mounted (never unmounted after a later close). Initially-
  // visible Collapses keep the unmount behavior. Matches the trade-off
  // documented across the other three kinetic renderers.
  const wasInitiallyShown = show()
  const innerContent = wasInitiallyShown ? (
    <Show when={shouldRender}>
      <div ref={contentRef}>{children}</div>
    </Show>
  ) : (
    <div ref={contentRef}>{children}</div>
  )

  // mergeProps (descriptor-preserving) instead of `{ ...htmlProps }` —
  // every non-style HTML attr keeps its reactive getter; ref + the
  // collapse-controlled style come last so they win (mergeProps is
  // last-source-wins). The one-time `htmlProps.style` read above that
  // seeds wrapperStyle is intentional: collapse OWNS the style prop
  // (height/overflow are animation-driven), so a static merge of the
  // user's initial style with the collapse overrides is correct here.
  return h(
    config.tag,
    mergeProps(htmlProps, { ref: wrapperRef, style: wrapperStyle }),
    innerContent,
  )
}

export default CollapseRenderer
