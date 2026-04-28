import { h } from './h'
import type { ComponentFn, Props, VNode, VNodeChild } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

export interface DynamicProps extends Props {
  component: ComponentFn | string
}

export function Dynamic(props: DynamicProps): VNode | null {
  const { component, children, ...rest } = props as DynamicProps & { children?: unknown }
  if (__DEV__ && !component) {
    // oxlint-disable-next-line no-console
    console.warn('[Pyreon] <Dynamic> received a falsy `component` prop. Nothing will be rendered.')
  }
  if (!component) return null
  // Children must NOT remain in props. When `component` is a string tag
  // (e.g. <Dynamic component="h3">x</Dynamic>), runtime-dom's prop applier
  // forwards every prop key to setAttribute, so a leaked `children` prop
  // crashes with `setAttribute('children', ...)`. Re-emit them as h() rest
  // args so they land in vnode.children, which is where both string-tag
  // mounts and component-merge expect them.
  if (children === undefined) {
    return h(component as string | ComponentFn, rest as Props)
  }
  if (Array.isArray(children)) {
    return h(component as string | ComponentFn, rest as Props, ...(children as VNodeChild[]))
  }
  return h(component as string | ComponentFn, rest as Props, children as VNodeChild)
}
