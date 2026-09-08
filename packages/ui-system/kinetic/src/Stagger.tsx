import type { VNode } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { readLive, readLiveValue } from './live-prop'
import { showAccessorFrom } from './show-accessor'
import Transition from './Transition'
import type { CSSProperties, StaggerProps, TransitionCallbacks } from './types'
import { cloneVNode, resolveChildren } from './utils'

const isVNode = (child: unknown): child is VNode =>
  child != null && typeof child === 'object' && 'type' in (child as object)

const Stagger = (props: StaggerProps): VNode | null => {
  const [own, transitionProps] = splitProps(props, [
    'show',
    'interval',
    'reverseLeave',
    'appear',
    'timeout',
    'children',
    'onAfterLeave',
  ])
  // An ACCESSOR, not `own.show`: the map below runs at setup, so forwarding the
  // VALUE would fire the compiler's `_rp` getter once and hand every child
  // `<Transition>` a frozen boolean — the same freeze `showAccessorFrom` exists
  // to prevent, one level up. `<Transition>` normalizes the function form.
  const showAcc = showAccessorFrom(own)
  // CONSTRUCTION-TIME. The `.map()` below runs ONCE over an already-resolved
  // child array and bakes each child's delay into a static style object;
  // `reverseLeave` only decides WHICH index owns `onAfterLeave`, also once.
  // A live value would need a function-valued `style` on children that may be
  // COMPONENTS — changing what `props.style` is for the child.
  const interval = own.interval ?? 50
  const reverseLeave = own.reverseLeave ?? false
  // CONSTRUCTION-TIME: a first-mount question (see `<Transition>`).
  const appear = own.appear ?? false
  // LIVE: each child re-arms its own deadline per cycle, so forward a thunk.
  const timeout = () => readLiveValue<number>(own, 'timeout') ?? 5000

  // Unwrap the compiler's `() => x` accessor wrap — see `resolveChildren`
  // jsdoc. Parallel to the `StaggerRenderer` fix (internal kinetic-mode
  // renderer) — same iteration shape, same fix.
  const resolved = resolveChildren(own.children)
  const childArray = (Array.isArray(resolved) ? resolved : [resolved]).filter(isVNode)
  const count = childArray.length

  return (
    <>
      {childArray.map((child, index) => {
        // Enter is ALWAYS forward (item 0 first). `reverseLeave` reverses ONLY
        // the LEAVE order — the last-entered item leaves first — so the leave
        // delay is mirrored. Both delays are baked as separate custom props;
        // `setTransition` picks the leave one on the leave phase. The reversal
        // must NOT be gated on mount-time `show()` (the old bug: with `show`
        // true at mount the branch never fired, so `reverseLeave` was a no-op).
        const enterDelay = index * interval
        const leaveDelay = (reverseLeave ? count - 1 - index : index) * interval
        const maxDelay = enterDelay > leaveDelay ? enterDelay : leaveDelay

        // `h` + `mergeProps`, NOT `<Transition {...transitionProps}>`. This
        // package's own JSX is compiled by the ordinary automatic runtime, not
        // by the Pyreon compiler, so a JSX spread here is a plain object spread
        // — it READS every key, firing each `_rp` getter `splitProps` had just
        // preserved and freezing every forwarded transition prop at setup.
        // `mergeProps` copies DESCRIPTORS, so the getters reach `<Transition>`
        // alive. (See anti-patterns: "Manual `Object.assign`/`{...source}` in
        // plain JS is NOT covered — use `mergeProps`/`splitProps`.")
        return h(
          Transition,
          mergeProps(transitionProps as Record<string, unknown>, {
            key: (child as VNode & { key?: string | number }).key ?? index,
            show: showAcc,
            appear,
            timeout: () => timeout() + maxDelay,
            // WHICH child owns the callback is construction-time (an index in a
            // resolved array); WHAT the callback is, is not — forward a thunk
            // that re-reads the live holder rather than the value this
            // setup-time map would otherwise freeze.
            onAfterLeave:
              index === (reverseLeave ? 0 : count - 1)
                ? () => readLive<TransitionCallbacks['onAfterLeave']>(own, 'onAfterLeave')?.()
                : undefined,
          }),
          cloneVNode(child, {
              style: {
                ...((child.props as Record<string, unknown>)?.style as CSSProperties | undefined),
                '--stagger-index': index,
                '--stagger-interval': `${interval}ms`,
                // Stable delay sources — survive the `transition` shorthand
                // reset AND the `transition=''` reset at 'entered'; kinetic's
                // `setTransition` restores `transition-delay` from `--kinetic-delay`
                // on enter and `--kinetic-leave-delay` on leave (see utils.ts).
                '--kinetic-delay': `${enterDelay}ms`,
                '--kinetic-leave-delay': `${leaveDelay}ms`,
                transitionDelay: `${enterDelay}ms`,
            } as CSSProperties,
          }),
        )
      })}
    </>
  )
}

export default Stagger
