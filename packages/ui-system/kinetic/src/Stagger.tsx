import type { VNode } from '@pyreon/core'
import Transition from './Transition'
import type { CSSProperties, StaggerProps } from './types'
import { cloneVNode } from './utils'

const isVNode = (child: unknown): child is VNode =>
  child != null && typeof child === 'object' && 'type' in (child as object)

const Stagger = ({
  show,
  interval = 50,
  reverseLeave = false,
  appear = false,
  timeout = 5000,
  children,
  onAfterLeave,
  ...transitionProps
}: StaggerProps): VNode | null => {
  const childArray = (Array.isArray(children) ? children : [children]).filter(isVNode)
  const count = childArray.length

  return (
    <>
      {childArray.map((child, index) => {
        const staggerIndex = !show() && reverseLeave ? count - 1 - index : index
        const delay = staggerIndex * interval

        return (
          <Transition
            key={(child as VNode & { key?: string | number }).key ?? index}
            show={show}
            appear={appear}
            timeout={timeout + delay}
            {...transitionProps}
            onAfterLeave={index === (reverseLeave ? 0 : count - 1) ? onAfterLeave : undefined}
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
