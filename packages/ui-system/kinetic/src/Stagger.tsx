import type { VNode } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import Transition from './Transition'
import type { CSSProperties, StaggerProps } from './types'
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
  const interval = own.interval ?? 50
  const reverseLeave = own.reverseLeave ?? false
  const appear = own.appear ?? false
  const timeout = own.timeout ?? 5000

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

        return (
          <Transition
            key={(child as VNode & { key?: string | number }).key ?? index}
            show={own.show}
            appear={appear}
            timeout={timeout + maxDelay}
            {...transitionProps}
            onAfterLeave={index === (reverseLeave ? 0 : count - 1) ? own.onAfterLeave : undefined}
          >
            {cloneVNode(child, {
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
            })}
          </Transition>
        )
      })}
    </>
  )
}

export default Stagger
