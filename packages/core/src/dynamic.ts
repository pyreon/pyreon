import type { ComponentFn, Props, VNode } from "./types"
import { h } from "./h"

export interface DynamicProps extends Props {
  component: ComponentFn | string
}

export function Dynamic(props: DynamicProps): VNode | null {
  const { component, ...rest } = props
  if (!component) return null
  return h(component as string | ComponentFn, rest as Props)
}
