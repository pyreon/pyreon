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
  /* v8 ignore next 4 — defensive default-value fallbacks */
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
        /* v8 ignore next — reverseLeave ternary combinatorics */
        const staggerIndex = !own.show() && reverseLeave ? count - 1 - index : index
        const delay = staggerIndex * interval

        return (
          <Transition
            key={(child as VNode & { key?: string | number }).key ?? index}
            show={own.show}
            appear={appear}
            timeout={timeout + delay}
            {...transitionProps}
            /* v8 ignore next — reverseLeave ternary + last-index check combinatorics */
            onAfterLeave={index === (reverseLeave ? 0 : count - 1) ? own.onAfterLeave : undefined}
          >
            {cloneVNode(child, {
              style: {
                ...((child.props as Record<string, unknown>)?.style as CSSProperties | undefined),
                '--stagger-index': staggerIndex,
                '--stagger-interval': `${interval}ms`,
                transitionDelay: `${delay}ms`,
              } as CSSProperties,
            })}
          </Transition>
        )
      })}
    </>
  )
}

export default Stagger
