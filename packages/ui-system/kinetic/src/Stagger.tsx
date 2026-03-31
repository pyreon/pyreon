import type { VNode } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import Transition from './Transition'
import type { CSSProperties, StaggerProps } from './types'
import { cloneVNode } from './utils'

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

  const childArray = (Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)
  const count = childArray.length

  return (
    <>
      {childArray.map((child, index) => {
        const staggerIndex = !own.show() && reverseLeave ? count - 1 - index : index
        const delay = staggerIndex * interval

        return (
          <Transition
            key={(child as VNode & { key?: string | number }).key ?? index}
            show={own.show}
            appear={appear}
            timeout={timeout + delay}
            {...transitionProps}
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
