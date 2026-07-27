import { h } from './h'
import type { ComponentFn, Props, VNode, VNodeChild } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
export interface DynamicProps extends Props {
  component: ComponentFn | string
}

export function Dynamic(props: DynamicProps): VNode | null {
  const { component, children, ...rest } = props as DynamicProps & { children?: unknown }
  if (process.env.NODE_ENV !== 'production' && !component) {
    // oxlint-disable-next-line no-console
    console.warn('[Pyreon] <Dynamic> received a falsy `component` prop. Nothing will be rendered.')
  }
  if (!component) return null
  // Children must NOT remain in props.
  if (children === undefined) {
    return h(component as string | ComponentFn, rest as Props)
  }
  if (Array.isArray(children)) {
    return h(component as string | ComponentFn, rest as Props, ...(children as VNodeChild[]))
  }
  return h(component as string | ComponentFn, rest as Props, children as VNodeChild)
}
