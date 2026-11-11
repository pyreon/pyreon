import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { readLive, resolveLive } from '../live-prop'
import type { CSSProperties, TransitionCallbacks } from '../types'
import { childProps, flattenChildren } from '../child-shape'
import { cloneVNode } from '../utils'
import TransitionItem from './TransitionItem'
import type { KineticConfig } from './types'

type StaggerRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  show: () => boolean
  /** Construction-time — a first-mount question, spent once the ref wires up. */
  appear?: boolean | undefined
  /** Live: the animation-end deadline is re-armed per cycle. */
  timeout?: number | (() => number | undefined) | undefined
  /** Construction-time — baked into each child's static delay style below. */
  interval?: number | undefined
  /** Construction-time — decides which child owns `onAfterLeave`, once. */
  reverseLeave?: boolean | undefined
  /** A LIVE HOLDER — read each entry through `readLive` at the point of call. */
  callbacks: Partial<TransitionCallbacks>
  children: VNode[] | (() => unknown)
}

/**
 * Renders children with staggered enter/exit animation.
 * config.tag wraps the staggered children as a container element.
 * Each child is individually animated via TransitionItem.
 */
const StaggerRenderer = ({
  config,
  htmlProps,
  show,
  appear,
  timeout,
  interval,
  reverseLeave,
  callbacks,
  children,
}: StaggerRendererProps): VNode | null => {
  // `interval` / `reverseLeave` are construction-time: the `.map()` below runs
  // ONCE over an already-resolved child array and bakes each child's delay into
  // a static style object. `timeout` is live — it is re-armed per cycle — so it
  // travels down as an accessor rather than a resolved number.
  const effectiveAppear = appear ?? config.appear ?? false
  const effectiveTimeout = () => resolveLive(timeout) ?? config.timeout ?? 5000
  const effectiveInterval = interval ?? config.interval ?? 50
  const effectiveReverseLeave = reverseLeave ?? config.reverseLeave ?? false

  // Every animatable child, whatever its shape: unwrapped accessors (nested —
  // the compiler wraps the forwarded `children` again), flattened arrays and
  // fragments, and compiled static markup (`<li>Install</li>` is a pre-built
  // `_tpl` item, not a VNode). Filtering on `'type' in child` dropped that last
  // shape, so a stagger over literal children rendered an empty container.
  const childArray = flattenChildren(children)
  const count = childArray.length

  const staggeredChildren = childArray.map((child, index) => {
    // Enter is ALWAYS forward; `reverseLeave` mirrors ONLY the leave order
    // (last-entered leaves first). Separate enter/leave delays, picked per
    // phase by `setTransition`. NOT gated on mount-time `show()` (the old bug
    // made `reverseLeave` a no-op whenever `show` was true at mount).
    const enterDelay = index * effectiveInterval
    const leaveDelay = (effectiveReverseLeave ? count - 1 - index : index) * effectiveInterval
    const maxDelay = enterDelay > leaveDelay ? enterDelay : leaveDelay

    return (
      <TransitionItem
        key={(child as { key?: string | number | null }).key ?? index}
        show={show}
        appear={effectiveAppear}
        timeout={() => effectiveTimeout() + maxDelay}
        enterStyle={config.enterStyle}
        enterToStyle={config.enterToStyle}
        enterTransition={config.enterTransition}
        leaveStyle={config.leaveStyle}
        leaveToStyle={config.leaveToStyle}
        leaveTransition={config.leaveTransition}
        enter={config.enter}
        enterFrom={config.enterFrom}
        enterTo={config.enterTo}
        leave={config.leave}
        leaveFrom={config.leaveFrom}
        leaveTo={config.leaveTo}
        // WHICH child owns the callback is construction-time (an index in a
        // resolved array); WHAT the callback is, is not — forward a thunk that
        // re-reads the live holder, instead of the value this setup-time map
        // would otherwise freeze.
        onAfterLeave={
          index === (effectiveReverseLeave ? 0 : count - 1)
            ? () => readLive<TransitionCallbacks['onAfterLeave']>(callbacks, 'onAfterLeave')?.()
            : undefined
        }
      >
        {cloneVNode(child as VNode, {
          style: {
            ...(childProps(child).style as CSSProperties | undefined),
            '--stagger-index': index,
            '--stagger-interval': `${effectiveInterval}ms`,
            // Stable delay sources — survive the `transition` shorthand reset
            // AND the `transition=''` reset at 'entered'; `setTransition`
            // restores `transition-delay` from `--kinetic-delay` on enter and
            // `--kinetic-leave-delay` on leave.
            '--kinetic-delay': `${enterDelay}ms`,
            '--kinetic-leave-delay': `${leaveDelay}ms`,
            transitionDelay: `${enterDelay}ms`,
          } as CSSProperties,
        })}
      </TransitionItem>
    )
  })

  // Pass htmlProps by reference — `{ ...htmlProps }` value-copies, firing
  // any reactive getter the kinetic split preserved (frozen attr forever).
  // runtime-dom's applyProps detects the getter descriptor on the live
  // object and wraps it in renderEffect.
  return h(config.tag, htmlProps, ...staggeredChildren)
}

export default StaggerRenderer
