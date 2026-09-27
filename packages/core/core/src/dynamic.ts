import { h } from './h'
import { splitProps } from './props'
import type { ComponentFn, Props, VNode, VNodeChild } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
export interface DynamicProps extends Props {
  component: ComponentFn | string
}

export function Dynamic(props: DynamicProps): VNodeChild {
  // splitProps, not a destructure: the compiler lowers
  // `<Dynamic component={components[current()]} label={label()} />` to
  // GETTER-backed props, and a destructure read each one once at setup — so
  // the documented "when `component` changes, the previous component unmounts
  // and the new one mounts" never happened, and every forwarded prop froze.
  // splitProps copies descriptors, so `rest` keeps its getters all the way to
  // the rendered element / component.
  const [own, rest] = splitProps(props as DynamicProps & { children?: unknown }, [
    'component',
    'children',
  ])
  const render = (): VNode | null => {
    const component = own.component
    if (process.env.NODE_ENV !== 'production' && !component) {
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
    const children = own.children
    if (children === undefined) {
      return h(component as string | ComponentFn, rest as Props)
    }
    if (Array.isArray(children)) {
      return h(component as string | ComponentFn, rest as Props, ...(children as VNodeChild[]))
    }
    return h(component as string | ComponentFn, rest as Props, children as VNodeChild)
  }
  // Only a getter-backed `component` can change. A static one renders once as a
  // plain VNode — the dominant shape, unchanged; a reactive one is returned as
  // an accessor, so a change remounts the new component in place.
  return Object.getOwnPropertyDescriptor(props, 'component')?.get ? render : render()
}
