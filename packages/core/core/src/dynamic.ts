import { h } from './h'
import type { ComponentFn, Props, VNode } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true

export interface DynamicProps extends Props {
  component: ComponentFn | string
}

export function Dynamic(props: DynamicProps): VNode | null {
  const { component, ...rest } = props
  if (__DEV__ && !component) {
    // oxlint-disable-next-line no-console
    console.warn('[Pyreon] <Dynamic> received a falsy `component` prop. Nothing will be rendered.')
  }
  if (!component) return null
  return h(component as string | ComponentFn, rest as Props)
}
